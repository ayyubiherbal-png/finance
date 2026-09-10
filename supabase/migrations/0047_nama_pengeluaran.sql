-- =====================================================================
-- 0047  Nama Pengeluaran -- level ke-2 di bawah Kategori Biaya
--
--  Sebelum ini Pengeluaran Kas cuma punya satu level kategori (mis.
--  "Biaya Pemasaran"). User minta struktur akuntansi 2 level seperti
--  chart of accounts: Kategori (kode induk, mis. 6300 "Biaya
--  Pemasaran") -> Nama Pengeluaran (sub-kode, mis. 6301 "Iklan
--  TikTok", 6302 "Iklan Shopee", dst). Transaksi Pengeluaran Kas
--  sekarang pilih Nama Pengeluaran-nya langsung -- kategori induknya
--  otomatis ikut lewat relasi.
--
--  Belum ada Pengeluaran Kas sungguhan di production sejak fitur ini
--  live (dikonfirmasi user), jadi aman restrukturisasi langsung tanpa
--  migrasi data lama yang rumit.
-- =====================================================================

create table nama_pengeluaran (
  id                uuid primary key default gen_random_uuid(),
  kategori_biaya_id uuid not null references kategori_biaya(id) on delete restrict,
  kode              text not null unique,
  nama              text not null,
  aktif             boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_nama_pengeluaran_kategori on nama_pengeluaran(kategori_biaya_id);
create trigger trg_nama_pengeluaran_updated before update on nama_pengeluaran
  for each row execute function set_updated_at();

-- restrict (bukan set null seperti produk.kategori_id) -- Nama
-- Pengeluaran tanpa kategori induk tidak masuk akal secara struktur,
-- jadi kategori tidak boleh dihapus selama masih punya Nama Pengeluaran.
alter table nama_pengeluaran enable row level security;
create policy baca on nama_pengeluaran
  for select to authenticated using (boleh_finance());
create policy tulis on nama_pengeluaran
  for insert to authenticated with check (is_admin());
create policy ubah on nama_pengeluaran
  for update to authenticated using (is_admin()) with check (is_admin());
create policy hapus on nama_pengeluaran
  for delete to authenticated using (is_admin());
grant select, insert, update, delete on nama_pengeluaran to authenticated;

-- Item default di bawah kategori seed 'OPS' supaya form Pengeluaran Kas
-- tidak kosong begitu migrasi ini jalan.
insert into nama_pengeluaran (kategori_biaya_id, kode, nama)
select id, 'OPS-01', 'Operasional Umum' from kategori_biaya where kode = 'OPS'
on conflict (kode) do nothing;

-- ---------- pengeluaran_kas: pindah dari kategori_biaya_id ke nama_pengeluaran_id ----------
alter table pengeluaran_kas add column nama_pengeluaran_id uuid references nama_pengeluaran(id) on delete restrict;

-- Backfill jaga-jaga kalau ternyata sudah ada baris (seharusnya kosong).
update pengeluaran_kas
set nama_pengeluaran_id = (select id from nama_pengeluaran where kode = 'OPS-01')
where nama_pengeluaran_id is null;

alter table pengeluaran_kas alter column nama_pengeluaran_id set not null;
drop index if exists idx_pengeluaran_kategori;
alter table pengeluaran_kas drop column kategori_biaya_id;
create index idx_pengeluaran_nama on pengeluaran_kas(nama_pengeluaran_id, tanggal desc);
