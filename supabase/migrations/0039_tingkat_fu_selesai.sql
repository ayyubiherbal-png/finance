-- =====================================================================
-- 0039  Tingkat Follow-Up Selesai
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  Sejak 0029 dibuat, metrik ini SENGAJA belum dihitung -- catatan di
--  kepala RiwayatFollowUp.tsx bilang tidak ada baseline "total tugas
--  yang pernah muncul" untuk jadi pembagi (tugas yang tidak ditandai
--  selesai tidak pernah tersimpan di mana pun). 0037 menutup itu lewat
--  `riwayat_tahap_pelanggan` (catatan KEMUNCULAN tahap) -- sekarang
--  tinggal digabung dengan `riwayat_follow_up` (catatan PENYELESAIAN)
--  lewat `tugas_id` yang sama untuk dapat rasionya.
-- =====================================================================

create or replace view v_tingkat_fu_selesai with (security_invoker = true) as
select
  r.kategori,
  count(*)::int                                            as jumlah_muncul,
  count(f.tugas_id)::int                                    as jumlah_selesai,
  round(100.0 * count(f.tugas_id) / nullif(count(*), 0), 1) as persen_selesai
from riwayat_tahap_pelanggan r
left join riwayat_follow_up f on f.tugas_id = r.tugas_id
group by r.kategori;

grant select on v_tingkat_fu_selesai to authenticated;
