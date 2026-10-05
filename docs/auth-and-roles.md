# Auth & Role

## Konsep

Supabase Auth tidak punya konsep "outlet + PIN", jadi:

1. Tabel `staff` menyimpan `pin_hash` (argon2id) dan terpisah dari `auth.users`.
2. Setiap staff tetap punya 1 user di `auth.users` (dibuat via Admin API saat onboarding).
3. Login memverifikasi PIN di server, lalu membuat session Supabase.
4. `custom_access_token_hook` menyuntikkan claim ke JWT supaya RLS tidak perlu query tambahan.

## Alur login PIN

`src/app/login/actions.ts` → `pinLogin`:

1. **Rate limit in-memory**: maksimal 10 percobaan/menit per `IP + staff_code`.
2. **Lookup staff** (admin client): `staff_code` aktif; cocokkan `outlet_id` atau owner (`is_multi_outlet` + `outlet_id = null`).
3. **Lockout**: 5 PIN salah → `locked_until = now() + 15 menit`, counter direset. Pesan error menyebut waktu buka.
4. **Verifikasi argon2id** (`@node-rs/argon2`), hanya berjalan di server.
5. **Buat session**: `admin.generateLink({ type: 'magiclink' })` → `verifyOtp({ token_hash })` pada server client (`@supabase/ssr`) → cookie session terpasang.
6. **Audit**: `auth.login`, `auth.pin_failed` masuk `audit_logs`.
7. **Redirect** sesuai role (`defaultHomeFor`).

Session berlaku 12 jam (`jwt_expiry = 43200` di `supabase/config.toml`) — sepanjang shift.

## Auth Hook

```sql
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb ...
```

Menambahkan claim:

| Claim | Contoh | Dipakai untuk |
|---|---|---|
| `app_role` | `cashier` | Policy role |
| `outlet_id` | uuid | Isolasi outlet |
| `staff_id` | uuid | Audit & RPC actor |
| `is_multi_outlet` | `true` (owner) | Akses lintas outlet |

> **Catatan penting**: `jsonb_set(claims, key, NULL)` membuat seluruh objek `claims` jadi SQL NULL, dan GoTrue menolak token dengan error *"output claims do not conform to the expected schema"*. Karena owner punya `outlet_id = null`, hook memakai `coalesce(to_jsonb(...), 'null'::jsonb)`.

Registrasi hook:

- **Lokal**: `supabase/config.toml` → `[auth.hook.custom_access_token]`.
- **Hosted**: Dashboard → Authentication → Hooks → Customize Access Token → `public.custom_access_token_hook`.

## Helper claim di SQL

| Fungsi | Isi |
|---|---|
| `jwt_app_role()` | `auth.jwt()->>'app_role'` |
| `jwt_outlet_id()` | uuid outlet |
| `jwt_staff_id()` | uuid staff |
| `jwt_is_multi_outlet()` | boolean owner |
| `can_access_outlet(uuid)` | `is_multi_outlet` **atau** outlet sama |
| `is_manager()` / `is_cashier_or_manager()` | cek role |

## Matriks akses

| Resource | cashier | kitchen | manager | owner |
|---|---|---|---|---|
| `menu_items` (baca) | ✅ | ❌ | ✅ | ✅ semua |
| `orders` (baca) | ✅ outlet | ❌ | ✅ outlet | ✅ semua |
| `payments` (baca) | ✅ outlet | ❌ | ✅ outlet | ✅ semua |
| `kds_order_items_view` | ❌ | ✅ | ✅ | ✅ |
| `set_kitchen_status` | ❌ | ✅ | ✅ | ✅ |
| `create_order` / `pay_order` | ✅ | ❌ | ✅ | ⚠️ butuh outlet |
| `apply_order_discount` | ✅ (batas) | ❌ | ✅ | ✅ |
| `void_order` | ❌ (butuh PIN manager) | ❌ | ✅ | ✅ |
| `adjust_stock`, CRUD menu/staff | ❌ | ❌ | ✅ | ✅ |
| `outlets` CRUD | ❌ | ❌ | ❌ | ✅ |
| Laporan (`daily_sales`, dll) | ❌ | ❌ | ✅ | ✅ semua |

RLS **bukan** satu-satunya lapisan:

- Kitchen tidak punya policy SELECT di `orders`/`order_items`/`payments`.
- Update status dapur hanya lewat RPC (tidak ada policy UPDATE).
- Kolom sensitif `staff.pin_hash`, `failed_pin_attempts`, `locked_until` di-revoke dari `anon`/`authenticated`.
- `audit_logs` hanya bisa dibaca manager; `UPDATE`/`DELETE` di-revoke (append-only).

## Onboarding staff

`/admin/staff` (manager):

1. Buat user auth via Admin API (`email_confirm: true`, password acak).
2. Hash PIN argon2id → insert `staff` dengan `user_id`.
3. Kalau insert gagal (mis. kode duplikat), user auth dihapus lagi (rollback manual).

Reset PIN dan unlock juga dari halaman ini (counter & `locked_until` direset).

## Owner

Owner = `staff` dengan `is_multi_outlet = true` dan `outlet_id = null`. Login owner bisa memilih outlet mana saja di form login; claim `is_multi_outlet` yang membuat RLS meloloskan akses lintas outlet. Owner tidak bisa membuka shift/POS karena `create_order` membutuhkan `outlet_id`; owner dipakai untuk back office & laporan.
