# Dokumentasi POS & KDS

Dokumentasi lengkap aplikasi multi-outlet POS + Kitchen Display System.

## Daftar isi

| Dokumen | Isi |
|---|---|
| [architecture.md](./architecture.md) | Gambaran sistem, struktur folder, alur request, keputusan desain |
| [auth-and-roles.md](./auth-and-roles.md) | Login PIN, JWT claims, lockout, matriks role & RLS |
| [database.md](./database.md) | Skema tabel, enum, RPC, trigger, view, laporan, indeks |
| [pos.md](./pos.md) | Alur kasir: cart, varian, diskon, meja opsional, shift, offline |
| [kds.md](./kds.md) | Kitchen Display: state machine, realtime, fallback, audio |
| [payments.md](./payments.md) | Abstraksi provider, tunai, Midtrans, webhook, idempotency |
| [admin.md](./admin.md) | Back office: menu, stok, laporan, staff, outlet |
| [operations.md](./operations.md) | Setup lokal, migrasi, deploy hosted, backup, cron |
| [testing.md](./testing.md) | Smoke test, E2E browser, realtime test |
| [troubleshooting.md](./troubleshooting.md) | Masalah umum & solusinya |

## Ringkasan singkat

- **Stack**: Next.js 15 (App Router, RSC + Server Actions), Supabase (Postgres + Auth + Realtime), Tailwind v4 + shadcn/ui (Base UI), Zustand, Dexie.
- **Role**: `cashier`, `kitchen`, `manager` (owner = manager `is_multi_outlet`).
- **Isolasi data**: RLS per outlet, digerakkan claim JWT `outlet_id` / `app_role` / `staff_id`.
- **Tulis data**: selalu lewat RPC `security definer` (`create_order`, `pay_order`, dst) — client tidak pernah menulis harga.
- **Realtime**: trigger Postgres broadcast payload minimal (tanpa harga) ke channel privat `kds:{outlet_id}`.
- **Pembayaran**: tunai selalu tersedia; QRIS/e-wallet via Midtrans kalau `MIDTRANS_SERVER_KEY` diisi.

## Akun demo (local seed)

| Role | Outlet | Kode | PIN |
|---|---|---|---|
| Owner | semua | `OWN` | `1111` |
| Manager | Pusat | `MGR` | `2222` |
| Kasir | Pusat | `KSR1` | `3333` |
| Kasir | Cabang | `KSR2` | `4444` |
| Dapur | Pusat | `DAP` | `5555` |
| Dapur | Cabang | `DAP2` | `6666` |
