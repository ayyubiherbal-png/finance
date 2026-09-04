-- =====================================================================
-- 0012  Pelanggan -- ganti daftar Tipe, tambah field Sumber
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  Dua perubahan:
--  1. `tipe_pelanggan` diganti total: dari 5 nilai lama
--     (perorangan/toko/grosir/instansi/marketplace) jadi 4 nilai baru
--     (customer/mitra/horeka/perusahaan). Postgres tidak bisa
--     menghapus nilai enum yang sudah ada (cuma bisa nambah), jadi
--     caranya: bikin tipe enum baru, pindahkan data, buang tipe lama.
--     Seluruh langkah ini dibungkus DO block yang mengecek dulu apakah
--     enum lama ('perorangan' dkk.) masih ada -- kalau migrasi ini
--     dijalankan dua kali, percobaan kedua langsung dilewati (bukan
--     coba migrasi ulang dan salah petakan data yang sudah baru).
--  2. Kolom `sumber` baru -- dari mana pelanggan ini didapat
--     (Relasi/Sosmed/Shopee/Tiktok/Website/Custom). Ini MENGGANTIKAN
--     `kanal_akuisisi` yang baru ditambah di 0011 -- kolom itu belum
--     pernah dipakai form/data sungguhan (fitur CRM-nya baru saja
--     jadi), jadi aman di-drop langsung, bukan sekadar dibiarkan
--     seperti pola "jangan pernah drop" yang biasa dipakai di migrasi
--     lain (itu berlaku untuk kolom yang sudah mungkin ada datanya).
-- =====================================================================

-- ---------- 1. Ganti tipe_pelanggan (idempotent lewat guard di DO block) ----------

do $$
begin
  if exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'tipe_pelanggan' and e.enumlabel = 'perorangan'
  ) then
    execute 'create type tipe_pelanggan_baru as enum (''customer'',''mitra'',''horeka'',''perusahaan'')';
    execute 'alter table pelanggan add column tipe_baru tipe_pelanggan_baru';

    -- Peta nilai lama -> baru. Dibandingkan sebagai ::text supaya tidak
    -- pernah gagal cast biarpun urutan enum berubah.
    execute $q$
      update pelanggan set tipe_baru = (case tipe::text
        when 'perorangan'  then 'customer'
        when 'toko'        then 'mitra'
        when 'grosir'      then 'mitra'
        when 'instansi'    then 'perusahaan'
        when 'marketplace' then 'customer'
        else 'customer'
      end)::tipe_pelanggan_baru
    $q$;

    execute 'alter table pelanggan alter column tipe_baru set not null';
    execute 'alter table pelanggan alter column tipe_baru set default ''customer''';
    execute 'alter table pelanggan drop column tipe';
    execute 'alter table pelanggan rename column tipe_baru to tipe';
    execute 'drop type tipe_pelanggan';
    execute 'alter type tipe_pelanggan_baru rename to tipe_pelanggan';
  end if;
end $$;

-- ---------- 2. Kolom sumber (ganti kanal_akuisisi) ----------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'sumber_pelanggan') then
    create type sumber_pelanggan as enum ('relasi','sosmed','shopee','tiktok','website','custom');
  end if;
end $$;

alter table pelanggan drop column if exists kanal_akuisisi;

alter table pelanggan
  add column if not exists sumber sumber_pelanggan,
  add column if not exists sumber_custom text;  -- diisi kalau sumber = 'custom'

-- Rapikan 4 akun agregat marketplace dari seed 0009 -- kanal yang tidak
-- ada di daftar Sumber baku (Tokopedia, WhatsApp) dicatat lewat 'custom'.
update pelanggan set sumber = 'shopee'                             where kode = 'SHOPEE';
update pelanggan set sumber = 'tiktok'                             where kode = 'TIKTOK';
update pelanggan set sumber = 'custom', sumber_custom = 'Tokopedia' where kode = 'TOKPED';
update pelanggan set sumber = 'custom', sumber_custom = 'WhatsApp'  where kode = 'WA-UMUM';
