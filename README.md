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

## ✅ Status migrasi

Semua migrasi sampai **0018** sudah dijalankan di database live Anda
(0001-0012, 0014-0018 -- nomor 0013 sengaja tidak ada, dibatalkan
sebelum sempat dijalankan, bukan ada yang hilang). Termasuk 3 file CSV
wilayah (`supabase/seed-data/`) yang sudah diimpor lewat Table Editor.
Tidak ada migrasi yang tertunda saat ini.

Kalau ada migrasi baru ke depan, nomornya lanjut dari **0019** dan akan
disebutkan secara eksplisit di sini setiap kali dibuat -- migrasi
tidak pernah dijalankan otomatis, selalu manual lewat SQL Editor
Supabase, dan setiap file aman dijalankan berkali-kali (idempotent).

---

## Yang harus Anda kerjakan (setup dari nol)

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
supabase/migrations/0010_kas_bank.sql
supabase/migrations/0011_pelanggan_crm.sql
supabase/migrations/0012_pelanggan_tipe_sumber.sql
supabase/migrations/0014_pelanggan_ringkas_view.sql
supabase/migrations/0015_pelanggan_akun_agregat.sql
supabase/migrations/0016_supplier_wilayah.sql
supabase/migrations/0017_sales_order_telepon_penerima.sql
supabase/migrations/0018_surat_jalan_penerima.sql
```

Kalau ada error, **berhenti dan kirim pesan errornya ke saya** — jangan
lanjut ke file berikutnya. Urutan file ini saling bergantung.

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
3. **Akun Kas & Bank** (Kas & Bank → Akun Baru) — minimal satu, mis. "Kas
   Toko". Sudah ada default "Kas Utama" dari migrasi 0010, tinggal tambah
   yang lain kalau punya rekening bank juga. Setiap Penerimaan Kas/
   Pembayaran Supplier wajib memilih salah satu akun ini.
4. **Saldo awal stok** — Inventori → Penyesuaian Stok → Baru, pilih jenis
   "Saldo Awal", isi qty + HPP per produk, lalu Posting.
5. Dari sini alur normal: **Purchase Order** → Penerimaan Barang, atau
   langsung **Sales Order** → Surat Jalan → Faktur → Penerimaan Kas.

---

## Sebelum mulai pakai sungguhan (go-live)

Selama ini Anda menguji coba aplikasi dengan data & transaksi
percobaan. Begitu siap dipakai sungguhan (bukan sekarang -- nanti,
kalau sudah yakin), bersihkan dulu angka-angka hasil uji coba supaya
mulai dari nol:

```
supabase/reset-sebelum-live.sql
```

**Ini BUKAN migrasi** -- sengaja tidak ditaruh di `supabase/migrations/`
dan tidak dijalankan sebagai bagian dari urutan migrasi biasa. Jalankan
manual di SQL Editor, **satu kali saja**, tepat sebelum go-live.

- **Dihapus**: semua dokumen transaksi (Sales Order, Surat Jalan,
  Faktur, Penerimaan Kas, Purchase Order, Penerimaan Barang,
  Pembayaran Supplier, Retur, Penyesuaian Stok) beserta kartu stok dan
  nomor urut dokumen (penomoran mulai dari 00001 lagi).
- **Direset ke 0**: HPP rata-rata produk, saldo awal Akun Kas & Bank.
- **Tetap utuh**: Produk, Kategori, Pelanggan, Supplier, Gudang, Akun
  Kas & Bank (akunnya, cuma saldonya yang di-reset), Wilayah, dan
  akun login Anda.

> **Ini operasi permanen, tidak bisa dibatalkan.** Kalau ada data uji
> coba yang ingin disimpan sebagai catatan, export dulu tabelnya lewat
> Table Editor → Export sebelum menjalankan script ini.

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
public/ayyubi-logo.jpeg    logo resmi -- favicon + sidebar + login
supabase/migrations/       17 file migrasi, semua sudah dijalankan (lihat Status migrasi di atas)
supabase/reset-sebelum-live.sql  script reset data uji coba -- BUKAN migrasi, jalankan manual sebelum go-live
```

## Status

Semua menu di sidebar sudah punya layar sungguhan — tidak ada lagi
placeholder. `tsc --noEmit` dan `vite build` lolos di setiap langkah.
Aplikasi sudah dijalankan & login berhasil di Supabase asli Anda.

| Area | Layar | Status |
|---|---|---|
| Master | Produk, Supplier, Pelanggan, Gudang | Selesai, CRUD penuh -- Pelanggan sekarang termasuk alamat berjenjang (Provinsi/Kab-Kota/Kecamatan/Kelurahan) dan field persiapan CRM; Gudang baru (kode/nama/alamat/status utama) |
| Kas & Bank | Akun Kas & Bank (saldo live), Kartu Kas & Bank (mutasi) | Selesai |
| Wilayah | Data resmi Kemendagri (38 provinsi -> 83.762 kelurahan) untuk dropdown alamat Pelanggan & Supplier | Selesai |
| Cetak | Invoice (Faktur Penjualan, A4) dan label pengiriman (Surat Jalan, A6) | Selesai -- logo ekspedisi (JNE/dll.) masih teks, belum gambar logo asli (kirim file kalau mau diganti) |
| Penjualan | Sales Order → Surat Jalan → Faktur → Penerimaan Kas → Retur | Selesai, ujung ke ujung |
| Pembelian | Purchase Order → Penerimaan Barang → Faktur Pembelian → Pembayaran Supplier → Retur | Selesai, ujung ke ujung |
| Inventori | Stok per Gudang, Kartu Stok, Penyesuaian Stok | Selesai |
| Laporan | Piutang (aging), Laba Kotor (per produk/pelanggan) | Selesai |
| Dasbor | Ringkasan 30 hari, tren omzet, produk perlu restock | Selesai |
| Tampilan | Logo & tema warna Ayyubi Food, glassmorphism di sidebar/login | Selesai |
| — | Transfer Gudang | Skema siap, UI sengaja belum dibuat — tidak berguna selama masih 1 gudang aktif |
| Fase 3 | CRM (pipeline, kunjungan sales, loyalty) | Belum dirancang |
| Fase 4 | Akuntansi penuh (jurnal, buku besar), pajak, HR | Belum dirancang |

Alur yang bisa dicoba: buat/pilih akun Kas & Bank → Catat Pembayaran
atau Bayar Supplier → cek saldo akunnya berubah di halaman Kas & Bank
dan riwayatnya muncul di Kartu Kas & Bank.
