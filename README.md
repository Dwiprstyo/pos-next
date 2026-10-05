# POS & KDS — Multi-Outlet

Web-based Point of Sale + Kitchen Display System. Next.js 15 (App Router) on top of Supabase (Postgres, Auth, Realtime, Storage).

Implements the scope in [`prd-pos-kds.md`](./prd-pos-kds.md): PIN login with JWT claims, row-level-security outlet isolation, POS with cart/variants/discount approval, shifts & cash reconciliation, realtime KDS state machine, automatic stock deduction, and manager reporting.

📚 **Dokumentasi lengkap ada di [`docs/`](./docs/README.md)** (arsitektur, database, auth, POS, KDS, pembayaran, admin, operasional, testing, troubleshooting).

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 App Router, RSC + Server Actions, Tailwind v4, shadcn/ui |
| Client state | Zustand (cart) + Dexie (offline order queue) |
| Backend | Supabase Postgres, Auth, Realtime (private broadcast channels) |
| Payments | Strategy-pattern provider adapters (`cash`, `qris`, `card`, `ewallet`) |

## Quick start

Prerequisites: Node 20+, Docker (for local Supabase).

```bash
npm install

# Apple Silicon only, once: patch arm64 Supabase images that ship a 0-byte entrypoint
npm run db:patch-images

npm run db:start      # starts local Supabase (excludes studio/analytics)
npm run db:reset      # applies migrations + seed + realtime policies

cp .env.example .env.local   # local defaults are pre-filled; already present in this repo
npm run dev
```

Open http://localhost:3000.

### Demo accounts (seed)

| Role | Outlet | Kode Staff | PIN |
|---|---|---|---|
| Owner (all outlets) | — | `OWN` | `1111` |
| Manager | Pusat | `MGR` | `2222` |
| Kasir | Pusat | `KSR1` | `3333` |
| Kasir | Cabang | `KSR2` | `4444` |
| Dapur | Pusat | `DAP` | `5555` |
| Dapur | Cabang | `DAP2` | `6666` |

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run db:start` / `db:stop` / `db:reset` | Local Supabase lifecycle (`db:reset` re-applies realtime policies) |
| `npm run db:setup` | Re-apply `supabase/realtime_policies.sql` after a manual reset |
| `npm run db:types` | Regenerate `src/lib/database.types.ts` |
| `npm run db:patch-images` | Apple Silicon Docker image workaround |
| `npm run typecheck` / `lint` | Static checks |
| `npm run test:smoke` | Backend E2E against local DB (orders, discounts, stock, RLS, shifts, reports) |
| `npm run test:e2e` | Browser E2E (POS → checkout → KDS → admin) via installed Chrome |
| `npm run test:realtime` | Verifies private KDS broadcast reaches the board |

The browser tests expect the app on `http://localhost:3000` and a clean seed (`npm run db:reset` first).

## Architecture

### Auth (PIN)

`staff` rows hold argon2id PIN hashes and are separate from `auth.users`. Login is a Server Action that:

1. Looks up `staff_code + outlet`, checks `locked_until` (5 failures → 15 min lock) and an in-memory IP rate limit.
2. Verifies the PIN with argon2 (`@node-rs/argon2`, server only).
3. Mints a Supabase session with `admin.generateLink` + `verifyOtp` (cookie session via `@supabase/ssr`).
4. `custom_access_token_hook` injects `app_role`, `outlet_id`, `staff_id`, `is_multi_outlet` into the JWT (12h expiry), which RLS policies read via `auth.jwt()`.

`pin_hash`, `failed_pin_attempts` and `locked_until` are column-level revoked from `anon`/`authenticated`.

### Data & security

- `supabase/migrations/` contains schema, functions/triggers, RLS, views/reports, grants, and fixes.
- Outlet isolation and role checks are enforced in Postgres. Kitchen has **no** SELECT on `orders`/`payments`/`order_items`; it reads `kds_order_items_view` (definer view, price-free) and mutates only through `set_kitchen_status`.
- Order writes go through `security definer` RPCs: `create_order`, `add_order_items`, `apply_order_discount`, `pay_order`, `void_order`, `open_shift`, `close_shift`, `adjust_stock`. Prices/totals are always computed server-side; client-supplied prices are ignored.
- Manager-approved discount/void paths are separate RPC overloads granted to `service_role` only; the server action verifies the manager PIN before calling them.
- `audit_logs` is append-only (UPDATE/DELETE revoked).
- `orders.client_id` is unique → offline replays are idempotent. `payments.idempotency_key`/`reference_no` are unique → webhook replays are idempotent.

### Realtime KDS

Triggers on `order_items`/`orders` call `realtime.send` with a minimal payload (no prices) on the private topic `kds:{outlet_id}`. The board subscribes with the user JWT and RLS on `realtime.messages` authorizes per outlet. If the socket drops, the board falls back to 5s polling.

> Local quirk: `realtime.messages` is owned by `supabase_realtime_admin`, so its policies are applied by `scripts/db-setup.sh` (run automatically by `db:reset`). Hosted Supabase projects can create them from the SQL editor.

### Payments

`src/lib/payments/` defines `PaymentProvider`. Cash settles immediately and is always available. QRIS/e-wallet use the Midtrans Core API adapter when `MIDTRANS_SERVER_KEY` is set (pending charges show a QR/deeplink and are polled + settled by webhook); without it, non-cash methods are disabled and the POS stays cash-only. Gateway callbacks post to `/api/payments/webhook/midtrans` (Midtrans SHA512 signature) or the generic `/api/payments/webhook` (HMAC `x-signature` with `PAYMENT_GATEWAY_WEBHOOK_SECRET`), settling through the service-role `settle_gateway_payment` RPC.

### Offline queue

When the POS loses connectivity, `create_order` calls are queued in IndexedDB (Dexie) and flushed on reconnect. Replays are safe thanks to `orders.client_id`.

### UX notes

- Login uses the device keyboard (no on-screen keypad); PIN is a normal password input.
- Default theme is light with a toggle in the nav/KDS header.
- Tables are optional: dine-in orders can run without one ("Tanpa meja").
- Cash is the default payment method.
- `/pos/orders` lists all unpaid orders (tambahkan item atau bayar) — works for takeaway/no-table orders too.
- Owner (multi-outlet) only sees back-office menus; POS/KDS are hidden from the nav.
- Small phones show a "rotate to landscape" hint on POS/KDS.

## Deployment notes

- Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` for the hosted project.
- Enable the Auth Hook in Dashboard → Auth → Hooks: `public.custom_access_token_hook`.
- Run the migrations (`supabase db push`), apply `supabase/realtime_policies.sql`, and seed or onboard staff.
- Optional payments: `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_IS_PRODUCTION`, and set the Midtrans notification URL to `/api/payments/webhook/midtrans`.
- Schedule `refresh_daily_sales_summary()` (pg_cron or an Edge Function) so reports stay warm.

## Troubleshooting

- `exec format error` while starting Supabase on Apple Silicon → `npm run db:patch-images`.
- KDS shows "polling fallback" → the private channel was rejected; confirm `realtime_policies.sql` was applied (`npm run db:setup`).
- `daily_sales` empty → the materialized view only contains paid orders; hit **Refresh** on `/admin/reports`.
