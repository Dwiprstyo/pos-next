# Database

Semua definisi ada di `supabase/migrations/`. Urutan migrasi:

| # | File | Isi |
|---|---|---|
| 1 | `..._schema.sql` | Tabel, enum, indeks, FK |
| 2 | `..._functions.sql` | RPC, trigger, helper |
| 3 | `..._rls.sql` | Policy RLS + revoke kolom sensitif |
| 4 | `..._views.sql` | View KDS, materialized view laporan, fungsi report |
| 5 | `..._grants_realtime.sql` | Grant fungsi + policy `realtime.messages` |
| 6 | `..._fixes_gateway.sql` | Fix `can_access_outlet` + `settle_gateway_payment` |
| 7 | `..._owner_table_gateway.sql` | Fix hook owner, meja opsional, status pembayaran |

## Enum

| Enum | Nilai |
|---|---|
| `staff_role` | `cashier`, `kitchen`, `manager` |
| `table_status` | `empty`, `occupied`, `unpaid` |
| `order_type` | `dine_in`, `takeaway` |
| `order_status` | `open`, `paid`, `void` |
| `kitchen_status` | `new`, `cooking`, `ready`, `served` |
| `payment_method` | `cash`, `qris`, `card`, `ewallet` |
| `payment_status` | `pending`, `paid`, `failed` |

## Tabel inti

### `outlets`
Konfigurasi per outlet: `tax_percent`, `service_charge_percent`, `discount_approval_threshold`, `timezone`, `is_active`.

### `staff`
`user_id` (auth), `outlet_id` (null untuk owner), `staff_code`, `pin_hash`, `failed_pin_attempts`, `locked_until`, `is_multi_outlet`, `is_active`.
Unik: `(outlet_id, staff_code)`; owner unik global via partial index.

### `shifts`
`opening_cash`, `closing_cash_expected`, `closing_cash_actual`, `cash_variance` (generated), `opened_at`, `closed_at`.
Partial unique index: satu shift terbuka per staff.

### `dining_tables`
`label`, `status`, `current_order_id`. Satu meja satu order aktif.

### `menu_categories` / `menu_items` / `variant_groups` / `variant_options`
Kategori punya `station` (`kitchen`/`bar`). Item punya `base_price`, `is_available`. Varian punya `is_required`, `min_select`, `max_select`, `extra_price`.

### `ingredients` / `menu_item_ingredients`
Stok bahan + resep (`qty_required` per menu). `current_stock` boleh negatif (tidak memblokir penjualan, hanya alert).

### `orders`
`order_number` (identity, untuk tampilan), `client_id` (idempotency offline), `shift_id`, `table_id` (**nullable**), `subtotal`, `discount_*`, `tax_amount`, `total`, `created_by`, `voided_by`, `void_reason`, `paid_at`.

### `order_items`
Snapshot `menu_name`, `station`, `unit_price`; `outlet_id` didenormalisasi untuk realtime/RLS; `kitchen_status` + audit update.

### `order_item_variants`
Snapshot `variant_name` + `extra_price`.

### `payments`
`method`, `amount`, `reference_no` (unik, idempotency webhook), `idempotency_key` (unik), `status` (`pending`/`paid`/`failed`), `gateway_response`.

### `stock_transactions`
Audit mutasi stok: `qty_change` (negatif = keluar), `reason` (`sale`, `void_restock`, `manual_adjustment`, `restock`).

### `audit_logs`
Append-only: actor, outlet, `action`, `entity_type/id`, `metadata`.

## RPC (semua `security definer`)

| Fungsi | Actor | Kegunaan |
|---|---|---|
| `create_order(client_id, table_id?, order_type, items)` | cashier/manager | Buat order + item + varian atomik, hitung harga server-side |
| `add_order_items(order_id, items)` | cashier/manager | Tambah item ke order terbuka |
| `apply_order_discount(order_id, type, value)` | cashier/manager | Diskon ≤ threshold |
| `apply_order_discount(order_id, type, value, approver_id)` | **service_role** | Diskon dengan approval manager (PIN diverifikasi di Node) |
| `pay_order(order_id, payments, idempotency_key?)` | cashier/manager | Catat pembayaran, tandai paid, trigger stok |
| `void_order(order_id, reason)` | manager | Void oleh manager login |
| `void_order(order_id, reason, approver_id)` | **service_role** | Void dengan approval PIN manager |
| `create_gateway_payment(order_id, method, amount, ref, response, idempotency_key)` | cashier/manager | Simpan pembayaran pending (QRIS/e-wallet) |
| `settle_gateway_payment(order_id, method, amount, ref, response, status)` | **service_role** | Settle/flag gagal dari webhook/polling |
| `set_kitchen_status(item_id, new_status)` | kitchen/manager | State machine `new→cooking→ready→served` |
| `open_shift(opening_cash)` | cashier/manager | Buka shift (idempotent) |
| `close_shift(shift_id, actual_cash)` | pemilik shift/owner | Hitung expected + variance |
| `adjust_stock(ingredient_id, qty_change, reason)` | manager | Mutasi stok manual |
| `refresh_daily_sales_summary()` | manager/service_role | Refresh materialized view |
| `daily_sales(from, to, outlet?)` | manager | Laporan harian (owner: semua outlet) |
| `top_selling_items(from, to, outlet?, limit?)` | manager | Menu terlaris |
| `shift_summary(shift_id)` | pemilik shift | Rekap kas shift |

## Trigger

| Trigger | Tabel | Efek |
|---|---|---|
| `trg_fill_order_item_denorm` | `order_items` BEFORE INSERT | Isi `outlet_id`, snapshot `menu_name`/`station` |
| `trg_deduct_stock` | `orders` AFTER UPDATE | `open→paid`: potong stok sesuai resep; `paid→void`: kembalikan stok |
| `trg_broadcast_order_item` | `order_items` AFTER INSERT/UPDATE | `realtime.send` payload KDS |
| `trg_broadcast_order` | `orders` AFTER INSERT/UPDATE | Sinyal perubahan status order ke KDS |

## View & laporan

- **`kds_order_items_view`** — definer view, hanya order non-void & item belum served; kolom: id, order, nomor, tipe, status, label meja, nama menu, qty, catatan, station, status dapur, varian (agregat), timestamp. **Tanpa harga.**
- **`daily_sales_summary`** — materialized view: per outlet per tanggal, jumlah order, bruto, diskon, pajak, net, tunai, non-tunai. Refresh lewat `refresh_daily_sales_summary()`.
- **`shift_summary`** — rekap kas per shift (tunai, non-tunai, expected).

## Indeks penting

```sql
orders (outlet_id, status, created_at desc)
orders (shift_id)
orders (outlet_id, table_id) where status = 'open'
orders (client_id) unique where client_id is not null
order_items (order_id)
order_items (outlet_id, kitchen_status) where kitchen_status <> 'served'
payments (reference_no) unique where not null
payments (idempotency_key) unique where not null
payments (order_id, status)
shifts (staff_id) unique where closed_at is null
```

## Alur stok

```
pay_order → orders.status = 'paid'
  → trg_deduct_stock:
      insert stock_transactions (qty negatif, reason 'sale')
      update ingredients.current_stock += delta
void (setelah paid)
  → insert stock_transactions (qty positif, reason 'void_restock')
  → stok kembali
```

Semua mutasi stok tercatat di `stock_transactions` (termasuk penyesuaian manual), jadi bisa diaudit.
