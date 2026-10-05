# Arsitektur

## Gambaran

```
┌────────────────────────── Vercel / Node ──────────────────────────┐
│  Next.js 15 App Router                                             │
│  ├─ Server Components  → baca data (RLS pakai JWT user)            │
│  ├─ Server Actions     → tulis data (RPC security definer)         │
│  ├─ Route Handlers     → webhook payment gateway (service role)    │
│  └─ Middleware         → refresh session + guard route             │
└───────────────┬────────────────────────────────────────────────────┘
                │ supabase-js (cookie session / service role)
┌───────────────▼────────────────────────────────────────────────────┐
│  Supabase                                                          │
│  ├─ Postgres + RLS + RPC + trigger + materialized view             │
│  ├─ Auth (GoTrue) + custom_access_token_hook                       │
│  ├─ Realtime (broadcast privat per outlet)                         │
│  └─ Storage (opsional, untuk gambar menu)                          │
└────────────────────────────────────────────────────────────────────┘
```

## Prinsip desain

1. **Server-authoritative pricing.** Client hanya mengirim `menu_item_id`, `qty`, `notes`, `variant_option_ids`. Harga, diskon, pajak, dan total dihitung di Postgres.
2. **Satu transaksi per aksi bisnis.** Order + item + varian dibuat atomik lewat `create_order`; pembayaran + ubah status lewat `pay_order`; tidak ada multi-step write dari client.
3. **RLS bukan sekadar UI.** Kitchen tidak punya akses `SELECT` ke `orders`/`payments`; hanya view `kds_order_items_view` yang bebas harga.
4. **Idempotent by default.** `orders.client_id`, `payments.idempotency_key`, dan `payments.reference_no` unik → retry aman (offline sync, webhook replay).
5. **Realtime minim payload.** Broadcast hanya berisi id, nama menu, qty, catatan, status, label meja — tanpa harga/total.
6. **Graceful degradation.** Tanpa Midtrans → hanya tunai. Tanpa websocket → polling 5 detik. Tanpa internet → antrean IndexedDB.

## Struktur folder

```
src/
├─ app/
│  ├─ (app)/                 # shell terang + nav: POS & admin
│  │  ├─ pos/                # kasir, meja, checkout, shift
│  │  └─ admin/              # menu, stok, laporan, staff, outlet
│  ├─ (kds)/kds/             # board dapur (fullscreen)
│  ├─ login/                 # form PIN + server action
│  └─ api/payments/webhook/  # callback gateway
├─ components/               # UI (shadcn + komponen app)
├─ lib/
│  ├─ supabase/              # client, server, admin, middleware
│  ├─ payments/              # provider abstraction (cash, midtrans)
│  ├─ offline/               # Dexie queue + sync
│  ├─ auth.ts                # session context + guard role
│  ├─ pos-types.ts           # tipe domain POS/KDS
│  └─ database.types.ts      # hasil `npm run db:types`
├─ stores/cart.ts            # Zustand cart (persist)
└─ middleware.ts
supabase/
├─ migrations/               # 7 migrasi berurutan
├─ seed.sql                  # data demo (lokal)
└─ realtime_policies.sql     # policy channel privat KDS
scripts/                     # setup DB, patch Docker, test
```

## Alur request

### Login PIN

```
Client form → Server Action pinLogin
  → admin client: cari staff_code + outlet, cek lockout & rate limit
  → argon2.verify(pin_hash, pin)
  → admin.generateLink(magiclink) → verifyOtp (cookie session)
  → GoTrue panggil custom_access_token_hook → claims app_role/outlet_id/staff_id
  → redirect sesuai role
```

### Buat order (POS)

```
Cart (Zustand) → createOrderAction
  → supabase.rpc('create_order', { p_client_id, p_table_id?, p_order_type, p_items })
      ├─ validasi shift terbuka, outlet, meja (opsional), menu tersedia
      ├─ hitung harga dari DB + extra varian, validasi varian wajib
      ├─ hitung pajak + service charge
      └─ insert order + item + varian + audit
  → trigger broadcast order_item_change ke KDS
  → jika gagal jaringan: simpan ke IndexedDB, sync saat online
```

### Pembayaran

```
Checkout → payOrderAction
  ├─ cash: provider charge langsung 'paid' → rpc pay_order
  │         → trigger deduct_stock_on_payment → stok berkurang
  └─ gateway: provider charge
        ├─ 'paid'    → rpc pay_order
        └─ 'pending' → rpc create_gateway_payment (status pending)
                       → tampilkan QR/deeplink + polling status
                       → webhook Midtrans / polling → settle_gateway_payment
```

### KDS

```
Trigger Postgres → realtime.send(payload, 'kds:{outlet_id}', private)
  → Realtime cek policy SELECT realtime.messages (JWT outlet)
  → board terima event → refresh daftar item via server action
  → tombol status → rpc set_kitchen_status (state machine divalidasi server)
  → jika semua item 'served' & order masih open → meja jadi 'unpaid'
```

## Keputusan penting

| Keputusan | Alasan |
|---|---|
| `outlet_id` didenormalisasi ke `order_items` | Filter realtime & RLS murah, tanpa join |
| View KDS `security_invoker = off` | Kitchen tidak butuh akses tabel dasar sama sekali |
| Approval diskon/void lewat overload RPC khusus `service_role` | PIN manager diverifikasi di Node; client tidak bisa memalsukan approver |
| Private broadcast + policy `realtime.messages` | Cegah outlet lain menyadap board |
| `orders.client_id` unik | Sinkronisasi offline aman di-retry |
| Materialized view laporan | Report cepat; refresh manual/cron |
| Base UI (bukan Radix) | Bawaan `shadcn` versi terbaru di repo ini; dropdown id perlu prop `items` |

## Batasan saat ini

- Pembayaran kartu via Midtrans Core API belum didukung (butuh token 3DS dari client); gunakan QRIS/e-wallet/tunai.
- Upload gambar menu belum diimplementasi (kolom `image_url` sudah ada, Storage belum dipakai).
- Belum ada split bill / pindah meja.
- Satu meja = satu order aktif (menambah item harus lewat order yang sama).
