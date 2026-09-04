-- =====================================================================
-- 0009  Data awal minimum agar aplikasi bisa langsung dipakai
-- =====================================================================

insert into satuan (kode, nama) values
  ('PCS', 'Pieces'),
  ('LSN', 'Lusin'),
  ('DUS', 'Dus'),
  ('KRT', 'Karton'),
  ('PAK', 'Pak'),
  ('KG',  'Kilogram'),
  ('BOX', 'Box')
on conflict (kode) do nothing;

insert into tier_harga (kode, nama, urutan, jadi_default) values
  ('RETAIL', 'Retail / Eceran', 1, true),
  ('SEMI',   'Semi Grosir',     2, false),
  ('GROSIR', 'Grosir',          3, false),
  ('KONTRAK','Harga Kontrak',   4, false)
on conflict (kode) do nothing;

insert into gudang (kode, nama, utama) values
  ('GD-01', 'Gudang Pusat', true)
on conflict (kode) do nothing;

insert into kategori_produk (kode, nama) values
  ('UMUM', 'Umum')
on conflict (kode) do nothing;

-- ---------------------------------------------------------------------
-- Langkah manual setelah user pertama mendaftar lewat Supabase Auth:
--
--   update profil set peran = 'owner' where id = '<uuid-user-anda>';
--
-- Profil dibuat otomatis oleh trigger trg_user_baru dengan peran
-- default 'sales', jadi user pertama harus dinaikkan ke owner sekali
-- saja lewat SQL editor Supabase.
-- ---------------------------------------------------------------------
