# E2E (Playwright)

## PENTING: jangan jalankan lawan project Supabase produksi

Suite ini membuat, mengubah, dan menghapus data sungguhan (sales order, faktur,
stok, kas, dst.) sebagai bagian dari seeding & cleanup antar test -- bukan
cuma baca. Menjalankannya lawan project produksi bisa mengotori atau
menghapus data bisnis Anda yang sebenarnya.

Sebelum menjalankan test apa pun:

1. Buat project Supabase BARU khusus testing (gratis, tier terkecil cukup).
2. Jalankan semua migrasi di `supabase/migrations/` ke project test itu (cara
   sama seperti ke project produksi).
3. Buat minimal 1 user staf (lewat Supabase Auth Dashboard project test itu,
   bukan lewat aplikasi) dengan peran `owner` di tabel `profil` -- tambah 1 lagi
   dengan peran default (`sales`, tidak perlu langkah SQL tambahan) untuk
   `role-otorisasi.spec.ts`.
4. Salin `.env.test.example` di root jadi `.env.test`, isi dari project test
   tsb + kredensial user yang baru dibuat.
5. Baru jalankan `npm run test:e2e`.

## Menjalankan

```bash
npx playwright install --with-deps chromium   # sekali saja per mesin
npm run test:e2e          # headless, sekali jalan
npm run test:e2e:ui       # mode UI interaktif (rekomendasi saat menulis test baru)
npm run test:e2e:ci       # dipakai workflow CI (reporter GitHub Actions)
```

Report HTML hasil test terakhir: `npx playwright show-report`.

## Struktur

```
e2e/
  auth.owner.setup.ts          login sekali sebagai owner -> playwright/.auth/owner.json (project "setup-owner")
  auth.sales.setup.ts          login sekali sebagai sales -> playwright/.auth/sales.json (project "setup-sales")
  fixtures/auth-helper.ts      logika login bersama dipakai kedua file setup di atas
  fixtures/db.ts               seed/cleanup data referensi (produk, pelanggan, supplier) lewat Supabase langsung
  login.spec.ts                 Tier 1: login (happy path + salah sandi + kolom kosong + network error)
  penjualan-cepat.spec.ts       Tier 1: kasir cepat -- SO+SJ+Faktur+Kas sekaligus lewat 1 RPC
  sales-order-cycle.spec.ts     Tier 1: SO -> Surat Jalan -> Faktur Penjualan -> Penerimaan Kas
  purchase-order-cycle.spec.ts  Tier 1: PO -> Penerimaan Barang -> Faktur Pembelian -> Pembayaran Supplier
  retur-penjualan.spec.ts       Tier 1: retur penjualan freeform (tanpa faktur asal, biar berdiri sendiri)
  penyesuaian-stok.spec.ts      Tier 2: posting penyesuaian stok + validasi saldo awal wajib HPP
  tiket.spec.ts                 Tier 2: tiket CRM -- buat, ubah status
  umpan-balik-publik.spec.ts    Tier 2: link publik /u/:token tanpa login, dari sisi minta & isi
  impor-pesanan.spec.ts         Tier 2: unggah .xlsx (dibangun di memori), pemetaan kolom & produk otomatis
  role-otorisasi.spec.ts        Tier 2: satu-satunya file yang login sebagai 'sales' (project "chromium-sales")
```

Semua Tier 1 + 4/5 Tier 2 sudah lolos lawan project Supabase test sungguhan.
`role-otorisasi.spec.ts` menunggu `E2E_PASSWORD_SALES` di `.env.test` diisi.

## Kenapa produk/pelanggan/supplier dibuat lewat Supabase langsung, bukan lewat UI

`seedDataUji()` insert langsung ke tabel `produk`/`pelanggan`/`supplier` (plus stok awal lewat
`penyesuaian_stok`, jalur resmi yang sama seperti staf pakai) supaya tiap test punya data yang
BENAR-BENAR unik (nama diberi akhiran timestamp) dan tidak bentrok satu sama lain saat jalan
paralel. Dokumen transaksi (Sales Order, Purchase Order, Faktur, dst.) SENGAJA tetap dibuat lewat
klik UI di dalam test itu sendiri -- itu justru bagian yang mau diuji.

`hapusDataUji()` menghapus semua dokumen yang tersangkut ke data uji itu di akhir test
(`test.afterAll`), mengikuti urutan constraint foreign key di skema (lihat komentar di
`e2e/fixtures/db.ts`). Kalau sebuah test gagal di tengah jalan, cleanup tetap best-effort jalan
tapi mungkin menyisakan sedikit data ber-prefix `E2E-...` -- aman dibiarkan (jelas dikenali dari
namanya) atau dihapus manual lewat Supabase Studio project test.
