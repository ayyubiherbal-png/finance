# Ayyubi Finance

Aplikasi bisnis **dagang / distribusi** end-to-end: pengadaan → persediaan →
penjualan → penagihan → laporan. Fokus bisnis di awal: **B2C** — canvassing
dan online (Tokopedia/Shopee/TikTok/WhatsApp), non-PKP.

React + TypeScript + Vite + Tailwind + TanStack Query + Supabase.

Rancangan database (Fase 1 & 2) ada di [`supabase/README.md`](supabase/README.md) —
39+ tabel, 12 view, HPP rata-rata bergerak, RLS 5 peran. Bagian "Keputusan
desain" di situ menjelaskan kanal penjualan, non-PKP, dan hal lain yang
memengaruhi bentuk form.

---

## Yang harus Anda kerjakan

### 1. Buat proyek Supabase

Buka [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
Catat **Project URL**, **anon key**, dan **Project ID** dari
*Project Settings → API*.

> Ini harus Anda sendiri yang lakukan — pembuatan akun/layanan dan
> penanganan kredensial bukan sesuatu yang saya kerjakan untuk Anda.

### 2. Jalankan migrasi

Di Supabase Dashboard → **SQL Editor**, jalankan berurutan:

```
supabase/migrations/0001_ekstensi_enum.sql
supabase/migrations/0002_master_data.sql
supabase/migrations/0003_inventori.sql
supabase/migrations/0004_penjualan.sql
supabase/migrations/0005_pembelian.sql
supabase/migrations/0006_fungsi_trigger.sql
supabase/migrations/0007_view_laporan.sql
supabase/migrations/0008_rls.sql
supabase/migrations/0009_seed_awal.sql
```

Kalau ada error, **berhenti dan kirim pesan errornya ke saya** — jangan
lanjut ke file berikutnya. Urutan file ini saling bergantung.

**Belum pernah dijalankan di Postgres asli** — file-file ini baru pernah
lolos review statis, belum pernah benar-benar tersentuh Postgres.

### 3. Isi kredensial

```bash
cp .env.example .env
```

Isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`.

### 4. Buat user pertama dan jadikan owner

Dashboard → **Authentication → Users → Add user** (isi email + password,
centang *Auto Confirm User*). Lalu di SQL Editor:

```sql
update profil set peran = 'owner' where id = '<uuid-user-yang-baru>';
```

Profilnya dibuat otomatis oleh trigger dengan peran default `sales`;
perintah di atas menaikkannya sekali saja.

### 5. Jalankan aplikasi

```bash
npm install
npm run dev
```

Buka http://localhost:5174 dan login.

### 6. Generate tipe database (opsional, disarankan)

```bash
npx supabase login
SUPABASE_PROJECT_ID=<project-id> npm run db:types
```

Menghasilkan `src/types/database.ts` lengkap dari database asli.
Sementara ini `src/types/db.ts` berisi tipe hasil pemetaan manual.

### 7. Isi data lewat aplikasi, bukan SQL manual

Sekarang seluruh alur bisa dikerjakan dari UI, urutan yang masuk akal:

1. **Produk** (Master → Produk Baru) — isi detail, satuan dasar; produk
   bisa langsung dipakai begitu tersimpan. Tambah satuan berjenjang
   (mis. LUSIN, DUS) dan harga jual per tier di halaman edit produknya.
2. **Supplier** dan **Pelanggan** (kalau bukan lewat kanal online — order
   online otomatis pakai akun agregat SHOPEE/TOKPED/TIKTOK/WA-UMUM dari
   seed, tidak perlu bikin pelanggan manual per pembeli).
3. **Saldo awal stok** — Inventori → Penyesuaian Stok → Baru, pilih jenis
   "Saldo Awal", isi qty + HPP per produk, lalu Posting.
4. Dari sini alur normal: **Purchase Order** → Penerimaan Barang, atau
   langsung **Sales Order** → Surat Jalan → Faktur → Penerimaan Kas.

---

## Struktur

```
src/lib/supabase.ts        client + guard env var
src/lib/format.ts          rupiah(), angka(), tanggal() locale id-ID
src/lib/queries.ts         hook react-query bersama (gudang, tier, satuan produk,
                            RPC harga_produk, pencarian produk/pelanggan/supplier)
src/types/db.ts            enum + tipe tabel & view
src/contexts/AuthContext.tsx
src/components/ui.tsx      Button, Input, Card, Table, Badge, Spinner
src/components/Combobox.tsx  dropdown pencarian generik (produk/pelanggan/supplier)
src/components/Layout.tsx  sidebar, gating menu per peran
src/pages/                 satu file per layar (lihat tabel Status di bawah)
supabase/migrations/       9 file migrasi
```

## Status

Semua menu di sidebar sudah punya layar sungguhan — tidak ada lagi
placeholder. `tsc --noEmit` dan `vite build` lolos di setiap langkah.

| Area | Layar | Status |
|---|---|---|
| Master | Produk, Supplier, Pelanggan | Selesai (CRUD penuh untuk Produk & Supplier) |
| Penjualan | Sales Order → Surat Jalan → Faktur → Penerimaan Kas → Retur | Selesai, ujung ke ujung |
| Pembelian | Purchase Order → Penerimaan Barang → Faktur Pembelian → Pembayaran Supplier → Retur | Selesai, ujung ke ujung |
| Inventori | Stok per Gudang, Kartu Stok, Penyesuaian Stok | Selesai |
| Laporan | Piutang (aging), Laba Kotor (per produk/pelanggan) | Selesai |
| Dasbor | Ringkasan 30 hari, produk perlu restock | Selesai |
| — | Transfer Gudang | Skema siap, UI sengaja belum dibuat — tidak berguna selama masih 1 gudang aktif |
| Fase 3 | CRM (pipeline, kunjungan sales, loyalty) | Belum dirancang |
| Fase 4 | Akuntansi penuh, pajak, HR | Belum dirancang |

**Belum pernah diverifikasi jalan beneran di browser** — sesi kerja yang
membangun ini belum punya kredensial Supabase asli. Begitu Anda selesai
langkah 1-6 di atas, tolong coba alur intinya dan kabari kalau ada yang
janggal: buat produk → isi saldo awal → jual → kirim → tagih → bayar,
lalu cek Stok/Laporan menampilkan angka yang benar.
