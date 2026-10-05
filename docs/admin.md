# Back Office (Manager)

Semua halaman di bawah `/admin/*` hanya untuk role `manager`; owner melihat semua outlet.

> **Owner**: menu POS/KDS disembunyikan dari navigasi (owner tidak punya outlet untuk transaksi). Halaman **Menu** dan **Stok** punya dropdown outlet di kanan atas (`?outlet=<id>`) supaya owner bisa memilih outlet yang dikelola.

## `/admin/menu`

- **Kategori**: CRUD + `station` (`kitchen`/`bar`) + urutan tampil.
- **Menu**: nama, kategori, harga dasar, ketersediaan (switch cepat di tabel).
- **Varian**: grup dinamis (`wajib`, `min_select`, `max_select`) + opsi dengan tambahan harga. Divalidasi ulang saat order.
- **Resep**: mapping bahan + qty; dipakai untuk auto-deduction stok.
- Menghapus kategori tidak menghapus menu (FK `set null`). Menu "dihapus" dengan menonaktifkan `is_available`.

## `/admin/stock`

- Daftar bahan: stok saat ini, batas minimum, badge **Low**.
- **Masuk/Keluar** stok manual → tercatat di `stock_transactions` (reason `restock`/`manual_adjustment`).
- Riwayat 20 mutasi terakhir ditampilkan.
- Penjualan memotong stok otomatis lewat trigger; void mengembalikannya.

## `/admin/reports`

- Filter rentang tanggal + outlet (owner).
- Tombol **Refresh** memanggil `refresh_daily_sales_summary()` (materialized view).
- Ringkasan: omzet net, jumlah order, tunai, non-tunai.
- Tabel omzet harian per outlet + menu terlaris + transaksi terbaru.
- Owner bisa melihat semua outlet; manager cabang hanya outletnya (dipaksa di SQL, bukan hanya UI).

## `/admin/staff`

- Buat staff: nama, kode, role, outlet, PIN → sekaligus membuat `auth.users`.
- Edit: nama, role, aktif/nonaktif (tidak bisa menonaktifkan diri sendiri).
- **Reset PIN** sekaligus membuka lockout (`failed_pin_attempts = 0`, `locked_until = null`).
- Badge status: Aktif / Nonaktif / Locked (dengan waktu buka).

## `/admin/outlets` (owner)

- CRUD outlet: nama, alamat, pajak %, service %, batas approval diskon, aktif/nonaktif.
- Menonaktifkan outlet membuat staff tidak bisa membuka shift di outlet itu (`outlet_unavailable`).

## Audit

Aksi sensitif tercatat di `audit_logs` (append-only):

| Action | Kapan |
|---|---|
| `auth.login`, `auth.pin_failed` | Login |
| `order.create`, `order.add_items` | Order |
| `discount.apply` | Diskon (termasuk approver) |
| `order.pay`, `order.pay.webhook`, `order.pay.gateway` | Pembayaran |
| `order.void` | Void (termasuk approver + alasan) |
| `shift.open`, `shift.close` | Shift + variance |
| `stock.adjust` | Mutasi stok manual |
| `staff.create`, `staff.reset_pin` | Manajemen staff |

Query audit (manager):

```sql
select action, entity_type, entity_id, metadata, created_at
from audit_logs
where outlet_id = '<uuid>'
order by created_at desc
limit 100;
```
