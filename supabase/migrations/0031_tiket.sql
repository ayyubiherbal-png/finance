-- =====================================================================
-- 0031  Tiket (Komplain/Retur Pelanggan)
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  Fitur #3 dari 5 yang disepakati user ("Kerjakan berurut"), diadaptasi
--  dari fitur "Tickets" pada CRM omnichannel pihak ketiga. Beda dari
--  Retur Penjualan (0004, murni transaksi barang/nilai keuangan): Tiket
--  ini untuk MELACAK PENANGANAN keluhan pelanggan sampai tuntas --
--  komplain kualitas produk, salah kirim, pertanyaan, dst. -- yang
--  belum tentu berujung retur barang. Kalau ujungnya memang retur,
--  faktur_id di sini cukup dipakai sebagai REFERENSI (bukan trigger
--  otomatis apa pun ke stok/keuangan) -- retur barangnya tetap dicatat
--  terpisah lewat halaman Retur Penjualan seperti biasa.
--
--  Penomoran pakai fungsi generate_nomor() yang sama dengan dokumen
--  lain (lihat 0001/0006), prefix 'TKT' -- format "TKT/2026/09/00001".
-- =====================================================================

create type status_tiket as enum ('terbuka', 'diproses', 'selesai', 'dibatalkan');
create type prioritas_tiket as enum ('rendah', 'sedang', 'tinggi');

create table if not exists tiket (
  id             uuid primary key default gen_random_uuid(),
  nomor          text not null unique,
  tanggal        date not null default current_date,
  pelanggan_id   uuid not null references pelanggan(id) on delete restrict,
  faktur_id      uuid references faktur_penjualan(id) on delete set null,
  judul          text not null,
  deskripsi      text,
  status         status_tiket not null default 'terbuka',
  prioritas      prioritas_tiket not null default 'sedang',
  ditugaskan_ke  uuid references profil(id) on delete set null,
  dibuat_oleh    uuid references profil(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_tiket_pelanggan on tiket(pelanggan_id, tanggal desc);
create index if not exists idx_tiket_status on tiket(status) where status in ('terbuka', 'diproses');
create index if not exists idx_tiket_ditugaskan on tiket(ditugaskan_ke) where ditugaskan_ke is not null;

drop trigger if exists trg_nomor_tiket on tiket;
create trigger trg_nomor_tiket before insert on tiket
  for each row execute function fn_set_nomor('TKT');

drop trigger if exists trg_tiket_updated on tiket;
create trigger trg_tiket_updated before update on tiket
  for each row execute function set_updated_at();

alter table tiket enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'tiket' and policyname = 'baca') then
    create policy baca on tiket for select to authenticated using (user_aktif());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tiket' and policyname = 'tulis') then
    create policy tulis on tiket for insert to authenticated with check (boleh_sales());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tiket' and policyname = 'perbarui') then
    create policy perbarui on tiket for update to authenticated using (boleh_sales()) with check (boleh_sales());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tiket' and policyname = 'hapus') then
    create policy hapus on tiket for delete to authenticated using (boleh_sales());
  end if;
end $$;

grant select, insert, update, delete on tiket to authenticated;
