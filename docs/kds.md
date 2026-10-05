# KDS (Kitchen Display System)

Halaman: `/kds` (role `kitchen` atau `manager`).

## Board

Tiga kolom kanban:

| Kolom | Status | Aksi tombol |
|---|---|---|
| Baru | `new` | Mulai Masak → `cooking` |
| Dimasak | `cooking` | Siap → `ready` |
| Siap Saji | `ready` | Disajikan → `served` |

Item `served` hilang dari board (view memfilternya). Order `void` juga hilang. Order yang sudah dibayar **tetap tampil** sampai itemnya disajikan (penting untuk takeaway bayar di muka).

Kartu dikelompokkan per order: nomor order, meja/tipe, waktu berjalan, lalu item (qty besar, nama `text-2xl`, varian, catatan).

## State machine

Transisi divalidasi di server (`set_kitchen_status`), bukan di client:

```
new → cooking → ready → served
```

- Lompat status (mis. `new → ready`) ditolak: `invalid_transition`.
- Role: hanya `kitchen`/`manager`, dan hanya outlet yang sama (owner bebas).
- Setiap perubahan mencatat `kitchen_status_updated_at` + `kitchen_status_updated_by`.
- Jika order masih `open` dan **semua** item sudah `served` dan order punya meja → meja jadi `unpaid`.

## Realtime

- Trigger `trg_broadcast_order_item` / `trg_broadcast_order` memanggil `realtime.send` ke topic privat `kds:{outlet_id}`.
- Payload minimal (tanpa harga): `id`, `order_id`, `order_number`, `order_type`, `table_label`, `menu_name`, `qty`, `notes`, `station`, `kitchen_status`, `op`.
- Client subscribe dengan `config: { private: true }` dan **JWT user** (`supabase.realtime.setAuth(session.access_token)`) — Realtime mengecek policy `realtime.messages` per outlet.
- Setelah event diterima, board memanggil server action `fetchKdsItems()` untuk mengambil data lengkap (termasuk varian).

## Fallback polling

Kalau websocket tidak `SUBSCRIBED` (jaringan dapur tidak stabil), board otomatis polling `fetchKdsItems()` setiap **5 detik**. Indikator di header menunjukkan `realtime` atau `polling fallback`.

## Notifikasi

- Item baru: kartu berkedip (`animate-pulse`) sampai diklik/di-ack.
- Suara: tombol "Suara Mati/Aktif" (Web Audio beep 880Hz). Browser mensyaratkan interaksi pengguna sebelum audio boleh berbunyi, jadi tekan tombolnya sekali saat mulai shift.
- Waktu berjalan di kartu diperbarui tiap 30 detik.

## Tema

Default aplikasi **light**; KDS punya tombol ganti tema (ikon bulan/matahari) di header. Banyak dapur lebih nyaman dark mode — sekali diubah, tersimpan di browser.

## Station (kitchen/bar)

Kategori menu punya `station` (`kitchen`/`bar`). Nilainya disnapshot ke `order_items.station`. Board saat ini menampilkan semua station; filter per station bisa ditambahkan dengan memfilter `station` di `fetchKdsItems()` / query view.

## Isolasi outlet

View `kds_order_items_view` menyertakan `outlet_id`. Untuk staff dengan outlet (`kitchen`/manager cabang), board memfilter `.eq("outlet_id", session.outletId)` sehingga tidak melihat order outlet lain. Owner (multi-outlet) melihat semua outlet.
