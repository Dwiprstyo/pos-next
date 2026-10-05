# Troubleshooting

## Tidak bisa login

| Gejala | Penyebab | Solusi |
|---|---|---|
| "Kode staff tidak ditemukan di outlet ini" | Outlet di dropdown tidak sesuai | Pilih outlet yang benar (mis. `KSR1` → Pusat, `KSR2` → Cabang). Sejak perbaikan, outlet tidak auto-terpilih. |
| "Akun terkunci sampai HH:MM" | 5x PIN salah | Tunggu 15 menit, atau manager reset PIN di `/admin/staff`. |
| Owner tidak bisa masuk / balik ke login | Bug lama: claim `outlet_id = null` membuat seluruh claims NULL | Sudah diperbaiki di migrasi 7 (`coalesce(to_jsonb(...), 'null'::jsonb)`). Pastikan migrasi terbaru terpasang. |
| Login sukses tapi langsung balik ke `/login` | Auth Hook tidak terdaftar / tidak jalan | Lokal: cek `supabase/config.toml`. Hosted: daftarkan di Dashboard → Auth → Hooks. |
| "Gagal membuat sesi login" | Email staff tidak ada di `auth.users` | Buat ulang staff dari `/admin/staff` atau cek `staff.user_id`. |

## Supabase lokal

### `exec format error` saat `supabase start` (Apple Silicon)

Image arm64 `storage-api`, `postgres-meta`, dan `kong` mengirim `docker-entrypoint.sh` 0 byte.

```bash
npm run db:patch-images
```

### Container unhealthy / Docker mati sendiri

- Pastikan Docker Desktop berjalan dan punya resource cukup.
- `npm run db:stop && npm run db:start`.
- `npm run db:start` sengaja mengecualikan `studio,postgres-meta,logflare,vector,edge-runtime,imgproxy` (beberapa tidak stabil di arm64). Untuk Studio, jalankan tanpa flag exclude (butuh patch image).

### KDS menampilkan "polling fallback" terus

Policy `realtime.messages` belum ada.

```bash
npm run db:setup
```

Lalu pastikan client subscribe memakai JWT user (bukan anon key) — board sudah memanggil `supabase.realtime.setAuth(session.access_token)`.

### Laporan kosong

`daily_sales_summary` hanya berisi order `paid`. Pastikan ada penjualan, lalu tekan **Refresh** di `/admin/reports` atau jalankan `refresh_daily_sales_summary()`.

## Pembayaran

| Gejala | Penyebab | Solusi |
|---|---|---|
| Tombol QRIS/e-wallet mati | `MIDTRANS_SERVER_KEY` kosong | Isi env Midtrans; tanpa itu hanya tunai (memang by design). |
| "Payment gateway belum dikonfigurasi" | Sama seperti di atas | Isi env atau pakai tunai. |
| "Pembayaran kartu belum didukung" | Core API butuh token 3DS | Pakai QRIS/e-wallet/tunai. |
| Status tetap pending | Webhook tidak menjangkau localhost | Biarkan polling 3 detik berjalan; untuk webhook gunakan tunnel. |
| Webhook 401 | Signature salah | Pastikan `MIDTRANS_SERVER_KEY` sama dengan yang dipakai Midtrans. |

## UI

| Gejala | Solusi |
|---|---|
| Dropdown menampilkan UUID | Komponen `Select` Base UI butuh prop `items`; sudah diterapkan. Kalau menambah select baru, sertakan `items`. |
| Halaman blank setelah rebuild | Hapus `.next`, restart server: `rm -rf .next && npm run build && npm start`. |
| Toast tidak terlihat | Sonner dipasang di root layout; pastikan tidak menutup `<Toaster />`. |
| Mode gelap tidak sesuai | Default light; toggle di sidebar/header. Preferensi tersimpan per browser. |
| Di ponsel sempit | Banner saran landscape muncul; board KDS tetap bisa scroll vertikal per kolom. |

## Database

| Gejala | Solusi |
|---|---|
| `no_open_shift` | Buka shift dulu di `/pos/shift`. |
| `table_occupied` | Meja sudah punya order terbuka; pakai "Tambah item" dari floor plan. |
| `approval_required` | Diskon melebihi batas outlet; masukkan PIN manager. |
| `insufficient_payment` | Total pembayaran kurang dari total order. |
| Stok tidak berubah | Pastikan resep menu terisi (`menu_item_ingredients`); tanpa resep tidak ada yang dipotong. |
| Tipe RPC tidak dikenal saat typecheck | `npm run db:types` (migrasi baru belum di-generate). |

## Reset total (lokal)

```bash
npm run db:stop
docker volume rm supabase_db_pos-kds 2>/dev/null || true
npm run db:start
npm run db:reset
```

> `db:reset` sudah melakukan drop + migrasi + seed; volume removal hanya perlu kalau schema benar-benar korup.
