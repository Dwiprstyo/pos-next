-- ============================================================
-- KDS view: expose outlet_id so boards can filter per outlet
-- ============================================================

drop view if exists public.kds_order_items_view;

create view public.kds_order_items_view
with (security_invoker = off) as
select
  oi.outlet_id,
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

create index if not exists order_items_outlet_open_idx
  on public.order_items (outlet_id, kitchen_status)
  where kitchen_status <> 'served';
