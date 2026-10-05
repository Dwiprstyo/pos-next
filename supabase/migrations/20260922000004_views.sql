-- ============================================================
-- Views & reporting
-- ============================================================

-- KDS board: price-free projection. Definer view so the kitchen role
-- never needs SELECT on orders/order_items/payments.
create or replace view public.kds_order_items_view
with (security_invoker = off) as
select
  oi.id,
  oi.order_id,
  o.order_number,
  o.order_type,
  o.status as order_status,
  dt.label as table_label,
  oi.menu_name,
  oi.qty,
  oi.notes,
  oi.station,
  oi.kitchen_status,
  oi.kitchen_status_updated_at,
  oi.created_at as item_created_at,
  o.created_at as order_created_at,
  (
    select string_agg(vo.name, ', ' order by vg.name, vo.name)
    from public.order_item_variants oiv
    join public.variant_options vo on vo.id = oiv.variant_option_id
    join public.variant_groups vg on vg.id = vo.variant_group_id
    where oiv.order_item_id = oi.id
  ) as variants
from public.order_items oi
join public.orders o on o.id = oi.order_id
left join public.dining_tables dt on dt.id = o.table_id
where o.status <> 'void'
  and oi.kitchen_status <> 'served';

grant select on public.kds_order_items_view to authenticated;

-- ── Daily sales summary (materialized) ─────────────────────
create materialized view public.daily_sales_summary as
select
  o.outlet_id,
  ot.name as outlet_name,
  (o.paid_at at time zone ot.timezone)::date as sale_date,
  count(distinct o.id) as orders_count,
  coalesce(sum(o.subtotal), 0) as gross_sales,
  coalesce(sum(o.discount_amount), 0) as discount_total,
  coalesce(sum(o.tax_amount), 0) as tax_total,
  coalesce(sum(o.total), 0) as net_sales,
  coalesce(sum(pay.cash_total), 0) as cash_sales,
  coalesce(sum(pay.non_cash_total), 0) as non_cash_sales
from public.orders o
join public.outlets ot on ot.id = o.outlet_id
left join (
  select
    p.order_id,
    sum(case when p.method = 'cash' then p.amount else 0 end) as cash_total,
    sum(case when p.method <> 'cash' then p.amount else 0 end) as non_cash_total
  from public.payments p
  group by p.order_id
) pay on pay.order_id = o.id
where o.status = 'paid'
  and o.paid_at is not null
group by o.outlet_id, ot.name, (o.paid_at at time zone ot.timezone)::date;

create unique index daily_sales_summary_outlet_date_uniq
  on public.daily_sales_summary (outlet_id, sale_date);

create or replace function public.refresh_daily_sales_summary()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.jwt_app_role() <> 'manager' and auth.role() <> 'service_role' then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  refresh materialized view public.daily_sales_summary;
end;
$$;

-- ── Sales report access (manager/owner only) ───────────────
create or replace function public.daily_sales(
  p_from date,
  p_to date,
  p_outlet_id uuid default null
) returns table (
  outlet_id uuid,
  outlet_name text,
  sale_date date,
  orders_count bigint,
  gross_sales numeric,
  discount_total numeric,
  tax_total numeric,
  net_sales numeric,
  cash_sales numeric,
  non_cash_sales numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_outlet uuid;
begin
  if public.jwt_app_role() <> 'manager' then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_outlet := coalesce(p_outlet_id, public.jwt_outlet_id());

  if not public.jwt_is_multi_outlet() and (v_outlet is null or v_outlet <> public.jwt_outlet_id()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query
  select d.outlet_id, d.outlet_name, d.sale_date, d.orders_count,
         d.gross_sales, d.discount_total, d.tax_total, d.net_sales,
         d.cash_sales, d.non_cash_sales
    from public.daily_sales_summary d
   where d.sale_date between p_from and p_to
     and (v_outlet is null or d.outlet_id = v_outlet)
   order by d.sale_date desc, d.outlet_name;
end;
$$;

create or replace function public.top_selling_items(
  p_from date,
  p_to date,
  p_outlet_id uuid default null,
  p_limit int default 20
) returns table (
  menu_item_id uuid,
  menu_name text,
  qty_sold bigint,
  revenue numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_outlet uuid;
begin
  if public.jwt_app_role() <> 'manager' then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_outlet := coalesce(p_outlet_id, public.jwt_outlet_id());

  if not public.jwt_is_multi_outlet() and (v_outlet is null or v_outlet <> public.jwt_outlet_id()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query
  select oi.menu_item_id, oi.menu_name, sum(oi.qty)::bigint as qty_sold,
         sum(oi.unit_price * oi.qty) as revenue
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
   where o.status = 'paid'
     and o.paid_at is not null
     and (o.paid_at at time zone 'Asia/Jakarta')::date between p_from and p_to
     and (v_outlet is null or o.outlet_id = v_outlet)
   group by oi.menu_item_id, oi.menu_name
   order by 3 desc
   limit greatest(p_limit, 1);
end;
$$;

-- ── Shift reconciliation helper ────────────────────────────
create or replace function public.shift_summary(p_shift_id uuid)
returns table (
  opening_cash numeric,
  cash_sales numeric,
  non_cash_sales numeric,
  total_sales numeric,
  orders_count bigint,
  expected_cash numeric,
  closing_cash_actual numeric,
  cash_variance numeric,
  opened_at timestamptz,
  closed_at timestamptz
)
language plpgsql
stable
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

  select * into v_shift from public.shifts where id = p_shift_id;
  if v_shift.id is null then raise exception 'shift_not_found'; end if;

  if not v_staff.is_multi_outlet and v_staff.outlet_id <> v_shift.outlet_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query
  select
    v_shift.opening_cash,
    coalesce(sum(case when p.method = 'cash' then p.amount else 0 end), 0),
    coalesce(sum(case when p.method <> 'cash' then p.amount else 0 end), 0),
    coalesce(sum(p.amount), 0),
    count(distinct o.id),
    v_shift.opening_cash + coalesce(sum(case when p.method = 'cash' then p.amount else 0 end), 0),
    v_shift.closing_cash_actual,
    v_shift.cash_variance,
    v_shift.opened_at,
    v_shift.closed_at
  from public.orders o
  left join public.payments p on p.order_id = o.id
  where o.shift_id = v_shift.id
    and o.status = 'paid';
end;
$$;
