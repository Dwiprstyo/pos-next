# Operasional

## Setup lokal

Prasyarat: Node 20+, Docker Desktop.

```bash
npm install

# Apple Silicon: patch image Supabase yang entrypoint-nya 0 byte
npm run db:patch-images

npm run db:start     # Supabase lokal (tanpa studio/analytics)
npm run db:reset     # migrasi + seed + policy realtime
npm run dev          # http://localhost:3000
```

Perintah DB:

| Perintah | Fungsi |
|---|---|
| `npm run db:start` | Jalankan stack lokal |
| `npm run db:stop` | Hentikan stack |
| `npm run db:reset` | Drop + migrasi + seed + policy realtime |
| `npm run db:setup` | Re-apply `supabase/realtime_policies.sql` saja |
| `npm run db:types` | Regenerate `src/lib/database.types.ts` |

## Migrasi

Buat migrasi baru:

```bash
npx supabase migration new nama_migrasi   # file di supabase/migrations
npm run db:reset                          # uji dari nol
```

Aturan:

- Jangan edit migrasi yang sudah dipakai di hosted; buat migrasi baru.
- Fungsi `security definer` wajib `set search_path = public, pg_temp`.
- Tambah `revoke`/`grant` untuk setiap fungsi baru.
- Jalankan `npm run typecheck` setelah `db:types` (RPC baru muncul di tipe).

## Deploy ke Supabase hosted

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push
```

Lalu:

1. **Auth Hook**: Dashboard → Authentication → Hooks → Customize Access Token → `public.custom_access_token_hook`. Tanpa ini, RLS tidak akan bekerja.
2. **Realtime policy**: jalankan `supabase/realtime_policies.sql` di SQL Editor (file sudah toleran untuk hosted).
3. **Jangan jalankan `seed.sql`** di production (berisi akun demo + insert `auth.users`).
4. **Onboarding owner pertama**:
   - Dashboard → Authentication → Add user (email owner, confirm).
   - Insert staff dengan hash argon2. Contoh hash untuk PIN `1234` bisa digenerate:
     ```bash
     node -e "const {hash}=require('@node-rs/argon2');hash('1234',{algorithm:2}).then(console.log)"
     ```
     ```sql
     insert into staff (user_id, outlet_id, staff_code, full_name, role, pin_hash, is_multi_outlet)
     values ('<auth-user-uuid>', null, 'OWN', 'Owner', 'manager', '<hash>', true);
     ```
   - Setelah itu outlet & staff lain dibuat dari UI `/admin`.
5. **Environment** (Vercel): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, plus opsi Midtrans.
6. **Types** untuk hosted: `npx supabase gen types typescript --linked > src/lib/database.types.ts`.

## Refresh laporan

`daily_sales_summary` adalah materialized view. Jadwalkan refresh:

- **pg_cron** (hosted):

  ```sql
  select cron.schedule('refresh-sales', '*/10 * * * *', $$select public.refresh_daily_sales_summary()$$);
  ```

  Fungsi mengizinkan `service_role` (cron berjalan sebagai superuser/`postgres`).

- **Manual**: tombol Refresh di `/admin/reports`.

## Backup & retensi

- Aktifkan **PITR** (minimal 7 hari) di Dashboard → Database → Backups.
- `audit_logs` append-only; pertimbangkan partisi/arsip bulanan kalau sudah besar.
- `stock_transactions` tumbuh cepat; retensi bisa dibatasi lewat cron kalau perlu.

## Keamanan

- `SUPABASE_SERVICE_ROLE_KEY` hanya di server (Server Actions/Route Handlers), tidak pernah dikirim ke client.
- Kolom PIN di-revoke dari role API.
- Webhook wajib signature; endpoint generik mati tanpa secret.
- Approval diskon/void memakai RPC khusus `service_role` + verifikasi PIN di Node.

## Monitoring

- Log Supabase: Dashboard → Logs (Postgres, Auth, Realtime).
- Error aplikasi: log Vercel.
- Indikator KDS (`realtime`/`polling fallback`) berguna untuk memantau kualitas jaringan dapur.
- Cek lockout staff di `/admin/staff`.

## Skala & performa

- Indeks KDS parsial (`kitchen_status <> 'served'`) menjaga board tetap ringan.
- Order/payment selalu satu transaksi → tidak ada race stok.
- Untuk outlet besar, pertimbangkan: filter station di KDS, partisi `orders` per bulan, dan connection pooling (Supavisor) untuk report berat.
