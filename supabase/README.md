# Skema Database — Ayyubi Finance (Fase 1 & 2)

Postgres / Supabase. Penamaan tabel dan kolom memakai bahasa Indonesia
agar konsisten dengan istilah yang dipakai di lapangan.

Cakupan file ini: **Fase 1** (jual sampai terima uang) dan **Fase 2**
(beli, HPP, laba). CRM, akuntansi penuh, dan HR belum termasuk.

---

## 1. Ringkasan modul

| Migrasi | Isi |
|---|---|
| `0001_ekstensi_enum.sql` | Ekstensi, enum, penomoran dokumen otomatis |
| `0002_master_data.sql` | Profil, gudang, kategori, satuan, produk, satuan berjenjang, tier & daftar harga, pelanggan, supplier |
| `0003_inventori.sql` | Saldo stok, kartu stok, penyesuaian, transfer gudang |
| `0004_penjualan.sql` | SO → Surat Jalan → Faktur → Penerimaan Kas, retur jual |
| `0005_pembelian.sql` | PO → Penerimaan Barang → Faktur Beli → Pembayaran, retur beli |
| `0006_fungsi_trigger.sql` | HPP rata-rata bergerak, posting stok, total dokumen, limit kredit |
| `0007_view_laporan.sql` | Stok, kartu stok, aging piutang/hutang, laba kotor |
| `0008_rls.sql` | Row Level Security per peran |
| `0009_seed_awal.sql` | Satuan, tier harga, gudang, kategori awal |
| `0010_kas_bank.sql` | Akun kas/bank, saldo & kartu per akun -- **migrasi tambahan**, ditulis setelah 0001-0009 sudah dijalankan di database asli, jadi dirancang non-destruktif (backfill, bukan drop/replace) |
| `0011_pelanggan_crm.sql` | Field persiapan CRM di `pelanggan` + 4 tabel wilayah administratif (Provinsi/Kab-Kota/Kecamatan/Kelurahan), data resmi Kemendagri -- **butuh langkah tambahan**: 3 import CSV terpisah dari SQL (kab/kota, kecamatan, kelurahan), lihat README.md |
| `0012_pelanggan_tipe_sumber.sql` | Ganti total daftar `tipe_pelanggan` (Customer/Mitra/Horeka/Perusahaan, dari 5 nilai lama) + kolom `sumber` (ganti `kanal_akuisisi`) |

Total 44 tabel + 14 view (di luar ~91.600 baris data referensi wilayah).
Migrasi 0010 dan seterusnya adalah tambahan
inkremental di atas skema Fase 1 & 2 -- selalu jalankan berurutan sesuai
nomor, jangan lompat.

---

## 2. ERD

### 2.1 Master data

```mermaid
erDiagram
    KATEGORI_PRODUK ||--o{ KATEGORI_PRODUK : "sub-kategori"
    KATEGORI_PRODUK ||--o{ PRODUK : "mengelompokkan"
    SATUAN          ||--o{ PRODUK : "satuan dasar"
    PRODUK          ||--o{ PRODUK_SATUAN : "konversi berjenjang"
    SATUAN          ||--o{ PRODUK_SATUAN : ""
    PRODUK          ||--o{ PRODUK_HARGA : "daftar harga"
    TIER_HARGA      ||--o{ PRODUK_HARGA : ""
    SATUAN          ||--o{ PRODUK_HARGA : ""
    TIER_HARGA      ||--o{ PELANGGAN : "harga default"
    PROFIL          ||--o{ PELANGGAN : "salesman"

    PRODUK {
        uuid    id PK
        text    kode "SKU, unik"
        text    nama
        uuid    satuan_dasar_id FK
        numeric hpp_rata2 "dihitung trigger"
        numeric stok_min
    }
    PRODUK_SATUAN {
        uuid    produk_id FK
        uuid    satuan_id FK
        numeric konversi "berapa satuan dasar per 1 satuan ini"
    }
    PRODUK_HARGA {
        uuid    produk_id FK
        uuid    tier_harga_id FK
        uuid    satuan_id FK
        numeric min_qty "diskon bertingkat"
        numeric harga
        date    berlaku_mulai
    }
    PELANGGAN {
        uuid    id PK
        text    kode
        text    nama
        uuid    tier_harga_id FK
        uuid    sales_id FK
        text    termin "cod / tempo"
        int     termin_hari
        numeric limit_kredit
    }
```

### 2.2 Inventori — semua pergerakan bermuara ke sini

```mermaid
erDiagram
    PRODUK ||--o{ STOK : ""
    GUDANG ||--o{ STOK : ""
    PRODUK ||--o{ STOK_MUTASI : ""
    GUDANG ||--o{ STOK_MUTASI : ""

    PENYESUAIAN_STOK ||--o{ PENYESUAIAN_STOK_ITEM : ""
    TRANSFER_GUDANG  ||--o{ TRANSFER_GUDANG_ITEM : ""
    GUDANG           ||--o{ TRANSFER_GUDANG : "asal / tujuan"

    STOK {
        uuid    produk_id PK
        uuid    gudang_id PK
        numeric qty "satuan dasar, hanya trigger yang mengubah"
    }
    STOK_MUTASI {
        bigint  id PK
        date    tanggal
        uuid    produk_id FK
        uuid    gudang_id FK
        enum    jenis "pembelian/penjualan/retur/transfer/penyesuaian"
        numeric qty_dasar "+ masuk, - keluar"
        numeric hpp_satuan "HPP saat mutasi terjadi"
        text    ref_tabel "dokumen sumber"
        uuid    ref_id
    }
```

`STOK_MUTASI` adalah buku besar persediaan: **append-only**, tidak boleh
di-`UPDATE` atau `DELETE` (dijaga trigger). Tabel `STOK` hanyalah saldo
hasil rekap agar query cepat.

### 2.3 Siklus penjualan (Fase 1)

```mermaid
erDiagram
    PELANGGAN    ||--o{ SALES_ORDER : ""
    SALES_ORDER  ||--o{ SALES_ORDER_ITEM : ""
    SALES_ORDER  ||--o{ SURAT_JALAN : "kirim bertahap"
    SURAT_JALAN  ||--o{ SURAT_JALAN_ITEM : ""
    SALES_ORDER_ITEM ||--o{ SURAT_JALAN_ITEM : "realisasi kirim"

    FAKTUR_PENJUALAN ||--o{ FAKTUR_PENJUALAN_ITEM : ""
    FAKTUR_PENJUALAN ||--o{ FAKTUR_PENJUALAN_SJ : "menagih 1..n surat jalan"
    SURAT_JALAN      ||--o{ FAKTUR_PENJUALAN_SJ : ""
    PELANGGAN        ||--o{ FAKTUR_PENJUALAN : ""

    PENERIMAAN_KAS ||--o{ PENERIMAAN_KAS_ALOKASI : "1 bayar -> n faktur"
    FAKTUR_PENJUALAN ||--o{ PENERIMAAN_KAS_ALOKASI : ""
    PELANGGAN      ||--o{ PENERIMAAN_KAS : ""

    PELANGGAN        ||--o{ RETUR_PENJUALAN : ""
    RETUR_PENJUALAN  ||--o{ RETUR_PENJUALAN_ITEM : ""

    SALES_ORDER {
        uuid   id PK
        text   nomor "SO/2026/09/00001"
        uuid   pelanggan_id FK
        uuid   gudang_id FK
        enum   status "draf..selesai"
        numeric total "dihitung trigger"
    }
    FAKTUR_PENJUALAN {
        uuid    id PK
        text    nomor
        date    jatuh_tempo
        numeric total
        numeric terbayar "dihitung trigger"
        numeric sisa "generated"
        enum    status_bayar
    }
    FAKTUR_PENJUALAN_ITEM {
        numeric harga_satuan
        numeric subtotal "generated"
        numeric hpp_satuan "snapshot untuk laporan laba"
        numeric hpp_total "generated"
    }
```

### 2.4 Siklus pembelian (Fase 2)

```mermaid
erDiagram
    SUPPLIER       ||--o{ PURCHASE_ORDER : ""
    PURCHASE_ORDER ||--o{ PURCHASE_ORDER_ITEM : ""
    PURCHASE_ORDER ||--o{ PENERIMAAN_BARANG : "terima bertahap"
    PENERIMAAN_BARANG ||--o{ PENERIMAAN_BARANG_ITEM : ""
    PURCHASE_ORDER_ITEM ||--o{ PENERIMAAN_BARANG_ITEM : "realisasi terima"

    FAKTUR_PEMBELIAN ||--o{ FAKTUR_PEMBELIAN_ITEM : ""
    FAKTUR_PEMBELIAN ||--o{ FAKTUR_PEMBELIAN_PB : "3-way match"
    PENERIMAAN_BARANG ||--o{ FAKTUR_PEMBELIAN_PB : ""
    SUPPLIER         ||--o{ FAKTUR_PEMBELIAN : ""

    PEMBAYARAN_SUPPLIER ||--o{ PEMBAYARAN_SUPPLIER_ALOKASI : ""
    FAKTUR_PEMBELIAN    ||--o{ PEMBAYARAN_SUPPLIER_ALOKASI : ""

    SUPPLIER        ||--o{ RETUR_PEMBELIAN : ""
    RETUR_PEMBELIAN ||--o{ RETUR_PEMBELIAN_ITEM : ""

    PENERIMAAN_BARANG {
        uuid    id PK
        text    nomor
        uuid    gudang_id FK
        numeric biaya_tambahan "ongkos angkut, masuk ke HPP"
        enum    status
    }
    PENERIMAAN_BARANG_ITEM {
        numeric qty
        numeric harga_satuan
        numeric hpp_satuan "harga + alokasi biaya, per satuan dasar"
    }
```

### 2.5 Alur dokumen dan dampaknya ke stok / uang

```mermaid
flowchart LR
    PO[Purchase Order] --> GR[Penerimaan Barang]
    GR -->|stok masuk<br/>HPP dihitung ulang| LEDGER[(stok_mutasi)]
    GR --> FB[Faktur Pembelian] --> BKK[Pembayaran Supplier]
    FB -->|hutang| AP[/Aging Hutang/]

    SO[Sales Order] -->|cek limit kredit| SJ[Surat Jalan]
    SJ -->|stok keluar<br/>HPP di-stempel| LEDGER
    SJ --> INV[Faktur Penjualan] --> BKM[Penerimaan Kas]
    INV -->|piutang| AR[/Aging Piutang/]
    INV -->|omzet - HPP| LABA[/Laba Kotor/]

    LEDGER --> KARTU[/Kartu Stok &<br/>Nilai Persediaan/]
```

---

## 3. Keputusan desain yang perlu diketahui

**Satuan berjenjang.** Stok, HPP, dan seluruh kolom `qty_dasar` selalu
dalam **satuan dasar**. Setiap baris transaksi menyimpan `satuan_id` +
`konversi` yang dipakai saat itu, lalu `qty_dasar` di-*generate* otomatis
(`qty * konversi`). Konversi disalin ke baris transaksi, bukan dibaca
ulang dari master, supaya dokumen lama tidak berubah ketika master
satuan diedit.

**HPP rata-rata bergerak (moving average).** Dipelihara di
`produk.hpp_rata2` per produk, lintas gudang:

```
HPP_baru = (qty_lama × HPP_lama + qty_masuk × harga_masuk) / (qty_lama + qty_masuk)
```

Hanya barang **masuk** yang menggerakkan HPP. Barang keluar memakai HPP
yang berlaku saat itu dan menyimpannya di `stok_mutasi.hpp_satuan`.
Biaya angkut di penerimaan barang (`biaya_tambahan`) dialokasikan
proporsional terhadap nilai baris, jadi ongkos kirim ikut masuk HPP.

**Snapshot HPP di faktur.** `faktur_penjualan_item.hpp_satuan` diisi
sekali saat faktur dibuat. Tanpa ini, laporan laba bulan lalu akan
berubah setiap kali ada pembelian baru yang menggeser rata-rata.

**Posting stok baru terjadi saat status `selesai`.** Dokumen berstatus
`draf` boleh diedit bebas tanpa menyentuh stok. Pembatalan tidak
menghapus baris kartu stok, melainkan membuat **mutasi balik**.

**Stok minus ditolak.** Trigger memblokir mutasi keluar yang membuat
saldo gudang negatif, kecuali jenis `saldo_awal` (untuk migrasi data).
Kalau bisnisnya memperbolehkan jual-dulu-kirim-belakangan, longgarkan di
`fn_mutasi_sebelum()`.

**Limit kredit.** Dicek saat Sales Order disetujui, hanya untuk pelanggan
bertermin `tempo` dengan `limit_kredit > 0`.

**Non-PKP, tidak ada PPN.** Ayyubi Finance belum PKP, jadi kolom
`ppn_persen`/`ppn_nilai` tetap ada di skema (supaya tidak perlu migrasi
ulang kalau suatu saat jadi PKP) tapi **selalu 0** dan **disembunyikan
dari form**. `dpp` dan `total` di kode aplikasi jadi identik.

**Kanal penjualan (`kanal_penjualan`).** Ayyubi jualan lewat dua pola
sekaligus: canvassing (sales bawa barang, transaksi tuntas di tempat)
dan online (Tokopedia/Shopee/TikTok/WhatsApp). Kolom `kanal` di
`sales_order` dan `faktur_penjualan` menandai asal order, dipakai untuk
laporan omzet per kanal.

Pesanan online **tidak** membuat satu baris `pelanggan` per pembeli —
platform sudah memegang data itu, dan volumenya bisa ratusan per bulan.
Sebagai gantinya, seed (`0009`) menyediakan empat akun pelanggan
agregat (`SHOPEE`, `TOKPED`, `TIKTOK`, `WA-UMUM`); order online
menunjuk ke akun agregat kanalnya, dan nama penerima paket yang
sesungguhnya disimpan di `sales_order.nama_penerima` (bukan relasi ke
tabel `pelanggan`). Kalau ada pembeli WA yang jadi langganan tetap dan
perlu dilacak/ditagih sendiri, buat baris `pelanggan` khusus untuknya —
akun `WA-UMUM` hanya untuk transaksi lepas.

Yang **tidak** termasuk di sini: sinkronisasi otomatis via API
marketplace (ambil order langsung dari Shopee/Tokopedia/TikTok). Order
online tetap diinput manual oleh staf ke Sales Order. Integrasi API
per platform adalah pekerjaan terpisah yang jauh lebih besar (autentikasi
per platform, webhook, pemetaan SKU, throttling) — taruh di backlog
fase lanjut kalau volumenya sudah menjustifikasi.

**Nomor dokumen.** Format `PREFIX/YYYY/MM/00001`, dihasilkan
`generate_nomor()` dan direset tiap bulan. Kirim `nomor` sebagai `null`
dari aplikasi — trigger yang mengisi.

**Kas & Bank (`akun_kas_bank`, ditambah lewat 0010).** Sebelum ini,
`penerimaan_kas`/`pembayaran_supplier` cuma punya kolom teks bebas
`bank_nama` — uangnya tidak benar-benar tertaut ke rekening/kas manapun,
tidak ada cara melihat saldo per akun. Sekarang setiap transaksi WAJIB
menunjuk `akun_id`. Saldo per akun dihitung **live lewat view**
(`v_saldo_kas_bank` = `saldo_awal` + semua penerimaan − semua
pembayaran berstatus bukan `dibatalkan`/`ditolak`), bukan kolom saldo
tersimpan yang perlu trigger — sengaja dihindari karena sesi ini sudah
2 kali menemukan bug "lupa cabang pembalikan saat dibatalkan" pada
trigger posting bergaya lama; view yang dihitung ulang tiap query tidak
punya kelas bug itu sama sekali. `v_kartu_kas_bank` memakai pola
window-function yang sama seperti `v_kartu_stok` untuk saldo berjalan.
Kolom `bank_nama` lama di kedua tabel transaksi **dibiarkan** (bukan
di-drop) karena 0010 ditulis setelah database sudah berisi data uji
coba — lihat migrasi 0010 untuk detail backfill-nya.

**Pelanggan: alamat berjenjang & field CRM (0011).** Dua kebutuhan
digabung jadi satu migrasi karena diminta di sesi yang sama:

1. *Field persiapan CRM* — `whatsapp`, `sosial_media`, `tanggal_lahir`,
   `kanal_akuisisi` (reuse enum `kanal_penjualan` — dari mana pelanggan
   ini pertama kali datang), `tag` (`text[]`, bebas: VIP/reseller/dst.).
   Semua nullable/opsional, murni supaya Fase 3 (CRM sungguhan —
   pipeline, follow-up, kampanye) tidak perlu migrasi "ubah struktur"
   yang menyakitkan setelah data pelanggan menumpuk. Yang **sengaja
   belum** ditambahkan karena butuh tabel/desain sendiri, bukan sekadar
   kolom: poin loyalti (perlu ledger earn/redeem), referral (FK
   self-referencing + UI pilih), tahap pipeline/status lead (itu
   `leads`/`opportunities`, bukan atribut pelanggan) — ditunda sampai
   Fase 3 benar-benar digarap.

2. *Alamat berjenjang resmi* — 4 tabel referensi (`wilayah_provinsi` →
   `wilayah_kabupaten_kota` → `wilayah_kecamatan` → `wilayah_kelurahan`),
   data asli Kemendagri (38 / 514 / 7.285 / 83.762 baris, dari
   `emsifa/api-wilayah-indonesia`), dropdown bertingkat di form
   Pelanggan. Dipilih ketimbang 4 kolom teks bebas karena tujuannya
   eksplisit: data untuk **analisis CRM & targeting iklan** ke depan —
   teks bebas ("Bandung" vs "Kota Bandung" vs "kota bdg") akan merusak
   agregasi itu. Kode wilayah dipakai apa adanya dari sumber (mis.
   `"32.73.01.1001"`) supaya gampang disinkronkan ulang kalau sumbernya
   update. Tabel `wilayah_*` murni referensi: RLS baca-saja untuk semua
   pengguna, tidak ada policy tulis sama sekali (aplikasi tidak pernah
   menulis ke situ). Data Kabupaten/Kota, Kecamatan, dan Kelurahan
   (91.561 baris gabungan) sengaja **tidak** ikut sebagai INSERT literal
   di migrasi — percobaan pertama (~280 KB SQL) gagal ditempel di SQL
   Editor Supabase ("request entity too large", batas Supabase sendiri).
   Disediakan sebagai 3 file CSV di `supabase/seed-data/`, diimpor lewat
   **Table Editor** satu per satu dengan urutan yang wajib (kab/kota →
   kecamatan → kelurahan, karena `kode`-nya foreign key berjenjang) —
   lihat README.md bagian atas untuk langkah lengkapnya. Hanya Provinsi
   (38 baris, kecil) yang tetap inline di migrasi sebagai SQL biasa.

Kolom `pelanggan.kota` (teks bebas, dari skema awal) **dibiarkan**
tidak dipakai lagi oleh form — digantikan `kabupaten_kode` yang
terstruktur — tapi tidak di-drop, pola yang sama dengan `bank_nama`.

**Tipe & Sumber pelanggan diganti total (0012).** `tipe_pelanggan`
sebelumnya 5 nilai (perorangan/toko/grosir/instansi/marketplace),
diganti jadi 4 (**Customer/Mitra/Horeka/Perusahaan**) — "Horeka"
(Hotel/Restoran/Kafe) ditambahkan karena Ayyubi bisnis F&B, segmen
B2B ini penting dan tidak tertangkap kategori lama. Postgres tidak
bisa menghapus nilai enum yang sudah dipakai (cuma bisa nambah), jadi
0012 bikin tipe enum baru lalu pindahkan data (peta nilai lama →
baru: perorangan/marketplace→customer, toko/grosir→mitra,
instansi→perusahaan), baru buang tipe lama — dibungkus DO block yang
mengecek dulu apakah enum lama masih ada, supaya migrasi ini aman
dijalankan berkali-kali tanpa salah petakan data yang sudah baru.

Kolom `kanal_akuisisi` (baru ditambah di 0011) **langsung di-drop**
(bukan dibiarkan) digantikan `sumber` (Relasi/Sosmed/Shopee/Tiktok/
Website/**Custom** + `sumber_custom` teks bebas kalau pilih Custom) —
konsepnya sama tapi daftar nilainya beda, dan kolom lama itu belum
sempat terpakai data sungguhan sama sekali (fiturnya baru saja jadi),
jadi drop langsung lebih bersih ketimbang menumpuk kolom mati. Ini
beda dari pola "jangan pernah drop" di kolom lain (`bank_nama`,
`kota`) yang sudah berpotensi ada datanya.

4 akun agregat marketplace dari seed 0009 (SHOPEE/TOKPED/TIKTOK/
WA-UMUM) ditata ulang: `tipe` jadi `customer`, `sumber` diisi sesuai
platform (Tokopedia & WhatsApp lewat `sumber = 'custom'` karena tidak
ada di daftar baku Sumber).

**ID pelanggan dijaga unik (`kode`, sudah `unique` sejak skema awal
0002) -- nomor HP SENGAJA tidak.** Sempat ditambah unique constraint
di `telepon` juga, tapi dibatalkan atas permintaan user: karena ID
sudah terstruktur & unik (prefix per Tipe + nomor urut, lihat bagian
prefix ID di bawah), itu dianggap cukup sebagai pembeda pelanggan --
nomor HP boleh sama (mis. satu keluarga/toko pakai nomor yang sama
untuk beberapa pelanggan berbeda). Di sisi form (`PelangganForm.tsx`),
pelanggaran unik ID dari Postgres (kode error `23505`) diterjemahkan
jadi pesan bahasa Indonesia yang jelas ("ID ... sudah dipakai
pelanggan lain") lewat `ramahkanErrorSimpan()`, bukan pesan teknis
Postgres apa adanya.

**Kontak & Telepon disembunyikan kecuali Horeka/Perusahaan, dropdown
Wilayah jadi combobox ketik-cari (2026-09-04, tanpa migrasi baru).**
Field "Kontak" (nama PIC) dan "Telepon" cuma tampil kalau Tipe = Horeka
atau Perusahaan -- Customer/Mitra (mayoritas B2C perorangan) dianggap
cukup dengan WhatsApp saja, form jadi lebih pendek untuk kasus umum.
Nilainya TIDAK dihapus kalau field disembunyikan (cuma disembunyikan
dari tampilan) -- ganti Tipe bolak-balik tidak menghilangkan data yang
sudah terisi. Dropdown Provinsi/Kabupaten-Kota/Kecamatan/Kelurahan
diganti dari `<select>` polos jadi `Combobox` (komponen yang sama
dipakai untuk cari produk/pelanggan/supplier) supaya bisa diketik,
bukan scroll manual di antara puluhan/ratusan opsi -- pencariannya
LOKAL (filter array yang sudah dimuat penuh lewat `staleTime: Infinity`
di hook `useWilayah*`), bukan query baru ke Supabase tiap ketikan.

**Form Pelanggan dipersingkat (setelah 0012, tanpa migrasi baru).**
Field Tier harga, NPWP, Termin, Tempo (hari), Limit kredit, Tag, dan
Catatan dihapus dari `PelangganForm.tsx` — dianggap terlalu panjang
untuk input harian, sementara kolomnya di database **tidak disentuh
sama sekali** (tidak ada migrasi baru untuk ini). Konsekuensinya:
field-field itu memakai default kolom untuk pelanggan baru (Termin
COD, Limit kredit 0, dst) dan tidak bisa lagi diisi/diubah lewat form
— kalau nanti perlu diisi (mis. Mitra/Horeka/Perusahaan yang butuh
termin tempo atau limit kredit), harus lewat SQL manual atau form ini
dibuka kembali. Media sosial, Sumber, dan Tanggal lahir tetap ada
karena masih relevan untuk CRM sehari-hari.

---

## 4. Cara menjalankan

```bash
supabase db reset
```

Atau jalankan berurutan `0001` → `0009` di SQL Editor Supabase.

Setelah user pertama mendaftar, naikkan perannya:

```sql
update profil set peran = 'owner' where id = '<uuid-user>';
```

---

## 5. Contoh alur penuh (uji cepat)

```sql
-- 1. Produk dengan satuan berjenjang: PCS (dasar), LUSIN = 12, DUS = 144
insert into produk (kode, nama, kategori_id, satuan_dasar_id)
select 'SKU-001', 'Sabun Batang', k.id, s.id
from kategori_produk k, satuan s where k.kode = 'UMUM' and s.kode = 'PCS';

insert into produk_satuan (produk_id, satuan_id, konversi)
select p.id, s.id, v.konv
from produk p, satuan s,
     (values ('PCS', 1), ('LSN', 12), ('DUS', 144)) as v(kode, konv)
where p.kode = 'SKU-001' and s.kode = v.kode;

-- 2. Beli 10 DUS @ Rp 900.000 + ongkos angkut Rp 200.000
--    -> HPP per PCS = (9.000.000 + 200.000) / 1.440 = Rp 6.388,89
insert into penerimaan_barang (supplier_id, gudang_id, biaya_tambahan, status)
values ('<supplier>', '<gudang>', 200000, 'draf') returning id;

insert into penerimaan_barang_item (pb_id, produk_id, satuan_id, konversi, qty, harga_satuan)
values ('<pb>', '<produk>', '<satuan DUS>', 144, 10, 900000);

update penerimaan_barang set status = 'selesai' where id = '<pb>';  -- stok & HPP jalan

-- 3. Cek hasilnya
select kode, nama, qty, hpp_rata2, nilai_persediaan from v_stok_produk;
select * from v_kartu_stok order by tanggal, id;
```

---

## 6. Yang belum ada (sengaja ditunda)

| Kebutuhan | Fase |
|---|---|
| Pipeline CRM, kunjungan salesman, target & komisi | 3 |
| Batch / expired date / serial number | 3 |
| Stock opname terstruktur | 3 |
| COA, jurnal umum, neraca, arus kas | 4 |
| e-Faktur / perpajakan | 4 |
| Multi-cabang (dimensi di atas gudang) | 4 |

Kolom `produk.pakai_batch` sudah disiapkan sebagai penanda agar
penambahan batch di fase 3 tidak perlu mengubah struktur transaksi.
