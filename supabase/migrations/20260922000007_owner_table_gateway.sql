-- ============================================================
-- Owner login fix, optional table, gateway payment states
-- ============================================================

-- ── 1. Auth hook: jsonb_set(..., NULL) nulls the whole claims object.
--       Owner has outlet_id = null, so coalesce to JSON null.
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
    claims := jsonb_set(claims, '{outlet_id}', coalesce(to_jsonb(staff_row.outlet_id), 'null'::jsonb));
    claims := jsonb_set(claims, '{staff_id}', coalesce(to_jsonb(staff_row.id), 'null'::jsonb));
    claims := jsonb_set(claims, '{is_multi_outlet}', coalesce(to_jsonb(staff_row.is_multi_outlet), 'false'::jsonb));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from anon, authenticated, public;

-- ── 2. Table is optional for every order type ──────────────
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

  -- table is optional: dine-in may run without a table (counter/queue)
  if p_order_type = 'takeaway' then
    p_table_id := null;
  elsif p_table_id is not null then
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
                        jsonb_build_object('total', v_order.total, 'order_type', p_order_type,
                                           'table_id', p_table_id));

  return v_order;
end;
$$;

-- ── 3. Payments: pending gateway state ─────────────────────
create type public.payment_status as enum ('pending','paid','failed');

alter table public.payments
  add column if not exists status public.payment_status not null default 'paid';

create index if not exists payments_order_status_idx on public.payments (order_id, status);

-- pending payment created before redirecting/displaying QR to the customer
create or replace function public.create_gateway_payment(
  p_order_id uuid,
  p_method public.payment_method,
  p_amount numeric,
  p_reference_no text,
  p_gateway_response jsonb,
  p_idempotency_key text
) returns public.payments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_staff public.staff;
  v_order public.orders;
  v_payment public.payments;
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
  if v_order.status <> 'open' then raise exception 'order_not_open'; end if;
  if p_amount <= 0 then raise exception 'invalid_payment_amount'; end if;

  if p_idempotency_key is not null then
    select * into v_payment from public.payments where idempotency_key = p_idempotency_key;
    if v_payment.id is not null then
      return v_payment;
    end if;
  end if;

  insert into public.payments (order_id, method, amount, reference_no, idempotency_key, gateway_response, status)
  values (p_order_id, p_method, p_amount, p_reference_no, p_idempotency_key, p_gateway_response, 'pending')
  returning * into v_payment;

  return v_payment;
end;
$$;

-- webhook / status polling settlement. service_role only.
drop function if exists public.settle_gateway_payment(uuid, public.payment_method, numeric, text, jsonb);

create or replace function public.settle_gateway_payment(
  p_order_id uuid,
  p_method public.payment_method,
  p_amount numeric,
  p_reference_no text,
  p_gateway_response jsonb default null,
  p_status public.payment_status default 'paid'
) returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders;
  v_paid_total numeric(12,2);
begin
  if auth.role() <> 'service_role' then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'order_not_found'; end if;

  if p_status = 'failed' then
    update public.payments
       set status = 'failed',
           gateway_response = coalesce(p_gateway_response, gateway_response)
     where reference_no = p_reference_no and status = 'pending';
    return v_order;
  end if;

  if p_reference_no is not null and exists (
    select 1 from public.payments where reference_no = p_reference_no and status = 'paid'
  ) then
    return v_order;
  end if;

  update public.payments
     set status = 'paid',
         gateway_response = coalesce(p_gateway_response, gateway_response)
   where reference_no = p_reference_no and status = 'pending';

  if not found then
    if v_order.status <> 'open' then
      return v_order;
    end if;
    insert into public.payments (order_id, method, amount, reference_no, gateway_response, status)
    values (p_order_id, p_method, p_amount, p_reference_no, p_gateway_response, 'paid');
  end if;

  select coalesce(sum(amount), 0) into v_paid_total
    from public.payments
   where order_id = p_order_id and status = 'paid';

  if v_order.status = 'open' and v_paid_total >= v_order.total - 0.005 then
    update public.orders
       set status = 'paid', paid_at = now()
     where id = v_order.id
     returning * into v_order;

    update public.dining_tables
       set status = 'empty', current_order_id = null
     where current_order_id = v_order.id;

    perform public._audit(null, v_order.outlet_id, 'order.pay.gateway', 'orders', v_order.id,
                          jsonb_build_object('reference_no', p_reference_no, 'amount', p_amount));
  end if;

  return v_order;
end;
$$;

revoke execute on function public.settle_gateway_payment(uuid, public.payment_method, numeric, text, jsonb, public.payment_status)
  from anon, authenticated, public;
grant execute on function public.settle_gateway_payment(uuid, public.payment_method, numeric, text, jsonb, public.payment_status)
  to service_role;

revoke execute on function public.create_gateway_payment(uuid, public.payment_method, numeric, text, jsonb, text)
  from anon, public;
grant execute on function public.create_gateway_payment(uuid, public.payment_method, numeric, text, jsonb, text)
  to authenticated;
