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
   bukan lewat aplikasi) dengan peran `owner` di tabel `profil` -- tambah
   lebih banyak kalau ada journey yang butuh uji peran lain (sales/gudang/finance).
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
  auth.setup.ts               login sekali sebagai owner, simpan storageState -> playwright/.auth/owner.json
  fixtures/db.ts              seed/cleanup data referensi (produk, pelanggan, supplier) lewat Supabase langsung
  login.spec.ts                Tier 1: login (happy path + salah sandi + kolom kosong + network error)
  penjualan-cepat.spec.ts      Tier 1: kasir cepat -- SO+SJ+Faktur+Kas sekaligus lewat 1 RPC
  sales-order-cycle.spec.ts    Tier 1: SO -> Surat Jalan -> Faktur Penjualan -> Penerimaan Kas
  purchase-order-cycle.spec.ts Tier 1: PO -> Penerimaan Barang -> Faktur Pembelian -> Pembayaran Supplier
  retur-penjualan.spec.ts      Tier 1: retur penjualan freeform (tanpa faktur asal, biar berdiri sendiri)
```

Tier 2 (otorisasi peran, umpan balik publik, impor pesanan, CRM/follow-up) belum ditulis --
menunggu keputusan lanjut setelah Tier 1 ini stabil jalan lawan project test Anda.

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
