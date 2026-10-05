# PRD: Sistem POS & KDS Adaptif Berbasis Web
**Stack**: Next.js 15 (App Router) + Supabase (Postgres, Auth, Realtime, Storage) + TypeScript

---

## 1. Ringkasan
Multi-outlet POS + Kitchen Display System. Realtime order sync FOH→KDS, role-based access (Kasir/Waiter, Dapur, Manager/Owner), shift & cash management, auto stock deduction, sales reporting.

---

## 2. Tech Stack Decision

| Layer | Choice | Alasan |
|---|---|---|
| Frontend | Next.js 15 App Router, RSC + Server Actions | SSR untuk report, streaming untuk KDS board |
| State (client) | Zustand (cart/order draft) + Supabase Realtime subscription | Hindari over-fetch, cart lokal sebelum commit ke DB |
| DB | Supabase Postgres | RLS native, Realtime out-of-box |
| Auth | Supabase Auth (custom flow, bukan default email/pass UI) | Lihat §4 |
| Realtime | Supabase Realtime (Postgres CDC via `orders`, `order_items`) | KDS push update |
| Offline resiliency | IndexedDB queue (Dexie) untuk POS saat koneksi putus, sync on reconnect | Kasir tidak boleh blocking saat outage |
| Styling | Tailwind CSS v4 + shadcn/ui (headless components di atas Radix) | Utility-first, konsisten dgn RSC, no CSS-in-JS runtime overhead |
| Payment gateway | Abstraction layer (Strategy pattern) → QRIS/e-wallet provider adapter | Ganti provider tanpa ubah core |
| Deployment | Vercel (app) + Supabase hosted | — |

---

## 3. Role & Akses (3 level)

```
staff_role enum: 'cashier' | 'kitchen' | 'manager'
```

| Role | Akses |
|---|---|
| cashier | POS UI, shift open/close, terima pembayaran, tidak bisa edit harga/stok |
| kitchen | KDS board only, update order_item status, tidak lihat payment/total |
| manager | Semua outlet (kalau owner) / assigned outlet (kalau manager cabang), CRUD menu, stok, laporan, void approval |

RLS akan enforce ini di level row, **bukan** hanya di UI.

---

## 4. Auth Design — PIN Login (bukan default Supabase email/pass flow)

Supabase Auth tidak native support "outlet + PIN". Desain:

1. **Staff record** disimpan di tabel `staff` dengan `pin_hash` (bcrypt/argon2), terpisah dari `auth.users`.
2. Setiap staff tetap punya 1 row di `auth.users` (dibuat via Admin API saat staff onboarding, email dummy `staffid@outlet.internal` atau real email jika ada).
3. **Login flow**:
   - Client: pilih outlet → pilih/scan staff ID → input PIN.
   - Server Action / Edge Function `POST /auth/pin-login`:
     - Lookup `staff` by `staff_code + outlet_id`.
     - Verify `pin_hash` (argon2.verify).
     - Rate-limit + lockout (5x gagal → lock 15 menit) — simpan counter di `staff.failed_pin_attempts` + `locked_until`.
     - Jika valid: panggil Supabase Admin API `generateLink` (type `magiclink`) **atau** sign JWT custom dengan `service_role` key yang match struktur `auth.jwt()`, set sebagai session cookie via `@supabase/ssr`.
   - Custom claims (`role`, `outlet_id`, `staff_id`) di-inject via **Auth Hook** (`custom_access_token_hook`) supaya kebaca di `auth.jwt()` untuk RLS — tidak perlu extra query di setiap policy.
4. Session pendek (shift-length, e.g. 12 jam) — auto logout saat shift ditutup.

```sql
-- Auth Hook (Postgres function, registered di Supabase Dashboard > Auth > Hooks)
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  claims jsonb;
  staff_row record;
begin
  select role, outlet_id, id into staff_row
  from public.staff where user_id = (event->>'user_id')::uuid;

  claims := event->'claims';
  claims := jsonb_set(claims, '{app_role}', to_jsonb(staff_row.role));
  claims := jsonb_set(claims, '{outlet_id}', to_jsonb(staff_row.outlet_id));
  claims := jsonb_set(claims, '{staff_id}', to_jsonb(staff_row.id));

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;
```

---

## 5. Database Schema

```sql
-- ── Outlets ─────────────────────────────
create table outlets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  timezone text default 'Asia/Jakarta',
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ── Staff ───────────────────────────────
create type staff_role as enum ('cashier','kitchen','manager');

create table staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id), -- null jika belum aktivasi
  outlet_id uuid references outlets(id),  -- null jika manager multi-outlet (owner)
  staff_code text not null,
  full_name text not null,
  role staff_role not null,
  pin_hash text not null,
  failed_pin_attempts smallint default 0,
  locked_until timestamptz,
  is_multi_outlet boolean default false, -- true untuk owner
  is_active boolean default true,
  created_at timestamptz default now(),
  unique(outlet_id, staff_code)
);

-- ── Shifts ──────────────────────────────
create table shifts (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid references outlets(id) not null,
  staff_id uuid references staff(id) not null,
  opening_cash numeric(12,2) not null,
  closing_cash_expected numeric(12,2), -- computed saat close
  closing_cash_actual numeric(12,2),
  cash_variance numeric(12,2) generated always as (closing_cash_actual - closing_cash_expected) stored,
  opened_at timestamptz default now(),
  closed_at timestamptz
);

-- ── Tables (dine-in) ────────────────────
create type table_status as enum ('empty','occupied','unpaid');

create table dining_tables (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid references outlets(id) not null,
  label text not null, -- "T1", "T2"
  status table_status default 'empty',
  current_order_id uuid, -- FK ditambah setelah orders dibuat
  unique(outlet_id, label)
);

-- ── Menu ────────────────────────────────
create table menu_categories (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid references outlets(id) not null,
  name text not null,
  sort_order int default 0
);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid references outlets(id) not null,
  category_id uuid references menu_categories(id),
  name text not null,
  base_price numeric(12,2) not null,
  is_available boolean default true,
  image_url text,
  created_at timestamptz default now()
);

-- variant group, e.g. "Level Pedas", "Suhu" — bisa required/single-select atau multi
create table variant_groups (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid references menu_items(id) not null,
  name text not null,
  is_required boolean default false,
  min_select smallint default 0,
  max_select smallint default 1
);

create table variant_options (
  id uuid primary key default gen_random_uuid(),
  variant_group_id uuid references variant_groups(id) not null,
  name text not null,          -- "Level 3", "Es"
  extra_price numeric(12,2) default 0
);

-- ── Stock / Ingredients ─────────────────
create table ingredients (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid references outlets(id) not null,
  name text not null,
  unit text not null,          -- "gram","pcs","ml"
  current_stock numeric(12,3) not null default 0,
  min_stock_alert numeric(12,3) default 0
);

-- resep: menu_item butuh berapa ingredient
create table menu_item_ingredients (
  menu_item_id uuid references menu_items(id) not null,
  ingredient_id uuid references ingredients(id) not null,
  qty_required numeric(12,3) not null,
  primary key (menu_item_id, ingredient_id)
);

-- ── Orders ──────────────────────────────
create type order_type as enum ('dine_in','takeaway');
create type order_status as enum ('open','paid','void');
create type kitchen_status as enum ('new','cooking','ready','served');

create table orders (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid references outlets(id) not null,
  shift_id uuid references shifts(id) not null,
  table_id uuid references dining_tables(id),
  order_type order_type not null,
  status order_status default 'open',
  subtotal numeric(12,2) not null default 0,
  discount_amount numeric(12,2) default 0,
  tax_amount numeric(12,2) default 0,
  total numeric(12,2) not null default 0,
  created_by uuid references staff(id) not null, -- audit
  voided_by uuid references staff(id),
  void_reason text,
  created_at timestamptz default now(),
  paid_at timestamptz
);

alter table dining_tables
  add constraint fk_current_order foreign key (current_order_id) references orders(id);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) not null,
  menu_item_id uuid references menu_items(id) not null,
  qty smallint not null default 1,
  unit_price numeric(12,2) not null, -- snapshot harga saat order
  notes text,                        -- catatan khusus dapur
  kitchen_status kitchen_status default 'new',
  kitchen_status_updated_at timestamptz default now(),
  kitchen_status_updated_by uuid references staff(id)
);

create table order_item_variants (
  order_item_id uuid references order_items(id) not null,
  variant_option_id uuid references variant_options(id) not null,
  extra_price numeric(12,2) not null,
  primary key (order_item_id, variant_option_id)
);

-- ── Payments ────────────────────────────
create type payment_method as enum ('cash','qris','card','ewallet');

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) not null,
  method payment_method not null,
  amount numeric(12,2) not null,
  reference_no text,     -- ID transaksi gateway
  gateway_response jsonb,
  paid_at timestamptz default now()
);

-- ── Stock Transaction (audit deduction) ─
create table stock_transactions (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid references ingredients(id) not null,
  order_id uuid references orders(id),
  qty_change numeric(12,3) not null, -- negatif = deduction
  reason text, -- 'sale','manual_adjustment','restock'
  created_at timestamptz default now()
);

-- ── Audit Log (generic) ─────────────────
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff(id),
  outlet_id uuid references outlets(id),
  action text not null,       -- 'order.void','discount.apply','menu.price_change'
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz default now()
);
```

### Trigger: auto stock deduction on order paid
```sql
create or replace function deduct_stock_on_payment()
returns trigger language plpgsql as $$
begin
  if new.status = 'paid' and old.status = 'open' then
    insert into stock_transactions (ingredient_id, order_id, qty_change, reason)
    select mii.ingredient_id, new.id, -(mii.qty_required * oi.qty), 'sale'
    from order_items oi
    join menu_item_ingredients mii on mii.menu_item_id = oi.menu_item_id
    where oi.order_id = new.id;

    update ingredients i
    set current_stock = current_stock - st.qty_change * -1
    from stock_transactions st
    where st.ingredient_id = i.id and st.order_id = new.id;
  end if;
  return new;
end;
$$;

create trigger trg_deduct_stock
after update on orders
for each row execute function deduct_stock_on_payment();
```

---

## 6. RLS Policy Pattern

Semua tabel outlet-scoped pakai pola sama, drive dari JWT claims (`outlet_id`, `app_role`, `staff_id`):

```sql
alter table orders enable row level security;

-- cashier/kitchen/manager hanya lihat data outlet sendiri; owner (is_multi_outlet) lihat semua
create policy outlet_isolation on orders
for select using (
  outlet_id = (auth.jwt()->>'outlet_id')::uuid
  or exists (select 1 from staff where id = (auth.jwt()->>'staff_id')::uuid and is_multi_outlet)
);

-- kasir: insert order di outlet sendiri
create policy cashier_insert_order on orders
for insert with check (
  outlet_id = (auth.jwt()->>'outlet_id')::uuid
  and (auth.jwt()->>'app_role') in ('cashier','manager')
);

-- kitchen: hanya boleh update kitchen_status di order_items, tidak boleh sentuh orders/payments
create policy kitchen_update_status on order_items
for update using (
  (auth.jwt()->>'app_role') = 'kitchen'
) with check (
  (auth.jwt()->>'app_role') = 'kitchen'
);
-- kolom sensitif (price) diproteksi via view terpisah untuk KDS, bukan expose order_items mentah dgn unit_price
```

**Penting**: KDS board query lewat **view** `kds_order_items_view` yang exclude `unit_price`, `total`, join ke `orders` tanpa expose payment info — defense in depth, jangan andalkan RLS kolom saja (Postgres RLS itu row-level, bukan column-level; pakai view + `security_invoker` atau revoke column grants).

---

## 7. Realtime Architecture (KDS)

- Client KDS subscribe ke Postgres Changes: `postgres_changes` event on `order_items` filter `outlet_id=eq.<id>` (via join broadcast dari `orders`, atau denormalize `outlet_id` langsung ke `order_items` untuk filter murah — **rekomendasi: denormalize**, hindari join di realtime filter).
- Channel per outlet: `realtime:kds:{outlet_id}`.
- Payload minimal (item id, menu name, qty, notes, status, table label) → gunakan Postgres `supabase_realtime` publication dengan kolom terbatas via trigger yang broadcast custom payload (`realtime.broadcast_changes`) alih-alih raw table replication, supaya tidak leak price.
- Fallback: polling 5s jika WS disconnect (resilience untuk jaringan dapur yang kadang unstable).
- Status transition strict state machine di server (Server Action), bukan client-trusted: `new→cooking→ready→served`, reject skip-state.

---

## 8. Modul & Halaman

### 8.1 POS (Kasir)
- `/pos` — grid menu by category, cart panel (Zustand), variant modal.
- `/pos/tables` — floor plan grid, status color-coded (empty/occupied/unpaid), tap → assign order.
- `/pos/checkout` — summary, diskon (%/nominal, butuh manager approval jika > threshold via PIN override), pajak auto (config per outlet), pilih metode bayar.
- `/pos/shift` — open (input cash float) / close (expected vs actual, variance report).

### 8.2 KDS
- `/kds` — kanban 3 kolom (New / Cooking / Ready), realtime push, big-touch buttons, filter by station (opsional: kitchen/bar split via `menu_categories.station`).
- Audio/visual alert untuk order baru masuk.

### 8.2.1 UI Conventions (Tailwind)
- Design tokens via `tailwind.config` theme extend: `color.status.empty/occupied/unpaid`, `color.kitchen.new/cooking/ready` — dipakai konsisten di floor plan & kanban KDS.
- KDS kanban card: min touch target 44px, `text-2xl`+ untuk item name (dibaca dari jarak), `animate-pulse` pada card baru masuk sampai di-ack.
- Dark mode (`dark:`) default ON untuk KDS (kontras tinggi di lingkungan dapur), light mode default untuk POS/back office — toggle via `next-themes`.
- Semua komponen interaktif (button, modal, kanban card) pakai shadcn/ui primitives + Tailwind, no custom CSS files kecuali global reset.

### 8.3 Back Office (Manager)
- `/admin/menu` — CRUD menu, variant groups, resep (ingredient mapping).
- `/admin/stock` — current stock, manual adjustment, low-stock alert.
- `/admin/reports` — omzet harian/bulanan (materialized view `daily_sales_summary`, refresh via cron/Edge Function), top-selling items, per-outlet breakdown.
- `/admin/staff` — CRUD staff, reset PIN, role assignment.
- `/admin/outlets` — outlet management (owner only).

---

## 9. Non-Functional Requirements

- **Concurrency**: order creation & payment via Postgres transaction (single RPC/Server Action, no multi-step client writes) → hindari race condition stock double-deduct.
- **Idempotency**: payment webhook (gateway callback) pakai `reference_no` unique constraint + idempotency key check sebelum insert `payments`.
- **Performance**: index `orders(outlet_id, status, created_at)`, `order_items(order_id)`, `order_items(outlet_id, kitchen_status)` (partial index `where kitchen_status != 'served'` untuk KDS query).
- **Data retention/audit**: `audit_logs` immutable (no update/delete grant, insert-only role).
- **Backup**: Supabase PITR enabled, min 7 hari.
- **Security**: PIN hash argon2id, rate-limit login, service_role key never exposed client-side (semua privileged op via Server Action/Edge Function).

---

## 10. Fase Implementasi

| Fase | Scope |
|---|---|
| 1 | Schema + Auth (PIN login, RLS, Auth Hook) + outlet/staff CRUD |
| 2 | POS core: menu, cart, order, table management |
| 3 | Payment integration (cash dulu, lalu QRIS/e-wallet adapter) |
| 4 | KDS realtime + state machine |
| 5 | Stock deduction trigger + ingredient mgmt |
| 6 | Reports (materialized views) + shift cash reconciliation |
| 7 | Multi-outlet polish, offline queue (Dexie), load testing |