# POS (Kasir)

Halaman: `/pos`, `/pos/orders`, `/pos/tables`, `/pos/checkout`, `/pos/shift`.

## Alur harian kasir

1. **Login** (PIN) → otomatis diarahkan ke POS.
2. **Buka shift** (`/pos/shift`) — isi kas awal (ada tombol preset 100rb/200rb/500rb/1jt). Tanpa shift terbuka, semua pembuatan order ditolak (`no_open_shift`).
3. **Pilih tipe order**: Dine-in atau Takeaway.
4. **Pilih meja** — **opsional**. Bisa "Tanpa meja" untuk counter/queue.
5. **Tambah menu** dari grid (cari + filter kategori). Item dengan varian membuka dialog pilihan (wajib/min/maks divalidasi server).
6. **Kirim ke Dapur** → order dibuat, tampil di KDS.
7. **Bayar** → halaman checkout: diskon (opsional), metode pembayaran, lalu bayar.
8. **Tutup shift** di akhir — kas aktual dihitung, variance otomatis, sesi logout.

## Pesanan Berjalan (`/pos/orders`)

Daftar semua order `open` di outlet: nomor, meja/tipe, waktu, ringkasan item + progres dapur, dan total. Aksi per order:

- **Tambah Item** → membuka POS dengan cart terisi item order tersebut (memakai `add_order_items`).
- **Bayar** → langsung ke checkout order itu.

Berguna untuk takeaway atau order tanpa meja yang tidak terlihat di floor plan. Filter: Semua / Dine-in / Takeaway.

## Kas awal (opening cash)

- Diisi sekali saat **Buka Shift**; tidak bisa diubah setelah shift terbuka.
- Nilainya menjadi dasar `closing_cash_expected` = kas awal + penjualan tunai shift.
- Jika hitungan fisik berbeda, selisih tercatat otomatis sebagai `cash_variance` saat tutup shift (bukan diedit manual).

## Cart (Zustand)

- Disimpan di `localStorage` (`pos-cart`), bertahan saat refresh.
- Setiap baris: menu, varian, qty, catatan; baris identik digabung otomatis.
- Mode **append**: buka meja terisi → "Tambah item" → cart terisi item order berjalan, submit memakai `add_order_items`.

## Diskon & approval

- Tipe: persen (%) atau nominal (Rp).
- Batas approval per outlet: `outlets.discount_approval_threshold`.
- Diskon di atas batas → server menolak (`approval_required`) → UI meminta **PIN manager**.
- PIN diverifikasi di server (argon2) terhadap staff manager outlet yang sama; setelah valid, RPC privileged `apply_order_discount(..., approver_id)` dipanggil via service role.
- Pajak & service charge dihitung ulang dari `(subtotal - diskon)`.

## Pembayaran

| Metode | Perilaku |
|---|---|
| Tunai (default) | Input uang diterima → hitung kembalian → langsung paid |
| QRIS | Midtrans Core API `qris` → tampilkan QR + polling status |
| E-wallet | Midtrans `gopay` → deeplink + polling status |
| Kartu | Belum didukung (butuh token 3DS) |

Kalau `MIDTRANS_SERVER_KEY` tidak diisi, tombol non-tunai dinonaktifkan dan hanya tunai yang tersedia.

Detail: lihat [payments.md](./payments.md).

## Void

- Manager login bisa void langsung (isi alasan).
- Kasir butuh PIN manager (dialog approval).
- Order `paid` yang di-void → stok dikembalikan (`void_restock`), meja dikosongkan.
- Order `open` yang di-void → meja dikosongkan, tanpa mutasi stok.

## Meja

`/pos/tables` menampilkan floor plan dengan warna status:

- **Kosong** (hijau) → tap = order baru di meja itu.
- **Terisi** (biru) → tap = pilihan "Tambah item" atau "Bayar".
- **Belum Bayar** (kuning) → semua item sudah `served` tapi order masih `open`.

## Shift

- Satu shift terbuka per staff (partial unique index).
- `closing_cash_expected` = kas awal + total pembayaran tunai shift tersebut.
- `cash_variance` = aktual − expected (generated column), muncul di halaman shift.
- Menutup shift otomatis logout (sesi shift selesai).

## Offline

- `create_order` yang gagal karena jaringan disimpan di IndexedDB (Dexie) dengan `client_id` unik.
- Saat kembali online (event `online` atau buka POS), antrean dikirim ulang. Karena `client_id` unik, replay tidak menggandakan order.
- Indikator kecil "Mode offline" tampil di panel cart.

## Keyboard & perangkat

- Halaman login memakai keyboard perangkat (tidak ada keypad di layar).
- Di ponsel portrait muncul banner saran **landscape**.
- Target sentuh tombol utama ≥ 44px; KDS memakai font besar.
