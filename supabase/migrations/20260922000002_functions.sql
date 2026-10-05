-- ============================================================
-- Functions, triggers & RPCs
-- ============================================================

-- ── JWT claim helpers (driven by custom_access_token_hook) ──
create or replace function public.jwt_app_role()
returns text language sql stable as $$
  select coalesce(auth.jwt() ->> 'app_role', '')
$$;

create or replace function public.jwt_outlet_id()
returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'outlet_id', '')::uuid
$$;

create or replace function public.jwt_staff_id()
returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'staff_id', '')::uuid
$$;

create or replace function public.jwt_is_multi_outlet()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() ->> 'is_multi_outlet')::boolean, false)
$$;

-- ── Auth hook: inject app_role / outlet_id / staff_id into JWT ──
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  claims jsonb;
  staff_row record;
begin
  select s.role, s.outlet_id, s.id, s.is_multi_outlet
    into staff_row
    from public.staff s
   where s.user_id = (event ->> 'user_id')::uuid
     and s.is_active
   limit 1;

  claims := coalesce(event -> 'claims', '{}'::jsonb);

  if staff_row.id is null then
    claims := jsonb_set(claims, '{app_role}', to_jsonb(''::text));
    claims := jsonb_set(claims, '{outlet_id}', 'null'::jsonb);
    claims := jsonb_set(claims, '{staff_id}', 'null'::jsonb);
    claims := jsonb_set(claims, '{is_multi_outlet}', 'false'::jsonb);
  else
    claims := jsonb_set(claims, '{app_role}', to_jsonb(staff_row.role::text));
    claims := jsonb_set(claims, '{outlet_id}', to_jsonb(staff_row.outlet_id));
    claims := jsonb_set(claims, '{staff_id}', to_jsonb(staff_row.id));
    claims := jsonb_set(claims, '{is_multi_outlet}', to_jsonb(staff_row.is_multi_outlet));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- ── Audit helper (internal) ────────────────────────────────
create or replace function public._audit(
  p_staff_id uuid,
  p_outlet_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb default null
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.audit_logs (staff_id, outlet_id, action, entity_type, entity_id, metadata)
  values (p_staff_id, p_outlet_id, p_action, p_entity_type, p_entity_id, p_metadata);
$$;

-- ── Denormalize order_items (outlet, menu snapshot, station) ─
create or replace function public.fill_order_item_denorm()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.outlet_id is null then
    select o.outlet_id into new.outlet_id from public.orders o where o.id = new.order_id;
  end if;

  if new.menu_name is null or new.station is null then
    select mi.name, coalesce(mc.station, 'kitchen')
      into new.menu_name, new.station
      from public.menu_items mi
      left join public.menu_categories mc on mc.id = mi.category_id
     where mi.id = new.menu_item_id;
  end if;

  new.menu_name := coalesce(new.menu_name, 'Item');
  new.station := coalesce(new.station, 'kitchen');
  return new;
end;
$$;

create trigger trg_fill_order_item_denorm
before insert on public.order_items
for each row execute function public.fill_order_item_denorm();

-- ── Recompute totals (tax + service charge) ────────────────
create or replace function public.recompute_order_totals(p_order_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.orders o
     set tax_amount = round((o.subtotal - o.discount_amount) * ot.tax_percent / 100.0, 2),
         total = round(
           (o.subtotal - o.discount_amount)
           + ((o.subtotal - o.discount_amount) * ot.tax_percent / 100.0)
           + ((o.subtotal - o.discount_amount) * ot.service_charge_percent / 100.0), 2)
    from public.outlets ot
   where o.id = p_order_id
     and ot.id = o.outlet_id;
$$;

-- ── Stock deduction / restock on payment status change ─────
create or replace function public.deduct_stock_on_payment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'paid' and old.status = 'open' then
    insert into public.stock_transactions (ingredient_id, order_id, qty_change, reason, created_by)
    select mii.ingredient_id, new.id, -(mii.qty_required * oi.qty), 'sale', new.created_by
      from public.order_items oi
      join public.menu_item_ingredients mii on mii.menu_item_id = oi.menu_item_id
     where oi.order_id = new.id;

    update public.ingredients i
       set current_stock = i.current_stock + agg.delta
      from (
        select st.ingredient_id, sum(st.qty_change) as delta
          from public.stock_transactions st
         where st.order_id = new.id and st.reason = 'sale'
         group by st.ingredient_id
      ) agg
     where agg.ingredient_id = i.id;
  elsif new.status = 'void' and old.status = 'paid' then
    insert into public.stock_transactions (ingredient_id, order_id, qty_change, reason, created_by)
    select mii.ingredient_id, new.id, (mii.qty_required * oi.qty), 'void_restock', new.voided_by
      from public.order_items oi
      join public.menu_item_ingredients mii on mii.menu_item_id = oi.menu_item_id
     where oi.order_id = new.id;

    update public.ingredients i
       set current_stock = i.current_stock + agg.delta
      from (
        select st.ingredient_id, sum(st.qty_change) as delta
          from public.stock_transactions st
         where st.order_id = new.id and st.reason = 'void_restock'
         group by st.ingredient_id
      ) agg
     where agg.ingredient_id = i.id;
  end if;

  return new;
end;
$$;

create trigger trg_deduct_stock
after update on public.orders
for each row execute function public.deduct_stock_on_payment();

-- ── Realtime broadcast: minimal KDS payload (no prices) ────
create or replace function public.broadcast_order_item_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_outlet uuid;
  v_order public.orders;
  v_label text;
  v_payload jsonb;
begin
  v_outlet := coalesce(new.outlet_id, old.outlet_id);

  select o.* into v_order
    from public.orders o
   where o.id = coalesce(new.order_id, old.order_id);

  if v_order.table_id is not null then
    select dt.label into v_label from public.dining_tables dt where dt.id = v_order.table_id;
  end if;

  v_payload := jsonb_build_object(
    'id', coalesce(new.id, old.id),
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'order_type', v_order.order_type,
    'table_label', v_label,
    'menu_name', coalesce(new.menu_name, old.menu_name),
    'qty', coalesce(new.qty, old.qty),
    'notes', coalesce(new.notes, old.notes),
    'station', coalesce(new.station, old.station),
    'kitchen_status', coalesce(new.kitchen_status, old.kitchen_status),
    'op', tg_op
  );

  perform realtime.send(v_payload, 'order_item_change', 'kds:' || v_outlet::text, true);
  return null;
end;
$$;

create trigger trg_broadcast_order_item
after insert or update on public.order_items
for each row execute function public.broadcast_order_item_change();

create or replace function public.broadcast_order_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_label text;
  v_payload jsonb;
begin
  if new.table_id is not null then
    select dt.label into v_label from public.dining_tables dt where dt.id = new.table_id;
  end if;

  v_payload := jsonb_build_object(
    'id', new.id,
    'order_number', new.order_number,
    'status', new.status,
    'order_type', new.order_type,
    'table_label', v_label,
    'op', tg_op
  );

  perform realtime.send(v_payload, 'order_change', 'kds:' || new.outlet_id::text, true);
  return null;
end;
$$;

create trigger trg_broadcast_order
after insert or update on public.orders
for each row execute function public.broadcast_order_change();

-- ── create_order: atomic, server-priced, idempotent ────────
create or replace function public.create_order(
  p_client_id uuid,
  p_table_id uuid,
  p_order_type public.order_type,
  p_items jsonb
) returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_staff public.staff;
  v_shift public.shifts;
  v_order public.orders;
  v_outlet public.outlets;
  v_table public.dining_tables;
  v_item jsonb;
  v_menu public.menu_items;
  v_station text;
  v_qty int;
  v_variant_total numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_order_item_id uuid;
  v_opt record;
begin
  select * into v_staff from public.staff where id = public.jwt_staff_id();
  if v_staff.id is null or not v_staff.is_active then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_staff.role not in ('cashier','manager') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- idempotent offline sync
  if p_client_id is not null then
    select * into v_order from public.orders where client_id = p_client_id;
    if v_order.id is not null then
      return v_order;
    end if;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_order';
  end if;

  select * into v_outlet from public.outlets where id = v_staff.outlet_id and is_active;
  if v_outlet.id is null then
    raise exception 'outlet_unavailable';
  end if;

  select * into v_shift
    from public.shifts
   where staff_id = v_staff.id and closed_at is null
   for update;
  if v_shift.id is null then
    raise exception 'no_open_shift';
  end if;

  if p_order_type = 'dine_in' then
    if p_table_id is null then
      raise exception 'table_required';
    end if;
    select * into v_table
      from public.dining_tables
     where id = p_table_id and outlet_id = v_outlet.id
     for update;
    if v_table.id is null then
      raise exception 'table_not_found';
    end if;
    if v_table.current_order_id is not null then
      raise exception 'table_occupied';
    end if;
  else
    p_table_id := null;
  end if;

  insert into public.orders (client_id, outlet_id, shift_id, table_id, order_type, created_by)
  values (p_client_id, v_outlet.id, v_shift.id, p_table_id, p_order_type, v_staff.id)
  returning * into v_order;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select * into v_menu
      from public.menu_items
     where id = (v_item ->> 'menu_item_id')::uuid
       and outlet_id = v_outlet.id
       and is_available;
    if v_menu.id is null then
      raise exception 'menu_item_unavailable';
    end if;

    v_qty := coalesce((v_item ->> 'qty')::int, 1);
    if v_qty < 1 then
      raise exception 'invalid_qty';
    end if;

    select coalesce(mc.station, 'kitchen') into v_station
      from public.menu_items mi
      left join public.menu_categories mc on mc.id = mi.category_id
     where mi.id = v_menu.id;

    insert into public.order_items (order_id, outlet_id, menu_item_id, menu_name, station, qty, unit_price, notes)
    values (v_order.id, v_outlet.id, v_menu.id, v_menu.name, coalesce(v_station, 'kitchen'), v_qty,
            v_menu.base_price, nullif(v_item ->> 'notes', ''))
    returning id into v_order_item_id;

    v_variant_total := 0;

    if v_item ? 'variant_option_ids' and jsonb_typeof(v_item -> 'variant_option_ids') = 'array' then
      for v_opt in
        select vo.id, vo.name, vo.extra_price, vg.menu_item_id
          from jsonb_array_elements_text(v_item -> 'variant_option_ids') as t(opt_id)
          join public.variant_options vo on vo.id = t.opt_id::uuid
          join public.variant_groups vg on vg.id = vo.variant_group_id
      loop
        if v_opt.menu_item_id <> v_menu.id then
          raise exception 'variant_mismatch';
        end if;

        insert into public.order_item_variants (order_item_id, variant_option_id, variant_name, extra_price)
        values (v_order_item_id, v_opt.id, v_opt.name, v_opt.extra_price);

        v_variant_total := v_variant_total + v_opt.extra_price;
      end loop;
    end if;

    if exists (
      select 1
        from public.variant_groups vg
       where vg.menu_item_id = v_menu.id
         and vg.is_required
         and (
           select count(*)
             from public.order_item_variants oiv
             join public.variant_options vo2 on vo2.id = oiv.variant_option_id
             join public.variant_groups vg2 on vg2.id = vo2.variant_group_id
            where oiv.order_item_id = v_order_item_id
              and vg2.id = vg.id
         ) < greatest(vg.min_select, 1)
    ) then
      raise exception 'required_variant_missing';
    end if;

    update public.order_items
       set unit_price = v_menu.base_price + v_variant_total
     where id = v_order_item_id;

    v_subtotal := v_subtotal + ((v_menu.base_price + v_variant_total) * v_qty);
  end loop;

  update public.orders set subtotal = v_subtotal where id = v_order.id;
  perform public.recompute_order_totals(v_order.id);

  select * into v_order from public.orders where id = v_order.id;

  if p_table_id is not null then
    update public.dining_tables
       set status = 'occupied', current_order_id = v_order.id
     where id = p_table_id;
  end if;

  perform public._audit(v_staff.id, v_outlet.id, 'order.create', 'orders', v_order.id,
                        jsonb_build_object('total', v_order.total, 'order_type', p_order_type));

  return v_order;
end;
$$;

-- ── add items to an existing open order (same table session) ─
create or replace function public.add_order_items(
  p_order_id uuid,
  p_items jsonb
) returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_staff public.staff;
  v_order public.orders;
  v_outlet public.outlets;
  v_item jsonb;
  v_menu public.menu_items;
  v_station text;
  v_qty int;
  v_variant_total numeric(12,2);
  v_order_item_id uuid;
  v_opt record;
begin
  select * into v_staff from public.staff where id = public.jwt_staff_id();
  if v_staff.id is null or not v_staff.is_active or v_staff.role not in ('cashier','manager') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'order_not_found'; end if;
  if v_order.outlet_id <> v_staff.outlet_id then raise exception 'not_authorized'; end if;
  if v_order.status <> 'open' then raise exception 'order_not_open'; end if;

  select * into v_outlet from public.outlets where id = v_order.outlet_id;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_order';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select * into v_menu
      from public.menu_items
     where id = (v_item ->> 'menu_item_id')::uuid
       and outlet_id = v_outlet.id
       and is_available;
    if v_menu.id is null then raise exception 'menu_item_unavailable'; end if;

    v_qty := coalesce((v_item ->> 'qty')::int, 1);
    if v_qty < 1 then raise exception 'invalid_qty'; end if;

    select coalesce(mc.station, 'kitchen') into v_station
      from public.menu_items mi
      left join public.menu_categories mc on mc.id = mi.category_id
     where mi.id = v_menu.id;

    insert into public.order_items (order_id, outlet_id, menu_item_id, menu_name, station, qty, unit_price, notes)
    values (v_order.id, v_outlet.id, v_menu.id, v_menu.name, coalesce(v_station, 'kitchen'), v_qty,
            v_menu.base_price, nullif(v_item ->> 'notes', ''))
    returning id into v_order_item_id;

    v_variant_total := 0;

    if v_item ? 'variant_option_ids' and jsonb_typeof(v_item -> 'variant_option_ids') = 'array' then
      for v_opt in
        select vo.id, vo.name, vo.extra_price, vg.menu_item_id
          from jsonb_array_elements_text(v_item -> 'variant_option_ids') as t(opt_id)
          join public.variant_options vo on vo.id = t.opt_id::uuid
          join public.variant_groups vg on vg.id = vo.variant_group_id
      loop
        if v_opt.menu_item_id <> v_menu.id then raise exception 'variant_mismatch'; end if;
        insert into public.order_item_variants (order_item_id, variant_option_id, variant_name, extra_price)
        values (v_order_item_id, v_opt.id, v_opt.name, v_opt.extra_price);
        v_variant_total := v_variant_total + v_opt.extra_price;
      end loop;
    end if;

    update public.order_items
       set unit_price = v_menu.base_price + v_variant_total
     where id = v_order_item_id;
  end loop;

  select coalesce(sum(oi.unit_price * oi.qty), 0) into v_order.subtotal
    from public.order_items oi where oi.order_id = v_order.id;

  update public.orders set subtotal = v_order.subtotal where id = v_order.id;
  perform public.recompute_order_totals(v_order.id);

  select * into v_order from public.orders where id = v_order.id;

  perform public._audit(v_staff.id, v_order.outlet_id, 'order.add_items', 'orders', v_order.id, null);

  return v_order;
end;
$$;

-- ── Discount (internal, supports PIN-approved override) ────
create or replace function public.apply_order_discount(
  p_order_id uuid,
  p_type text,
  p_value numeric,
  p_approved_by uuid
) returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.staff;
  v_order public.orders;
  v_outlet public.outlets;
  v_discount numeric(12,2);
begin
  if p_approved_by is not null then
    select * into v_actor from public.staff
     where id = p_approved_by and is_active and role = 'manager';
    if v_actor.id is null then
      raise exception 'invalid_approver' using errcode = '42501';
    end if;
  else
    select * into v_actor from public.staff where id = public.jwt_staff_id();
    if v_actor.id is null or not v_actor.is_active or v_actor.role not in ('cashier','manager') then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'order_not_found'; end if;
  if v_order.status <> 'open' then raise exception 'order_not_open'; end if;

  select * into v_outlet from public.outlets where id = v_order.outlet_id;

  -- manager of branch must belong to same outlet; owner (multi-outlet) allowed anywhere
  if not v_actor.is_multi_outlet and v_actor.outlet_id <> v_order.outlet_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_type = 'percent' then
    if p_value < 0 or p_value > 100 then raise exception 'invalid_discount'; end if;
    v_discount := round(v_order.subtotal * p_value / 100.0, 2);
  elsif p_type = 'nominal' then
    if p_value < 0 then raise exception 'invalid_discount'; end if;
    v_discount := round(p_value, 2);
  else
    raise exception 'invalid_discount_type';
  end if;

  if v_discount > v_order.subtotal then
    v_discount := v_order.subtotal;
  end if;

  if p_approved_by is null and v_discount > v_outlet.discount_approval_threshold then
    raise exception 'approval_required';
  end if;

  update public.orders
     set discount_amount = v_discount,
         discount_type = p_type,
         discount_value = p_value,
         discount_approved_by = p_approved_by
   where id = v_order.id;

  perform public.recompute_order_totals(v_order.id);

  select * into v_order from public.orders where id = v_order.id;

  perform public._audit(v_actor.id, v_order.outlet_id, 'discount.apply', 'orders', v_order.id,
                        jsonb_build_object('type', p_type, 'value', p_value, 'discount', v_discount,
                                           'approved_by', p_approved_by));

  return v_order;
end;
$$;

-- authenticated wrapper: actor from JWT, approval required above threshold
create or replace function public.apply_order_discount(
  p_order_id uuid,
  p_type text,
  p_value numeric
) returns public.orders
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.apply_order_discount(p_order_id, p_type, p_value, null::uuid);
$$;

-- ── Payment (atomic, idempotent) ───────────────────────────
create or replace function public.pay_order(
  p_order_id uuid,
  p_payments jsonb,
  p_idempotency_key text default null
) returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_staff public.staff;
  v_order public.orders;
  v_payment jsonb;
  v_sum numeric(12,2) := 0;
  v_method public.payment_method;
  v_amount numeric(12,2);
  v_existing uuid;
  v_idx int := 0;
begin
  select * into v_staff from public.staff where id = public.jwt_staff_id();
  if v_staff.id is null or not v_staff.is_active or v_staff.role not in ('cashier','manager') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'order_not_found'; end if;
  if v_order.outlet_id <> v_staff.outlet_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select order_id into v_existing
      from public.payments
     where idempotency_key like p_idempotency_key || ':%'
     limit 1;
    if v_existing is not null then
      select * into v_order from public.orders where id = v_existing;
      return v_order;
    end if;
  end if;

  if v_order.status <> 'open' then raise exception 'order_not_open'; end if;

  if p_payments is null or jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'no_payments';
  end if;

  for v_payment in select value from jsonb_array_elements(p_payments)
  loop
    v_idx := v_idx + 1;
    v_method := (v_payment ->> 'method')::public.payment_method;
    v_amount := (v_payment ->> 'amount')::numeric;
    if v_amount <= 0 then raise exception 'invalid_payment_amount'; end if;

    insert into public.payments (order_id, method, amount, reference_no, idempotency_key, gateway_response)
    values (
      v_order.id,
      v_method,
      v_amount,
      nullif(v_payment ->> 'reference_no', ''),
      case when p_idempotency_key is not null then p_idempotency_key || ':' || v_idx::text else null end,
      case when v_payment ? 'gateway_response' then v_payment -> 'gateway_response' else null end
    );

    v_sum := v_sum + v_amount;
  end loop;

  if v_sum < v_order.total - 0.005 then
    raise exception 'insufficient_payment: total=%, paid=%', v_order.total, v_sum;
  end if;

  update public.orders
     set status = 'paid', paid_at = now()
   where id = v_order.id
   returning * into v_order;

  update public.dining_tables
     set status = 'empty', current_order_id = null
   where current_order_id = v_order.id;

  perform public._audit(v_staff.id, v_order.outlet_id, 'order.pay', 'orders', v_order.id,
                        jsonb_build_object('total', v_order.total, 'paid', v_sum));

  return v_order;
end;
$$;

-- ── Void (internal, supports PIN-approved override) ────────
create or replace function public.void_order(
  p_order_id uuid,
  p_reason text,
  p_approved_by uuid
) returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.staff;
  v_order public.orders;
begin
  if p_approved_by is not null then
    select * into v_actor from public.staff
     where id = p_approved_by and is_active and role = 'manager';
    if v_actor.id is null then
      raise exception 'invalid_approver' using errcode = '42501';
    end if;
  else
    select * into v_actor from public.staff
     where id = public.jwt_staff_id() and is_active and role = 'manager';
    if v_actor.id is null then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'order_not_found'; end if;
  if v_order.status = 'void' then return v_order; end if;

  if not v_actor.is_multi_outlet and v_actor.outlet_id <> v_order.outlet_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.orders
     set status = 'void',
         voided_by = v_actor.id,
         void_reason = p_reason
   where id = v_order.id
   returning * into v_order;

  update public.dining_tables
     set status = 'empty', current_order_id = null
   where current_order_id = v_order.id;

  perform public._audit(v_actor.id, v_order.outlet_id, 'order.void', 'orders', v_order.id,
                        jsonb_build_object('reason', p_reason, 'approved_by', p_approved_by));

  return v_order;
end;
$$;

create or replace function public.void_order(
  p_order_id uuid,
  p_reason text
) returns public.orders
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.void_order(p_order_id, p_reason, null::uuid);
$$;

-- ── KDS state machine (server-authoritative) ───────────────
create or replace function public.set_kitchen_status(
  p_order_item_id uuid,
  p_new_status public.kitchen_status
) returns public.order_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.staff;
  v_item public.order_items;
  v_order public.orders;
  v_all_served boolean;
begin
  select * into v_actor from public.staff where id = public.jwt_staff_id();
  if v_actor.id is null or not v_actor.is_active or v_actor.role not in ('kitchen','manager') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_item from public.order_items where id = p_order_item_id for update;
  if v_item.id is null then raise exception 'item_not_found'; end if;

  if not v_actor.is_multi_outlet and v_actor.outlet_id <> v_item.outlet_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if not (
    (v_item.kitchen_status = 'new' and p_new_status = 'cooking')
    or (v_item.kitchen_status = 'cooking' and p_new_status = 'ready')
    or (v_item.kitchen_status = 'ready' and p_new_status = 'served')
  ) then
    raise exception 'invalid_transition: % -> %', v_item.kitchen_status, p_new_status;
  end if;

  select * into v_order from public.orders where id = v_item.order_id;
  if v_order.status = 'void' then
    raise exception 'order_void';
  end if;

  update public.order_items
     set kitchen_status = p_new_status,
         kitchen_status_updated_at = now(),
         kitchen_status_updated_by = v_actor.id
   where id = v_item.id
   returning * into v_item;

  if v_order.status = 'open' then
    select not exists (
      select 1 from public.order_items
       where order_id = v_order.id and kitchen_status <> 'served'
    ) into v_all_served;

    if v_all_served and v_order.table_id is not null then
      update public.dining_tables
         set status = 'unpaid'
       where id = v_order.table_id and status = 'occupied';
    end if;
  end if;

  return v_item;
end;
$$;

-- ── Shifts ─────────────────────────────────────────────────
create or replace function public.open_shift(p_opening_cash numeric)
returns public.shifts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_staff public.staff;
  v_shift public.shifts;
begin
  select * into v_staff from public.staff where id = public.jwt_staff_id();
  if v_staff.id is null or not v_staff.is_active then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_staff.role not in ('cashier','manager') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_staff.outlet_id is null then
    raise exception 'outlet_required';
  end if;
  if p_opening_cash is null or p_opening_cash < 0 then
    raise exception 'invalid_opening_cash';
  end if;

  select * into v_shift from public.shifts where staff_id = v_staff.id and closed_at is null;
  if v_shift.id is not null then
    return v_shift; -- idempotent: already open
  end if;

  insert into public.shifts (outlet_id, staff_id, opening_cash)
  values (v_staff.outlet_id, v_staff.id, p_opening_cash)
  returning * into v_shift;

  perform public._audit(v_staff.id, v_staff.outlet_id, 'shift.open', 'shifts', v_shift.id,
                        jsonb_build_object('opening_cash', p_opening_cash));

  return v_shift;
end;
$$;

create or replace function public.close_shift(p_shift_id uuid, p_closing_cash_actual numeric)
returns public.shifts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_staff public.staff;
  v_shift public.shifts;
  v_cash_sales numeric(12,2);
begin
  select * into v_staff from public.staff where id = public.jwt_staff_id();
  if v_staff.id is null or not v_staff.is_active then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_shift from public.shifts where id = p_shift_id for update;
  if v_shift.id is null then raise exception 'shift_not_found'; end if;
  if v_shift.closed_at is not null then return v_shift; end if;
  if v_shift.staff_id <> v_staff.id and not v_staff.is_multi_outlet then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select coalesce(sum(p.amount), 0) into v_cash_sales
    from public.payments p
    join public.orders o on o.id = p.order_id
   where o.shift_id = v_shift.id
     and o.status = 'paid'
     and p.method = 'cash';

  update public.shifts
     set closing_cash_expected = v_shift.opening_cash + v_cash_sales,
         closing_cash_actual = p_closing_cash_actual,
         closed_at = now()
   where id = v_shift.id
   returning * into v_shift;

  perform public._audit(v_staff.id, v_shift.outlet_id, 'shift.close', 'shifts', v_shift.id,
                        jsonb_build_object('expected', v_shift.closing_cash_expected,
                                           'actual', p_closing_cash_actual,
                                           'variance', v_shift.cash_variance));

  return v_shift;
end;
$$;

-- ── Manual stock adjustment ────────────────────────────────
create or replace function public.adjust_stock(
  p_ingredient_id uuid,
  p_qty_change numeric,
  p_reason text default 'manual_adjustment'
) returns public.ingredients
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_staff public.staff;
  v_ing public.ingredients;
begin
  select * into v_staff from public.staff where id = public.jwt_staff_id();
  if v_staff.id is null or not v_staff.is_active or v_staff.role <> 'manager' then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_ing from public.ingredients where id = p_ingredient_id for update;
  if v_ing.id is null then raise exception 'ingredient_not_found'; end if;
  if not v_staff.is_multi_outlet and v_staff.outlet_id <> v_ing.outlet_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.stock_transactions (ingredient_id, qty_change, reason, created_by)
  values (p_ingredient_id, p_qty_change, coalesce(p_reason, 'manual_adjustment'), v_staff.id);

  update public.ingredients
     set current_stock = current_stock + p_qty_change
   where id = p_ingredient_id
   returning * into v_ing;

  perform public._audit(v_staff.id, v_ing.outlet_id, 'stock.adjust', 'ingredients', v_ing.id,
                        jsonb_build_object('qty_change', p_qty_change, 'reason', p_reason));

  return v_ing;
end;
$$;
