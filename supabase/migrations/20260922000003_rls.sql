-- ============================================================
-- Row Level Security — outlet isolation, role enforcement
-- ============================================================

create or replace function public.can_access_outlet(p_outlet_id uuid)
returns boolean
language sql
stable
as $$
  select p_outlet_id is not null
     and (p_outlet_id = public.jwt_outlet_id() or public.jwt_is_multi_outlet())
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
as $$
  select public.jwt_app_role() = 'manager'
$$;

create or replace function public.is_cashier_or_manager()
returns boolean
language sql
stable
as $$
  select public.jwt_app_role() in ('cashier','manager')
$$;

-- ── outlets ────────────────────────────────────────────────
alter table public.outlets enable row level security;

create policy outlets_select on public.outlets
for select to authenticated
using (public.can_access_outlet(id));

create policy outlets_manage on public.outlets
for all to authenticated
using (public.jwt_is_multi_outlet())
with check (public.jwt_is_multi_outlet());

-- ── staff ──────────────────────────────────────────────────
alter table public.staff enable row level security;

create policy staff_select on public.staff
for select to authenticated
using (public.can_access_outlet(outlet_id));

create policy staff_insert on public.staff
for insert to authenticated
with check (public.is_manager() and (public.jwt_is_multi_outlet() or outlet_id = public.jwt_outlet_id()));

create policy staff_update on public.staff
for update to authenticated
using (public.is_manager() and (public.jwt_is_multi_outlet() or outlet_id = public.jwt_outlet_id()))
with check (public.is_manager() and (public.jwt_is_multi_outlet() or outlet_id = public.jwt_outlet_id()));

create policy staff_delete on public.staff
for delete to authenticated
using (public.jwt_is_multi_outlet());

-- pin material must never be readable by API clients (service_role keeps access)
revoke select (pin_hash, failed_pin_attempts, locked_until) on public.staff from anon, authenticated;

-- ── shifts ─────────────────────────────────────────────────
alter table public.shifts enable row level security;

create policy shifts_select on public.shifts
for select to authenticated
using (
  public.can_access_outlet(outlet_id)
  and (public.jwt_app_role() in ('cashier','manager'))
);

-- writes only via RPC (security definer)

-- ── dining_tables ──────────────────────────────────────────
alter table public.dining_tables enable row level security;

create policy dining_tables_select on public.dining_tables
for select to authenticated
using (public.can_access_outlet(outlet_id) and public.is_cashier_or_manager());

create policy dining_tables_manage on public.dining_tables
for all to authenticated
using (public.is_manager() and (public.jwt_is_multi_outlet() or outlet_id = public.jwt_outlet_id()))
with check (public.is_manager() and (public.jwt_is_multi_outlet() or outlet_id = public.jwt_outlet_id()));

-- ── menu_categories ────────────────────────────────────────
alter table public.menu_categories enable row level security;

create policy menu_categories_select on public.menu_categories
for select to authenticated
using (public.can_access_outlet(outlet_id) and public.is_cashier_or_manager());

create policy menu_categories_manage on public.menu_categories
for all to authenticated
using (public.is_manager() and (public.jwt_is_multi_outlet() or outlet_id = public.jwt_outlet_id()))
with check (public.is_manager() and (public.jwt_is_multi_outlet() or outlet_id = public.jwt_outlet_id()));

-- ── menu_items ─────────────────────────────────────────────
alter table public.menu_items enable row level security;

create policy menu_items_select on public.menu_items
for select to authenticated
using (public.can_access_outlet(outlet_id) and public.is_cashier_or_manager());

create policy menu_items_manage on public.menu_items
for all to authenticated
using (public.is_manager() and (public.jwt_is_multi_outlet() or outlet_id = public.jwt_outlet_id()))
with check (public.is_manager() and (public.jwt_is_multi_outlet() or outlet_id = public.jwt_outlet_id()));

-- ── variant_groups ─────────────────────────────────────────
alter table public.variant_groups enable row level security;

create policy variant_groups_select on public.variant_groups
for select to authenticated
using (
  exists (
    select 1 from public.menu_items mi
     where mi.id = menu_item_id and public.can_access_outlet(mi.outlet_id)
  )
  and public.is_cashier_or_manager()
);

create policy variant_groups_manage on public.variant_groups
for all to authenticated
using (
  public.is_manager()
  and exists (
    select 1 from public.menu_items mi
     where mi.id = menu_item_id and (public.jwt_is_multi_outlet() or mi.outlet_id = public.jwt_outlet_id())
  )
)
with check (
  public.is_manager()
  and exists (
    select 1 from public.menu_items mi
     where mi.id = menu_item_id and (public.jwt_is_multi_outlet() or mi.outlet_id = public.jwt_outlet_id())
  )
);

-- ── variant_options ────────────────────────────────────────
alter table public.variant_options enable row level security;

create policy variant_options_select on public.variant_options
for select to authenticated
using (
  exists (
    select 1 from public.variant_groups vg
     join public.menu_items mi on mi.id = vg.menu_item_id
    where vg.id = variant_group_id and public.can_access_outlet(mi.outlet_id)
  )
  and public.is_cashier_or_manager()
);

create policy variant_options_manage on public.variant_options
for all to authenticated
using (
  public.is_manager()
  and exists (
    select 1 from public.variant_groups vg
     join public.menu_items mi on mi.id = vg.menu_item_id
    where vg.id = variant_group_id and (public.jwt_is_multi_outlet() or mi.outlet_id = public.jwt_outlet_id())
  )
)
with check (
  public.is_manager()
  and exists (
    select 1 from public.variant_groups vg
     join public.menu_items mi on mi.id = vg.menu_item_id
    where vg.id = variant_group_id and (public.jwt_is_multi_outlet() or mi.outlet_id = public.jwt_outlet_id())
  )
);

-- ── ingredients ────────────────────────────────────────────
alter table public.ingredients enable row level security;

create policy ingredients_select on public.ingredients
for select to authenticated
using (public.can_access_outlet(outlet_id) and public.is_manager());

create policy ingredients_manage on public.ingredients
for all to authenticated
using (public.is_manager() and (public.jwt_is_multi_outlet() or outlet_id = public.jwt_outlet_id()))
with check (public.is_manager() and (public.jwt_is_multi_outlet() or outlet_id = public.jwt_outlet_id()));

-- ── menu_item_ingredients ──────────────────────────────────
alter table public.menu_item_ingredients enable row level security;

create policy menu_item_ingredients_select on public.menu_item_ingredients
for select to authenticated
using (
  public.is_manager()
  and exists (
    select 1 from public.menu_items mi
     where mi.id = menu_item_id and public.can_access_outlet(mi.outlet_id)
  )
);

create policy menu_item_ingredients_manage on public.menu_item_ingredients
for all to authenticated
using (
  public.is_manager()
  and exists (
    select 1 from public.menu_items mi
     where mi.id = menu_item_id and (public.jwt_is_multi_outlet() or mi.outlet_id = public.jwt_outlet_id())
  )
)
with check (
  public.is_manager()
  and exists (
    select 1 from public.menu_items mi
     where mi.id = menu_item_id and (public.jwt_is_multi_outlet() or mi.outlet_id = public.jwt_outlet_id())
  )
);

-- ── orders ─────────────────────────────────────────────────
alter table public.orders enable row level security;

create policy orders_select on public.orders
for select to authenticated
using (public.can_access_outlet(outlet_id) and public.is_cashier_or_manager());

-- writes only via RPC (security definer)

-- ── order_items ────────────────────────────────────────────
alter table public.order_items enable row level security;

create policy order_items_select on public.order_items
for select to authenticated
using (public.can_access_outlet(outlet_id) and public.is_cashier_or_manager());

-- writes only via RPC (security definer); kitchen updates through set_kitchen_status

-- ── order_item_variants ────────────────────────────────────
alter table public.order_item_variants enable row level security;

create policy order_item_variants_select on public.order_item_variants
for select to authenticated
using (
  public.is_cashier_or_manager()
  and exists (
    select 1 from public.order_items oi
     where oi.id = order_item_id and public.can_access_outlet(oi.outlet_id)
  )
);

-- ── payments ───────────────────────────────────────────────
alter table public.payments enable row level security;

create policy payments_select on public.payments
for select to authenticated
using (
  public.is_cashier_or_manager()
  and exists (
    select 1 from public.orders o
     where o.id = order_id and public.can_access_outlet(o.outlet_id)
  )
);

-- writes only via RPC (security definer)

-- ── stock_transactions ─────────────────────────────────────
alter table public.stock_transactions enable row level security;

create policy stock_transactions_select on public.stock_transactions
for select to authenticated
using (
  public.is_manager()
  and exists (
    select 1 from public.ingredients i
     where i.id = ingredient_id and public.can_access_outlet(i.outlet_id)
  )
);

-- writes only via RPC (security definer)

-- ── audit_logs (append-only) ───────────────────────────────
alter table public.audit_logs enable row level security;

create policy audit_logs_select on public.audit_logs
for select to authenticated
using (public.is_manager() and public.can_access_outlet(outlet_id));

revoke update, delete on public.audit_logs from anon, authenticated;
