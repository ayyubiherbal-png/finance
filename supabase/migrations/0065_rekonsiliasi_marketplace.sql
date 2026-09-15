-- =====================================================================
-- 0065  Laporan Rekonsiliasi Marketplace
--
-- Halaman Settlement Marketplace (0054) sudah jadi ALAT untuk mencatat
-- pencairan (bruto/potongan/netto per settlement), tapi belum ada
-- LAPORAN yang merangkum & memverifikasinya. Migrasi ini murni baca --
-- tidak menambah tabel/trigger, cuma dua view baru:
--
-- v_rekonsiliasi_marketplace : per settlement, bruto/potongan/netto
--   (dari settlement_marketplace, sudah dipercaya) DISANDINGKAN dengan
--   netto_gl -- mutasi kas/bank yang BENAR-BENAR tercermin di Jurnal
--   Umum untuk penerimaan_kas/pengeluaran_kas milik settlement itu.
--   Kalau posting_settlement_marketplace() & trigger jurnal (0058)
--   bekerja benar, selisih (netto - netto_gl) SELALU nol -- inilah
--   "rekonsiliasi marketplace & neraca" yang diminta.
--
-- v_pesanan_menunggu_settlement : pesanan lintas kanal yang fakturnya
--   sudah ada tapi belum pernah masuk settlement mana pun -- versi
--   ringkas & lintas-kanal dari query yang sudah ada di form Settlement
--   Marketplace (di sana di-scope per kanal saat bikin settlement baru).
-- =====================================================================

create view v_rekonsiliasi_marketplace with (security_invoker = true) as
select
  sm.id as settlement_id,
  sm.kanal,
  sm.nomor_settlement_platform,
  sm.tanggal,
  sm.akun_id,
  akb.nama as nama_akun,
  sm.bruto,
  sm.fee_platform,
  sm.voucher_toko,
  sm.ongkir_dipotong,
  sm.refund,
  sm.netto,
  sm.status,
  coalesce((
    select sum(jb.debit - jb.kredit)
    from jurnal_umum_baris jb
    join jurnal_umum ju on ju.id = jb.jurnal_id
    join akun_coa ak on ak.id = jb.akun_id
    where ak.kode like '1-10%'
      and (
        (ju.ref_tabel = 'penerimaan_kas' and ju.ref_id in (
          select penerimaan_id from settlement_marketplace_item where settlement_id = sm.id
        ))
        or (ju.ref_tabel = 'pengeluaran_kas' and sm.pengeluaran_id is not null and ju.ref_id = sm.pengeluaran_id)
      )
  ), 0) as netto_gl
from settlement_marketplace sm
join akun_kas_bank akb on akb.id = sm.akun_id;

grant select on v_rekonsiliasi_marketplace to authenticated;

create view v_pesanan_menunggu_settlement with (security_invoker = true) as
select
  pmi.id as pesanan_id,
  pmi.kanal,
  pmi.nomor_pesanan_platform,
  pmi.diimpor_pada,
  fp.id as faktur_id,
  fp.nomor as nomor_faktur,
  fp.total - fp.terbayar as bruto_menunggu
from pesanan_marketplace_impor pmi
join faktur_penjualan fp on fp.id = pmi.faktur_id
where fp.status <> 'dibatalkan'
  and fp.total > fp.terbayar
  and not exists (
    select 1 from settlement_marketplace_item smi where smi.pesanan_id = pmi.id
  );

grant select on v_pesanan_menunggu_settlement to authenticated;
