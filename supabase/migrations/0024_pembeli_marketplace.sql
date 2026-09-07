-- =====================================================================
-- 0024  Daftar pembeli marketplace (untuk follow-up manual)
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  Latar belakang: pesanan Shopee/TikTok dicatat pakai SATU akun
--  agregat per kanal (lihat 0015) -- sengaja, supaya Master Data
--  Pelanggan tidak penuh ratusan pembeli sekali-beli. Tapi user mau
--  MENCARI pembeli-pembeli itu satu-satu secara manual (nama asli,
--  nomor WA yang valid dst.) supaya bisa di-follow-up (FU) -- butuh
--  daftar tersendiri yang BISA diedit & dihapus, TERPISAH dari tab
--  "Customers" yang isinya pelanggan biasa.
--
--  Tabel `pembeli_marketplace` BUKAN sumber data transaksi (Sales
--  Order/Faktur tetap jalan seperti biasa, tetap pakai akun agregat) --
--  ini murni daftar kerja/CRM untuk follow-up, diisi lewat SINKRONISASI
--  dari `sales_order` yang sudah ada (fungsi `sinkron_pembeli_
--  marketplace()`), bukan otomatis setiap kali ada pesanan baru masuk
--  (biar tidak menambah kerumitan `penjualan_cepat` yang sudah beberapa
--  kali diperluas). User klik "Sinkronkan" kapan pun mau menarik data
--  terbaru.
--
--  Kunci alaminya (kanal, telepon) -- BUKAN nomor pesanan, karena satu
--  pembeli sering pesan berkali-kali dengan nomor pesanan berbeda-beda,
--  tapi nomor teleponnya sama. Nomor telepon dinormalisasi dulu (fungsi
--  `normalkan_telepon`, logika SAMA seperti `normalkanNomorWa()` di
--  frontend `src/lib/whatsapp.ts` -- format bebas jadi "62xxxxxxxxxx"),
--  supaya "0812..." dan "+62 812..." dari file yang berbeda dianggap
--  pembeli yang SAMA, bukan dua baris terpisah.
--
--  `nama`/`alamat` boleh diedit manual (mis. mengganti username yang
--  disensor platform "m***adam_" dengan nama asli hasil riset manual).
--  Kolom `diedit_manual` MELINDUNGI hasil edit itu supaya tidak
--  KETIMPA lagi oleh sinkronisasi berikutnya -- kalau sudah pernah
--  diedit manual, sync cuma memperbarui angka (jumlah pesanan, total
--  belanja, tanggal pesanan terakhir), bukan nama/alamatnya. `telepon`
--  SENGAJA tidak dibuat bisa diedit dari UI -- itu kunci pencocokan ke
--  data pesanan aslinya, mengubahnya lewat form edit berisiko bikin
--  baris ini "lepas" dari sinkronisasi berikutnya.
-- =====================================================================

create table if not exists pembeli_marketplace (
  id                uuid primary key default gen_random_uuid(),
  kanal             kanal_penjualan not null,
  telepon           text not null,
  nama              text,
  alamat            text,
  diedit_manual     boolean not null default false,
  jumlah_pesanan    integer not null default 0,
  total_belanja     numeric(18,2) not null default 0,
  pesanan_terakhir  date,
  catatan           text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (kanal, telepon)
);
create index if not exists idx_pembeli_mp_pesanan_terakhir on pembeli_marketplace(pesanan_terakhir desc);

drop trigger if exists trg_pembeli_mp_updated on pembeli_marketplace;
create trigger trg_pembeli_mp_updated before update on pembeli_marketplace
  for each row execute function set_updated_at();

alter table pembeli_marketplace enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'pembeli_marketplace' and policyname = 'baca') then
    create policy baca on pembeli_marketplace for select to authenticated using (user_aktif());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pembeli_marketplace' and policyname = 'tulis') then
    create policy tulis on pembeli_marketplace for insert to authenticated with check (boleh_sales());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pembeli_marketplace' and policyname = 'perbarui') then
    create policy perbarui on pembeli_marketplace for update to authenticated using (boleh_sales()) with check (boleh_sales());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pembeli_marketplace' and policyname = 'hapus') then
    create policy hapus on pembeli_marketplace for delete to authenticated using (boleh_sales());
  end if;
end $$;

grant select, insert, update, delete on pembeli_marketplace to authenticated;

-- ---------- Normalisasi nomor telepon (samakan format Postgres-side) ----------
create or replace function normalkan_telepon(p_nomor text)
returns text
language sql immutable as $$
  select case
    when p_nomor is null or length(regexp_replace(p_nomor, '\D', '', 'g')) < 8 then null
    when regexp_replace(p_nomor, '\D', '', 'g') like '62%' then regexp_replace(p_nomor, '\D', '', 'g')
    when regexp_replace(p_nomor, '\D', '', 'g') like '0%' then '62' || substring(regexp_replace(p_nomor, '\D', '', 'g') from 2)
    when regexp_replace(p_nomor, '\D', '', 'g') like '8%' then '62' || regexp_replace(p_nomor, '\D', '', 'g')
    else regexp_replace(p_nomor, '\D', '', 'g')
  end;
$$;

-- ---------- Sinkronisasi dari sales_order ----------
create or replace function sinkron_pembeli_marketplace()
returns integer   -- jumlah baris yang ditambah/diperbarui
language plpgsql
security invoker
as $$
declare
  v_jumlah integer;
begin
  with sumber as (
    select
      kanal,
      normalkan_telepon(telepon_penerima) as telepon,
      nama_penerima,
      alamat_kirim,
      total,
      tanggal
    from sales_order
    where kanal in ('shopee', 'tiktok')
      and normalkan_telepon(telepon_penerima) is not null
  ),
  agregat as (
    select
      kanal,
      telepon,
      (array_agg(nama_penerima order by tanggal desc nulls last))[1] as nama_terakhir,
      (array_agg(alamat_kirim order by tanggal desc nulls last))[1] as alamat_terakhir,
      count(*) as jumlah_pesanan,
      sum(total) as total_belanja,
      max(tanggal) as pesanan_terakhir
    from sumber
    group by kanal, telepon
  )
  insert into pembeli_marketplace (kanal, telepon, nama, alamat, jumlah_pesanan, total_belanja, pesanan_terakhir)
  select kanal, telepon, nama_terakhir, alamat_terakhir, jumlah_pesanan, total_belanja, pesanan_terakhir
  from agregat
  on conflict (kanal, telepon) do update
  set
    -- Nama/alamat cuma diperbarui kalau BELUM pernah diedit manual --
    -- lihat catatan `diedit_manual` di atas.
    nama = case when pembeli_marketplace.diedit_manual then pembeli_marketplace.nama else excluded.nama end,
    alamat = case when pembeli_marketplace.diedit_manual then pembeli_marketplace.alamat else excluded.alamat end,
    jumlah_pesanan = excluded.jumlah_pesanan,
    total_belanja = excluded.total_belanja,
    pesanan_terakhir = excluded.pesanan_terakhir;

  get diagnostics v_jumlah = row_count;
  return v_jumlah;
end;
$$;

grant execute on function normalkan_telepon(text) to authenticated;
grant execute on function sinkron_pembeli_marketplace() to authenticated;
