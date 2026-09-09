-- =====================================================================
-- 0044  pakai_kode_referral: tambah cek peran
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  Temuan audit keamanan pre-launch: RPC `pakai_kode_referral` (0041)
--  tidak ada cek peran sama sekali -- beda dengan `tukar_poin` (0040)
--  yang benar memanggil boleh_sales(). Sekarang disamakan: hanya
--  owner/admin/sales yang boleh memasangkan kode referral ke pelanggan
--  baru (konsisten dengan siapa yang biasanya menangani pendaftaran
--  pelanggan baru).
-- =====================================================================

create or replace function pakai_kode_referral(p_kode text, p_pelanggan_baru_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_kode_id uuid;
  v_pereferensi_id uuid;
begin
  if not boleh_sales() then
    raise exception 'Tidak punya izin memakai kode referral.';
  end if;

  select id, pelanggan_id into v_kode_id, v_pereferensi_id from kode_referral where kode = upper(trim(p_kode));
  if v_kode_id is null then
    raise exception 'Kode referral tidak ditemukan.';
  end if;
  if v_pereferensi_id = p_pelanggan_baru_id then
    raise exception 'Tidak bisa pakai kode referral sendiri.';
  end if;

  insert into referral_pemakaian (kode_referral_id, pelanggan_baru_id)
  values (v_kode_id, p_pelanggan_baru_id);
end;
$$;
