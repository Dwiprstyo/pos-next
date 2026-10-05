# Pembayaran

## Arsitektur

```
src/lib/payments/
├─ types.ts     # PaymentProvider interface + PaymentRequest/Result
├─ cash.ts      # CashPaymentProvider (selalu tersedia)
├─ midtrans.ts  # MidtransProvider (QRIS / e-wallet) + helper status
└─ index.ts     # getPaymentProvider(method) + isMidtransConfigured()
```

`PaymentProvider.charge()` mengembalikan:

```ts
{ status: 'paid' | 'pending' | 'failed', referenceNo?, gatewayResponse?, instructions? }
```

- **paid** → langsung `pay_order` (order lunas, stok terpotong).
- **pending** → `create_gateway_payment` menyimpan pembayaran `pending`, UI menampilkan QR/deeplink dan polling.
- **failed** → pesan error; order tetap `open`.

## Tunai (default)

Selalu aktif, tanpa konfigurasi. `referenceNo` dibuat lokal (`CASH-<orderNumber>-<timestamp>`), `gateway_response.tendered` menyimpan uang diterima. Kembalian dihitung di UI; `payments.amount` = total order.

## Midtrans

### Setup

1. Daftar di [Midtrans](https://midtrans.com) dan ambil Server Key + Client Key (sandbox dulu).
2. Set environment:

```bash
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxx
MIDTRANS_IS_PRODUCTION=false
```

3. Di Dashboard Midtrans → Settings → Configuration:
   - **Payment Notification URL**: `https://<domain-anda>/api/payments/webhook/midtrans`
   - Aktifkan metode QRIS (dan GoPay untuk e-wallet).
4. Tanpa `MIDTRANS_SERVER_KEY`, tombol QRIS/e-wallet/kartu otomatis nonaktif dan checkout hanya menerima tunai.

### Yang diimplementasikan

- **QRIS** — Core API `POST /v2/charge` `payment_type: "qris"`, `acquirer: "gopay"`; QR diambil dari `actions[name=generate-qr-code].url`.
- **E-wallet** — `payment_type: "gopay"` dengan callback URL; deeplink dari `actions[name=deeplink-redirect]`.
- **Kartu** — belum didukung (Core API butuh card token/3DS dari client).

### Alur pending

```
Checkout (QRIS) → payOrderAction
  → MidtransProvider.charge → status 'pending'
  → rpc create_gateway_payment (payments.status = 'pending')
  → dialog QR + polling tiap 3 detik:
      checkPaymentStatusAction(orderId)
        → GET Midtrans /v2/{order_id}/status
        → settlement/capture → settle_gateway_payment(paid) → order paid
        → deny/cancel/expire  → settle_gateway_payment(failed)
```

### Webhook

`POST /api/payments/webhook/midtrans`

- Verifikasi signature: `sha512(order_id + status_code + gross_amount + server_key)` dibandingkan `signature_key` (timing-safe).
- Cari payment berdasarkan `reference_no = transaction_id`, fallback `gateway_response->>order_id`.
- `settlement`/`capture` → paid; `deny`/`cancel`/`expire`/`failure` → failed; `pending` diabaikan.
- Replay aman: `reference_no` unik + `settle_gateway_payment` idempotent.

> Untuk testing lokal, webhook Midtrans tidak bisa menjangkau `localhost`. Gunakan polling `checkPaymentStatusAction` (berjalan otomatis), atau tunnel (ngrok/cloudflared) untuk menguji webhook.

### Webhook generik

`POST /api/payments/webhook` untuk provider lain:

- Header `x-signature` = HMAC-SHA256 body dengan `PAYMENT_GATEWAY_WEBHOOK_SECRET`.
- Body: `{ order_id, method, amount, reference_no, gateway_response? }`.
- Tanpa secret → endpoint balas `503` (sengaja tidak aktif).

## Idempotency

| Lapisan | Kunci | Efek |
|---|---|---|
| `orders.client_id` | UUID dari client | Retry offline tidak menggandakan order |
| `payments.idempotency_key` | UUID per checkout | Retry aksi bayar tidak menggandakan payment |
| `payments.reference_no` | ID transaksi gateway | Webhook replay tidak menggandakan settlement |

## Split payment

Skema mendukung banyak baris `payments` per order (tabel + validasi total di `settle_gateway_payment`). UI saat ini mengirim satu metode per checkout; split payment bisa ditambahkan tanpa perubahan skema.
