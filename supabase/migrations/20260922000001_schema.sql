-- ============================================================
-- POS & KDS — Core schema
-- ============================================================

-- ── Outlets ────────────────────────────────────────────────
create table public.outlets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  timezone text not null default 'Asia/Jakarta',
  tax_percent numeric(5,2) not null default 0,
  service_charge_percent numeric(5,2) not null default 0,
  discount_approval_threshold numeric(12,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Staff ──────────────────────────────────────────────────
create type public.staff_role as enum ('cashier','kitchen','manager');

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  outlet_id uuid references public.outlets(id) on delete restrict,
  staff_code text not null,
  full_name text not null,
  role public.staff_role not null,
  pin_hash text not null,
  failed_pin_attempts smallint not null default 0,
  locked_until timestamptz,
  is_multi_outlet boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- staff_code unique per outlet; owners (outlet_id null) unique globally
create unique index staff_outlet_code_uniq on public.staff (outlet_id, staff_code);
create unique index staff_global_code_uniq on public.staff (staff_code) where outlet_id is null;

-- ── Shifts ─────────────────────────────────────────────────
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete restrict,
  staff_id uuid not null references public.staff(id) on delete restrict,
  opening_cash numeric(12,2) not null default 0,
  closing_cash_expected numeric(12,2),
  closing_cash_actual numeric(12,2),
  cash_variance numeric(12,2) generated always as (closing_cash_actual - closing_cash_expected) stored,
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

create unique index shifts_one_open_per_staff on public.shifts (staff_id) where closed_at is null;

-- ── Dining tables ──────────────────────────────────────────
create type public.table_status as enum ('empty','occupied','unpaid');

create table public.dining_tables (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  label text not null,
  status public.table_status not null default 'empty',
  current_order_id uuid,
  unique (outlet_id, label)
);

-- ── Menu ───────────────────────────────────────────────────
create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  name text not null,
  station text not null default 'kitchen', -- 'kitchen' | 'bar'
  sort_order int not null default 0
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  category_id uuid references public.menu_categories(id) on delete set null,
  name text not null,
  base_price numeric(12,2) not null check (base_price >= 0),
  is_available boolean not null default true,
  image_url text,
  created_at timestamptz not null default now()
);

create index menu_items_outlet_idx on public.menu_items (outlet_id, is_available);

create table public.variant_groups (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  name text not null,
  is_required boolean not null default false,
  min_select smallint not null default 0,
  max_select smallint not null default 1
);

create table public.variant_options (
  id uuid primary key default gen_random_uuid(),
  variant_group_id uuid not null references public.variant_groups(id) on delete cascade,
  name text not null,
  extra_price numeric(12,2) not null default 0
);

-- ── Stock / Ingredients ────────────────────────────────────
create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  name text not null,
  unit text not null,
  current_stock numeric(12,3) not null default 0,
  min_stock_alert numeric(12,3) not null default 0,
  created_at timestamptz not null default now(),
  unique (outlet_id, name)
);

create table public.menu_item_ingredients (
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  qty_required numeric(12,3) not null check (qty_required > 0),
  primary key (menu_item_id, ingredient_id)
);

-- ── Orders ─────────────────────────────────────────────────
create type public.order_type as enum ('dine_in','takeaway');
create type public.order_status as enum ('open','paid','void');
create type public.kitchen_status as enum ('new','cooking','ready','served');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity,
  client_id uuid,                          -- client-generated, idempotent offline sync
  outlet_id uuid not null references public.outlets(id) on delete restrict,
  shift_id uuid not null references public.shifts(id) on delete restrict,
  table_id uuid references public.dining_tables(id) on delete set null,
  order_type public.order_type not null,
  status public.order_status not null default 'open',
  subtotal numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  discount_type text,                      -- 'percent' | 'nominal'
  discount_value numeric(12,2),
  discount_approved_by uuid references public.staff(id),
  tax_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  created_by uuid not null references public.staff(id) on delete restrict,
  voided_by uuid references public.staff(id) on delete restrict,
  void_reason text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create unique index orders_client_id_uniq on public.orders (client_id) where client_id is not null;
create index orders_outlet_status_created_idx on public.orders (outlet_id, status, created_at desc);
create index orders_shift_idx on public.orders (shift_id);
create index orders_open_tables_idx on public.orders (outlet_id, table_id) where status = 'open';

alter table public.dining_tables
  add constraint fk_dining_tables_current_order
  foreign key (current_order_id) references public.orders(id) on delete set null;

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete restrict, -- denormalized for realtime/RLS
  menu_item_id uuid not null references public.menu_items(id) on delete restrict,
  menu_name text not null,                 -- snapshot
  station text not null default 'kitchen',
  qty smallint not null default 1 check (qty > 0),
  unit_price numeric(12,2) not null,       -- snapshot (base + variant extras)
  notes text,
  kitchen_status public.kitchen_status not null default 'new',
  kitchen_status_updated_at timestamptz not null default now(),
  kitchen_status_updated_by uuid references public.staff(id) on delete set null,
  created_at timestamptz not null default now()
);

create index order_items_order_idx on public.order_items (order_id);
create index order_items_outlet_kitchen_idx on public.order_items (outlet_id, kitchen_status)
  where kitchen_status <> 'served';

create table public.order_item_variants (
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  variant_option_id uuid not null references public.variant_options(id) on delete restrict,
  variant_name text not null,              -- snapshot
  extra_price numeric(12,2) not null default 0,
  primary key (order_item_id, variant_option_id)
);

-- ── Payments ───────────────────────────────────────────────
create type public.payment_method as enum ('cash','qris','card','ewallet');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  method public.payment_method not null,
  amount numeric(12,2) not null check (amount > 0),
  reference_no text,
  idempotency_key text,
  gateway_response jsonb,
  paid_at timestamptz not null default now()
);

create unique index payments_reference_no_uniq on public.payments (reference_no) where reference_no is not null;
create unique index payments_idempotency_key_uniq on public.payments (idempotency_key) where idempotency_key is not null;
create index payments_order_idx on public.payments (order_id);

-- ── Stock transactions (audit trail) ───────────────────────
create table public.stock_transactions (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  order_id uuid references public.orders(id) on delete set null,
  qty_change numeric(12,3) not null,
  reason text not null default 'sale', -- 'sale','void_restock','manual_adjustment','restock'
  created_by uuid references public.staff(id) on delete set null,
  created_at timestamptz not null default now()
);

create index stock_transactions_ingredient_idx on public.stock_transactions (ingredient_id, created_at desc);
create index stock_transactions_order_idx on public.stock_transactions (order_id);

-- ── Audit log (append-only) ────────────────────────────────
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references public.staff(id) on delete set null,
  outlet_id uuid references public.outlets(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_outlet_created_idx on public.audit_logs (outlet_id, created_at desc);
