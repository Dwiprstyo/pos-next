# Testing

Tiga lapis pengujian, semuanya memakai Supabase lokal.

## 1. Smoke test backend (`npm run test:smoke`)

`scripts/smoke-test.mjs` — 31 assertion langsung ke RPC/RLS:

- Login `generateLink + verifyOtp` dan claim JWT.
- Buka shift.
- `create_order` + perhitungan total server-side (subtotal, pajak, service).
- Meja jadi `occupied`.
- Idempotensi `client_id`.
- Diskon di bawah/atas threshold + approval manager.
- State machine KDS (termasuk penolakan lompat status).
- Pembayaran + pemotongan stok sesuai resep.
- Void mengembalikan stok.
- Isolasi RLS antar outlet.
- Tutup shift + variance.
- Laporan (`daily_sales`, `top_selling_items`).

```bash
npm run db:reset
npm run test:smoke
```

## 2. E2E browser (`npm run test:e2e`)

`scripts/e2e-test.mjs` (Playwright + Chrome terpasang) — 17 assertion alur UI:

1. Kasir buka shift.
2. Tambah 2 item (satu dengan varian), pilih meja, checkout, bayar tunai.
3. Floor plan.
4. Login dapur → board menampilkan item → `cooking → ready → served`.
5. Login manager → laporan, menu, stok, staff.

```bash
npm run db:reset
npm start           # atau npm run dev, di port 3000
npm run test:e2e
```

## 3. Realtime (`npm run test:realtime`)

`scripts/realtime-test.mjs` — memastikan broadcast privat sampai ke board **tanpa interaksi**:

- Board KDS dibuka di browser.
- Order dibuat lewat API (node).
- Item harus muncul < 5 detik (tanpa polling manual), dan koneksi websocket terdeteksi.

```bash
npm run test:realtime
```

## Static checks

```bash
npm run typecheck
npm run lint
npm run build
```

## Menambah test

- **Backend**: tambahkan blok `check(...)` di `scripts/smoke-test.mjs`; gunakan helper `login()` dan client admin.
- **UI**: tambahkan langkah di `scripts/e2e-test.mjs`; selector mengandalkan role/label (`getByRole`, `getByLabel`).
- **Migrasi baru**: selalu `npm run db:reset && npm run test:smoke` sebelum lanjut.

## Catatan selector (Base UI)

Repo ini memakai shadcn versi Base UI:

- `Button` tidak punya `asChild`; pakai `buttonVariants()` atau prop `render`.
- `Select.Value` menampilkan label kalau `items` diberikan ke `Select`; tanpa `items`, yang tampil adalah value mentah (UUID).
- `SheetTrigger`/`DialogTrigger` tidak memakai `asChild`; beri `className`/`render`.
