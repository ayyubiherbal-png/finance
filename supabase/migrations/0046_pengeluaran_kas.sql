-- =====================================================================
-- 0046  Pengeluaran Kas (biaya operasional umum) + Kategori Biaya
--
--  Sebelum ini satu-satunya cara keluarnya kas/bank adalah
--  pembayaran_supplier (wajib supplier + faktur pembelian). Tidak ada
--  cara mencatat biaya operasional umum (sewa, listrik, gaji, dll).
--  Migrasi ini menambah:
--    1. kategori_biaya  -- master data, pola identik kategori_produk.
--    2. pengeluaran_kas -- dokumen kas keluar generik, TANPA alokasi
--       ke faktur apa pun (beda dari pembayaran_supplier).
--    3. akun_id di pengeluaran_kas dijadikan sumber ke-3 di
--       v_saldo_kas_bank / v_kartu_kas_bank (union all tambahan,
--       TIDAK mengubah urutan/nama kolom yang sudah ada).
--    4. v_pengeluaran_harian, v_ringkasan_laba_biaya -- dipakai
--       Dashboard/LaporanLaba/LaporanOmzet untuk "Laba Bersih".
--
--  Keputusan bisnis (dikonfirmasi user):
--    - Baca (SELECT) pengeluaran_kas & kategori_biaya DIBATASI
--      boleh_finance() (owner/admin/finance) -- BEDA dari pola
--      penerimaan_kas/pembayaran_supplier yang baca-nya terbuka semua
--      peran. Ini uang keluar tanpa bukti pihak ketiga, jadi lebih
--      tertutup dari sales/gudang.
--    - Tulis (insert/update/delete) pengeluaran_kas: boleh_finance()
--      (sama seperti penerimaan_kas/pembayaran_supplier).
--    - Tulis kategori_biaya: is_admin() saja (sama seperti
--      kategori_produk).
-- =====================================================================

-- ---------- Kategori Biaya (mirip persis kategori_produk) ----------
create table kategori_biaya (
  id         uuid primary key default gen_random_uuid(),
  kode       text not null unique,
  nama       text not null,
  aktif      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_kategori_biaya_updated before update on kategori_biaya
  for each row execute function set_updated_at();

alter table kategori_biaya enable row level security;
create policy baca on kategori_biaya
  for select to authenticated using (boleh_finance());
create policy tulis on kategori_biaya
  for insert to authenticated with check (is_admin());
create policy ubah on kategori_biaya
  for update to authenticated using (is_admin()) with check (is_admin());
create policy hapus on kategori_biaya
  for delete to authenticated using (is_admin());
grant select, insert, update, delete on kategori_biaya to authenticated;

insert into kategori_biaya (kode, nama) values ('OPS', 'Operasional Umum')
on conflict (kode) do nothing;

-- ---------- Pengeluaran Kas ----------
-- kategori_biaya_id NULLABLE + on delete set null (pola sama seperti
-- produk.kategori_id) supaya kategori_biaya bisa dihapus (dengan
-- peringatan jumlah pemakaian, lihat KategoriBiayaForm.tsx) tanpa
-- melanggar constraint dan tanpa merusak riwayat pengeluaran lama.
-- akun_id TETAP NOT NULL + on delete restrict, sama seperti
-- penerimaan_kas/pembayaran_supplier -- akun kas/bank tidak boleh
-- dihapus kalau masih dipakai transaksi manapun.
create table pengeluaran_kas (
  id                uuid primary key default gen_random_uuid(),
  nomor             text not null unique,
  tanggal           date not null default current_date,
  kategori_biaya_id uuid references kategori_biaya(id) on delete set null,
  akun_id           uuid not null references akun_kas_bank(id) on delete restrict,
  metode            metode_bayar not null default 'transfer',
  nomor_referensi   text,
  tanggal_cair      date,
  jumlah            numeric(18,2) not null check (jumlah > 0),
  status            status_dokumen not null default 'disetujui',
  catatan           text,
  dibuat_oleh       uuid references profil(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_pengeluaran_akun     on pengeluaran_kas(akun_id, tanggal desc);
create index idx_pengeluaran_kategori on pengeluaran_kas(kategori_biaya_id, tanggal desc);
create trigger trg_pengeluaran_kas_updated before update on pengeluaran_kas
  for each row execute function set_updated_at();

-- Penomoran: BKM = penerimaan_kas, BKK = pembayaran_supplier (sudah
-- dipakai) -> pengeluaran_kas pakai prefix baru 'BKO' (Bukti Kas Keluar
-- Operasional). fn_set_nomor/generate_nomor sudah generik, tidak perlu
-- registrasi tambahan untuk prefix baru.
create trigger trg_nomor_pengeluaran before insert on pengeluaran_kas
  for each row execute function fn_set_nomor('BKO');

alter table pengeluaran_kas enable row level security;
create policy baca on pengeluaran_kas
  for select to authenticated using (boleh_finance());
create policy tulis on pengeluaran_kas
  for insert to authenticated with check (boleh_finance());
create policy ubah on pengeluaran_kas
  for update to authenticated using (boleh_finance()) with check (boleh_finance());
create policy hapus on pengeluaran_kas
  for delete to authenticated using (boleh_finance());
grant select, insert, update, delete on pengeluaran_kas to authenticated;

-- ---------- v_saldo_kas_bank: tambah pengeluaran_kas sebagai pengurang ----------
-- CREATE OR REPLACE VIEW disini AMAN: tidak ada kolom baru/berubah nama,
-- cuma formula kolom `saldo` yang sudah ada ditambah satu suku pengurang.
create or replace view v_saldo_kas_bank with (security_invoker = true) as
select
  a.id as akun_id, a.kode, a.nama, a.jenis, a.bank_nama, a.nomor_rekening,
  a.atas_nama, a.aktif, a.saldo_awal,
  a.saldo_awal
    + coalesce((
        select sum(k.jumlah) from penerimaan_kas k
        where k.akun_id = a.id and k.status not in ('dibatalkan', 'ditolak')
      ), 0)
    - coalesce((
        select sum(b.jumlah) from pembayaran_supplier b
        where b.akun_id = a.id and b.status not in ('dibatalkan', 'ditolak')
      ), 0)
    - coalesce((
        select sum(p.jumlah) from pengeluaran_kas p
        where p.akun_id = a.id and p.status not in ('dibatalkan', 'ditolak')
      ), 0) as saldo
from akun_kas_bank a;

-- ---------- v_kartu_kas_bank: pengeluaran_kas sebagai UNION ALL ke-3 ----------
-- Kolom output SAMA PERSIS (ref_id, jenis, tanggal, akun_id, kode_akun,
-- nama_akun, ref_nomor, masuk, keluar, catatan, saldo) -- ini cuma baris
-- baru lewat union all, bukan kolom baru, jadi tidak melanggar batasan
-- CREATE OR REPLACE VIEW.
create or replace view v_kartu_kas_bank with (security_invoker = true) as
select
  m.ref_id, m.jenis, m.tanggal, m.akun_id, a.kode as kode_akun, a.nama as nama_akun,
  m.ref_nomor, m.masuk, m.keluar, m.catatan,
  a.saldo_awal + sum(m.masuk - m.keluar) over (
    partition by m.akun_id
    order by m.tanggal, m.ref_id
    rows between unbounded preceding and current row
  ) as saldo
from (
  select k.id::text as ref_id, 'penerimaan_kas' as jenis, k.tanggal, k.akun_id,
         k.nomor as ref_nomor, k.jumlah as masuk, 0::numeric as keluar, k.catatan
  from penerimaan_kas k
  where k.status not in ('dibatalkan', 'ditolak')
  union all
  select b.id::text, 'pembayaran_supplier', b.tanggal, b.akun_id,
         b.nomor, 0::numeric, b.jumlah, b.catatan
  from pembayaran_supplier b
  where b.status not in ('dibatalkan', 'ditolak')
  union all
  select p.id::text, 'pengeluaran_kas', p.tanggal, p.akun_id,
         p.nomor, 0::numeric, p.jumlah, p.catatan
  from pengeluaran_kas p
  where p.status not in ('dibatalkan', 'ditolak')
) m
join akun_kas_bank a on a.id = m.akun_id;

grant select on v_saldo_kas_bank, v_kartu_kas_bank to authenticated;

-- ---------- v_pengeluaran_harian: pasangan v_penjualan_harian ----------
-- Dipakai Dashboard.tsx & LaporanOmzet.tsx (fetch sama seperti
-- v_penjualan_harian, agregasi per periode di JS) untuk kolom "Biaya
-- Operasional"/"Laba Bersih". RLS ikut pengeluaran_kas (boleh_finance()
-- lewat security_invoker) -- role sales/gudang akan dapat baris kosong,
-- BUKAN error; UI wajib menjaga supaya tidak menampilkan Laba Bersih
-- yang menyesatkan untuk peran itu (lihat Dashboard.tsx/LaporanOmzet.tsx).
create view v_pengeluaran_harian with (security_invoker = true) as
select
  tanggal,
  count(*)    as jumlah_pengeluaran,
  sum(jumlah) as total_keluar
from pengeluaran_kas
where status not in ('dibatalkan', 'ditolak')
group by tanggal;

-- ---------- v_ringkasan_laba_biaya: satu baris agregat SEMUA WAKTU ----------
-- Dipakai LaporanLaba.tsx untuk baris ringkasan "Total Biaya Operasional
-- (semua waktu)" & "Laba Bersih (semua waktu)" -- TIDAK dipecah per
-- produk/pelanggan karena biaya operasional (sewa, gaji, dll) tidak bisa
-- dialokasikan secara bermakna ke satu baris produk/pelanggan.
create view v_ringkasan_laba_biaya with (security_invoker = true) as
select
  (select coalesce(sum(laba_kotor), 0) from v_laba_baris) as total_laba_kotor,
  (select coalesce(sum(jumlah), 0) from pengeluaran_kas
    where status not in ('dibatalkan', 'ditolak'))         as total_biaya_operasional,
  (select coalesce(sum(laba_kotor), 0) from v_laba_baris)
    - (select coalesce(sum(jumlah), 0) from pengeluaran_kas
        where status not in ('dibatalkan', 'ditolak'))      as laba_bersih;

grant select on v_pengeluaran_harian, v_ringkasan_laba_biaya to authenticated;
