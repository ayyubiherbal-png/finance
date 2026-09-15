-- =====================================================================
-- 0063  Saldo Awal (Opening Balance) -- cutover Jurnal Umum
--
-- Migrasi 0057-0062 hanya memposting jurnal untuk transaksi yang lahir
-- SETELAH GL live -- saldo Kas/Piutang/Utang/Persediaan yang sudah ada
-- SEBELUM itu tidak pernah tercermin di Jurnal Umum, sehingga Neraca
-- akan understated untuk Aset/Liabilitas sampai satu jurnal cutover
-- ini dibuat. Sudah diidentifikasi sejak perencanaan awal COA/GL dan
-- sengaja ditunda sampai 0057-0062 semua live & tervalidasi.
--
-- Desain:
--   - Tanggal cutover = sehari sebelum akun_coa pertama kali dibuat
--     (dihitung dinamis, bukan hardcode -- otomatis pas di lingkungan
--     mana pun migrasi ini dijalankan).
--   - Saldo diambil dari VIEW YANG SUDAH DIPERCAYA (v_saldo_kas_bank
--     per akun, v_piutang, v_hutang, v_stok_produk) -- BUKAN dihitung
--     ulang dengan rumus baru -- supaya tidak mungkin beda dari angka
--     yang sudah ditampilkan ke user di laporan lain.
--   - Aman dijalankan multi-tempat (TEST lalu production) karena
--     idempotent: kalau sudah pernah ada jurnal dengan
--     ref_tabel='saldo_awal_cutover', migrasi ini SKIP total (no-op).
--   - Selisih Debit (Kas+Piutang+Persediaan) vs Kredit (Utang) di-plug
--     ke 3-1000 Modal Pemilik -- nilai kekayaan bersih historis
--     dianggap setoran modal pemilik s/d hari cutover.
--   - HANYA aman dijalankan SEKALI, SEBELUM ada transaksi kas/faktur
--     riil yang sempat diposting GL -- kalau di kemudian hari migrasi
--     ini ditemukan di lingkungan yang SUDAH punya histori jurnal
--     nyata (bukan cuma nol), guard idempotent di atas mencegahnya
--     posting ganda, tapi TIDAK memperbaiki kasus "sudah terlanjur
--     ada histori campur" -- itu di luar cakupan migrasi otomatis,
--     perlu ditinjau manual.
-- =====================================================================

do $$
declare
  v_cutover      date;
  v_baris        jsonb := '[]'::jsonb;
  v_total_debit  numeric(18,2) := 0;
  v_total_kredit numeric(18,2) := 0;
  v_jumlah       numeric(18,2);
  r              record;
begin
  if exists (select 1 from jurnal_umum where ref_tabel = 'saldo_awal_cutover') then
    raise notice 'Saldo awal cutover sudah pernah diposting -- dilewati (idempotent).';
    return;
  end if;

  select (min(created_at)::date - 1) into v_cutover from akun_coa;

  -- ---------- Kas & Bank, satu baris per akun ----------
  for r in
    select ak.kode as kode_akun, s.saldo
    from v_saldo_kas_bank s
    join akun_kas_bank akb on akb.id = s.akun_id
    join akun_coa ak on ak.id = akb.akun_coa_id
    where s.saldo <> 0
  loop
    if r.saldo > 0 then
      v_baris := v_baris || jsonb_build_array(jsonb_build_object('akun_kode', r.kode_akun, 'debit', r.saldo, 'kredit', 0));
      v_total_debit := v_total_debit + r.saldo;
    else
      v_baris := v_baris || jsonb_build_array(jsonb_build_object('akun_kode', r.kode_akun, 'debit', 0, 'kredit', -r.saldo));
      v_total_kredit := v_total_kredit + (-r.saldo);
    end if;
  end loop;

  -- ---------- Piutang Usaha ----------
  select coalesce(sum(sisa), 0) into v_jumlah from v_piutang;
  if v_jumlah > 0 then
    v_baris := v_baris || jsonb_build_array(jsonb_build_object('akun_kode', '1-2000', 'debit', v_jumlah, 'kredit', 0));
    v_total_debit := v_total_debit + v_jumlah;
  end if;

  -- ---------- Persediaan ----------
  select coalesce(sum(nilai_persediaan), 0) into v_jumlah from v_stok_produk;
  if v_jumlah > 0 then
    v_baris := v_baris || jsonb_build_array(jsonb_build_object('akun_kode', '1-3000', 'debit', v_jumlah, 'kredit', 0));
    v_total_debit := v_total_debit + v_jumlah;
  end if;

  -- ---------- Utang Usaha ----------
  select coalesce(sum(sisa), 0) into v_jumlah from v_hutang;
  if v_jumlah > 0 then
    v_baris := v_baris || jsonb_build_array(jsonb_build_object('akun_kode', '2-1000', 'debit', 0, 'kredit', v_jumlah));
    v_total_kredit := v_total_kredit + v_jumlah;
  end if;

  if jsonb_array_length(v_baris) = 0 then
    raise notice 'Tidak ada saldo Kas/Piutang/Persediaan/Utang untuk dijadikan saldo awal -- dilewati.';
    return;
  end if;

  -- ---------- Plug penyeimbang ke Modal Pemilik ----------
  v_jumlah := v_total_debit - v_total_kredit;
  if v_jumlah > 0 then
    v_baris := v_baris || jsonb_build_array(jsonb_build_object('akun_kode', '3-1000', 'debit', 0, 'kredit', v_jumlah));
  elsif v_jumlah < 0 then
    v_baris := v_baris || jsonb_build_array(jsonb_build_object('akun_kode', '3-1000', 'debit', -v_jumlah, 'kredit', 0));
  end if;

  perform fn_posting_jurnal(v_cutover, 'saldo_awal_cutover', gen_random_uuid(), 'SALDO-AWAL',
    'Saldo Awal (Opening Balance) sebelum Jurnal Umum diberlakukan', v_baris);
end $$;
