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

## ⚠️ Migrasi baru yang perlu dijalankan sekarang

Anda sudah menjalankan 0001-0010 (Kas & Bank sudah aktif) dan 0011
(field CRM + tabel wilayah, termasuk 3 import CSV wilayah). Setelah itu
ada **dua migrasi lagi**, kecil, tidak perlu import CSV apa pun:

```
supabase/migrations/0012_pelanggan_tipe_sumber.sql
supabase/migrations/0014_pelanggan_ringkas_view.sql
supabase/migrations/0015_pelanggan_akun_agregat.sql
supabase/migrations/0016_supplier_wilayah.sql
supabase/migrations/0017_sales_order_telepon_penerima.sql
```

0012 mengganti daftar Tipe Pelanggan (Customer/Mitra/Horeka/Perusahaan)
dan menambah field Sumber. 0014 mengganti view `v_limit_kredit` (dipakai
daftar Pelanggan) jadi `v_pelanggan_ringkas` -- isinya sekarang persis
field yang ada di form Pelanggan (Tipe, Kontak, Sales, Telepon, WhatsApp,
Email, Sumber, Tanggal lahir, Media sosial, Alamat gabungan), TANPA
Piutang (itu data transaksi, sudah ada tempatnya sendiri di Laporan
Piutang) dan tanpa Termin/Limit Kredit/Sisa Limit (sudah tidak
informatif lagi sejak field itu dihapus dari form). 0015 menandai 4
akun agregat marketplace (SHOPEE/TIKTOK/TOKPED/WA-UMUM) lewat kolom baru
`akun_agregat`, lalu menyembunyikannya dari daftar Pelanggan (datanya
tetap ada, masih dipakai alur pesanan online). 0016 menambah alamat
berjenjang (Provinsi/Kab-Kota/Kecamatan/Kelurahan) ke Supplier, sama
seperti Pelanggan. Semuanya aman dijalankan berkali-kali kalau perlu
diulang. 0017 menambah kolom `telepon_penerima` di Sales Order supaya
alamat & nomor HP terisi otomatis begitu Pelanggan dipilih. (Nomor
0013 sempat dibuat lalu dibatalkan/dihapus lagi -- lompat dari 0012 ke
0014 memang disengaja, bukan ada yang hilang.)

> Percobaan pertama migrasi ini menulis ~91.000 baris data wilayah
> sebagai SQL langsung dan **gagal ditempel** di SQL Editor ("Failed to
> rename snippet: request entity too large" -- itu batas ukuran bawaan
> Supabase, bukan masalah di kode). Sudah diperbaiki: sekarang migrasinya
> kecil, dan semua data besar lewat **Table Editor**, bukan SQL Editor.

### Langkah A -- jalankan migrasi (kecil, ~6 KB, aman ditempel)

```
supabase/migrations/0011_pelanggan_crm.sql
```

Cuma bikin tabel + kolom baru + seed 38 provinsi (kecil). Aman
dijalankan di database yang sudah ada datanya -- kolom baru di
`pelanggan` semuanya opsional, tabel `wilayah_*` baru dan kosong
sampai diisi lewat Langkah B.

### Langkah B -- import 3 file CSV lewat Table Editor (WAJIB, urutan penting)

Untuk **masing-masing** baris di bawah: Supabase Dashboard →
**Table Editor** → pilih tabelnya → klik **Insert** → **Import data
from CSV** → pilih file dari folder `supabase/seed-data/` di proyek.
Mapping kolom harusnya otomatis cocok (header CSV sama persis dengan
nama kolom tabel).

**Urutan wajib dari atas ke bawah** (kolom `kode`-nya foreign key
berjenjang -- tabel induk harus terisi dulu, kalau kebalik akan error):

1. Tabel `wilayah_kabupaten_kota` ← `wilayah_kabupaten_kota.csv` (514 baris)
2. Tabel `wilayah_kecamatan` ← `wilayah_kecamatan.csv` (7.285 baris)
3. Tabel `wilayah_kelurahan` ← `wilayah_kelurahan.csv` (83.762 baris, paling lama -- beberapa menit)

Tanpa langkah ini, dropdown wilayah di form Pelanggan cuma menampilkan
Provinsi lalu berhenti (kosong di level berikutnya).

Migrasi selanjutnya (kalau ada) akan bernomor `0012`, dst. -- selalu jalankan
yang belum pernah Anda jalankan, urut sesuai nomor.

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
supabase/migrations/       10 file migrasi (0001-0009 dijalankan, 0010 baru)
```

## Status

Semua menu di sidebar sudah punya layar sungguhan — tidak ada lagi
placeholder. `tsc --noEmit` dan `vite build` lolos di setiap langkah.
Aplikasi sudah dijalankan & login berhasil di Supabase asli Anda.

| Area | Layar | Status |
|---|---|---|
| Master | Produk, Supplier, Pelanggan | Selesai, CRUD penuh -- Pelanggan sekarang termasuk alamat berjenjang (Provinsi/Kab-Kota/Kecamatan/Kelurahan) dan field persiapan CRM |
| Kas & Bank | Akun Kas & Bank (saldo live), Kartu Kas & Bank (mutasi) | Selesai -- **butuh migrasi 0010**, lihat peringatan di atas |
| Wilayah | Data resmi Kemendagri (38 provinsi -> 83.762 kelurahan) untuk dropdown alamat Pelanggan | Selesai -- **butuh migrasi 0011 + 3 import CSV**, lihat peringatan di atas |
| Penjualan | Sales Order → Surat Jalan → Faktur → Penerimaan Kas → Retur | Selesai, ujung ke ujung |
| Pembelian | Purchase Order → Penerimaan Barang → Faktur Pembelian → Pembayaran Supplier → Retur | Selesai, ujung ke ujung |
| Inventori | Stok per Gudang, Kartu Stok, Penyesuaian Stok | Selesai |
| Laporan | Piutang (aging), Laba Kotor (per produk/pelanggan) | Selesai |
| Dasbor | Ringkasan 30 hari, tren omzet, produk perlu restock | Selesai |
| Tampilan | Logo & tema warna Ayyubi Food, glassmorphism di sidebar/login | Selesai |
| — | Transfer Gudang | Skema siap, UI sengaja belum dibuat — tidak berguna selama masih 1 gudang aktif |
| Fase 3 | CRM (pipeline, kunjungan sales, loyalty) | Belum dirancang |
| Fase 4 | Akuntansi penuh (jurnal, buku besar), pajak, HR | Belum dirancang |

Setelah migrasi 0010 dijalankan, coba alur: buat/pilih akun Kas & Bank →
Catat Pembayaran atau Bayar Supplier → cek saldo akunnya berubah di
halaman Kas & Bank dan riwayatnya muncul di Kartu Kas & Bank.
