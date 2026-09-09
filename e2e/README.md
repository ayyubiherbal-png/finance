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
  fixtures/     auth fixture (login sekali per peran, reuse storageState) + helper seed/cleanup Supabase
  <journey>.spec.ts   satu file per critical user journey yang disetujui
```
