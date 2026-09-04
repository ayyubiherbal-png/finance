# Ayyubi Finance

Aplikasi bisnis **dagang / distribusi** end-to-end: pengadaan → persediaan →
penjualan → penagihan → laporan.

React + TypeScript + Vite + Tailwind + TanStack Query + Supabase.

Rancangan database (Fase 1 & 2) ada di [`supabase/README.md`](supabase/README.md) —
39 tabel, 12 view, HPP rata-rata bergerak, RLS 5 peran.

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

### 7. Isi master data (urutannya penting)

1. **Gudang** — sudah ada `GD-01 Gudang Pusat` dari seed
2. **Kategori produk**
3. **Satuan** — sudah ada PCS, LSN, DUS, KRT, PAK, KG, BOX
4. **Produk** + baris `produk_satuan` (wajib ada satuan dasar dengan `konversi = 1`)
5. **Tier harga** — sudah ada RETAIL / SEMI / GROSIR / KONTRAK
6. **Daftar harga** (`produk_harga`) per produk × tier × satuan
7. **Pelanggan** (termin + limit kredit) dan **Supplier**
8. **Saldo awal stok** lewat `penyesuaian_stok` dengan `jenis = 'saldo_awal'`
   — `hpp_satuan` wajib diisi, karena itulah HPP awal produk Anda

---

## Yang saya butuhkan dari Anda untuk lanjut

Empat keputusan ini mengubah bentuk form transaksi:

| Pertanyaan | Kenapa penting |
|---|---|
| Ayyubi PKP (pungut PPN) atau tidak? | Menentukan field PPN ditampilkan atau disembunyikan di semua form |
| Satu gudang atau beberapa? | Kalau satu, pilihan gudang bisa dihilangkan dari semua form |
| Sales canvassing (bawa barang) atau taking order (catat pesanan dulu)? | Canvassing butuh SO+SJ+Faktur dalam satu layar; taking order butuh alur bertahap |
| Faktur = surat jalan, atau 1 faktur untuk beberapa pengiriman? | Menentukan perlu tidaknya pemilih multi-surat-jalan |

---

## Struktur

```
src/lib/supabase.ts        client + guard env var
src/lib/format.ts          rupiah(), angka(), tanggal() locale id-ID
src/types/db.ts            enum + tipe tabel & view
src/contexts/AuthContext.tsx
src/components/ui.tsx      Button, Input, Card, Table, Badge, Spinner
src/components/Layout.tsx  sidebar, gating menu per peran
src/pages/                 Login, Dashboard, Produk, Pelanggan, SegeraHadir
supabase/migrations/       9 file migrasi
```

## Status

| Bagian | Status |
|---|---|
| Skema database Fase 1 & 2 | Selesai, **belum pernah dijalankan di Postgres asli** |
| Scaffold React + TS + Query + Tailwind | Selesai, `tsc --noEmit` dan `vite build` lolos |
| Login, Dasbor, Produk, Pelanggan | Selesai (baca dari view) |
| Sales Order, Surat Jalan, Faktur, PO, Penerimaan Barang | Placeholder `SegeraHadir` |
| CRM, akuntansi, HR | Fase 3 & 4, belum dirancang |
