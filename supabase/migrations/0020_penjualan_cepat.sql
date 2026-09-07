-- =====================================================================
-- 0020  Penjualan Cepat -- satu layar, satu transaksi
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  Alur normal penjualan butuh 4 dokumen (SO -> Surat Jalan -> Faktur ->
--  Penerimaan Kas). Untuk B2C (pembeli WA/canvassing, barang langsung
--  diserahkan, langsung dibayar) itu berlebihan -- 4 form untuk satu
--  transaksi kecil. Fungsi ini membuat keempat dokumen itu sekaligus
--  dari SATU input.
--
--  Kenapa fungsi database, bukan dikerjakan dari sisi aplikasi:
--  keempat dokumen harus jadi SATU transaksi. Kalau dikerjakan lewat 4
--  panggilan terpisah dari browser lalu gagal di tengah (koneksi putus,
--  stok kurang), bisa tersisa Surat Jalan yatim yang sudah memotong
--  stok tapi tidak punya faktur. Di dalam fungsi ini, kalau ada satu
--  langkah gagal SEMUANYA dibatalkan otomatis.
--
--  Yang SENGAJA tidak diubah: alur 4 langkah yang lama tetap ada dan
--  tetap dipakai untuk kasus bertahap (kirim sebagian, bayar tempo).
--  Fungsi ini cuma jalan pintas untuk kasus paling umum, bukan
--  pengganti. Semua dokumennya tetap tercatat lengkap seperti biasa,
--  jadi stok, HPP, piutang, kas, dan semua laporan tetap benar.
--
--  Update: setiap item sekarang bisa membawa diskon_nilai (potongan
--  Rupiah tetap per baris) selain diskon_persen, konsisten dengan kolom
--  yang memang sudah ada di sales_order_item & faktur_penjualan_item
--  sejak 0004 -- cuma belum pernah dipakai dari sisi form manapun.
--  Aman dijalankan ulang: cuma "create or replace function" + "grant",
--  tidak ada perubahan tabel.
-- =====================================================================

create or replace function penjualan_cepat(
  p_pelanggan_id    uuid,
  p_gudang_id       uuid,
  p_items           jsonb,                  -- [{produk_id, satuan_id, konversi, qty, harga_satuan, diskon_persen, diskon_nilai}]
  p_tanggal         date    default current_date,
  p_kanal           kanal_penjualan default 'canvassing',
  p_tier_harga_id   uuid    default null,
  p_akun_id         uuid    default null,   -- diisi = langsung lunas; null = jadi piutang
  p_metode          metode_bayar default 'tunai',
  p_nama_penerima   text    default null,
  p_telepon_penerima text   default null,
  p_alamat_kirim    text    default null,
  p_catatan         text    default null
)
returns uuid                                 -- id faktur yang terbentuk
language plpgsql
security invoker
as $$
declare
  v_profil  uuid;
  v_so      uuid;
  v_sj      uuid;
  v_faktur  uuid;
  v_kas     uuid;
  v_total   numeric(18,2);
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Item penjualan tidak boleh kosong';
  end if;

  select id into v_profil from profil where id = auth.uid();

  -- 1. Sales Order -- langsung 'disetujui', tanpa tahap draf.
  insert into sales_order (tanggal, pelanggan_id, kanal, gudang_id, tier_harga_id,
                           status, nama_penerima, alamat_kirim, catatan,
                           sales_id, dibuat_oleh)
  values (p_tanggal, p_pelanggan_id, p_kanal, p_gudang_id, p_tier_harga_id,
          'disetujui', p_nama_penerima, p_alamat_kirim, p_catatan,
          v_profil, v_profil)
  returning id into v_so;

  insert into sales_order_item (so_id, produk_id, satuan_id, konversi, qty,
                                harga_satuan, diskon_persen, diskon_nilai, urutan)
  select v_so,
         (i->>'produk_id')::uuid,
         (i->>'satuan_id')::uuid,
         coalesce((i->>'konversi')::numeric, 1),
         (i->>'qty')::numeric,
         (i->>'harga_satuan')::numeric,
         coalesce((i->>'diskon_persen')::numeric, 0),
         coalesce((i->>'diskon_nilai')::numeric, 0),
         (idx - 1)
  from jsonb_array_elements(p_items) with ordinality as t(i, idx);

  -- 2. Surat Jalan -- dibuat 'draf' dulu, baru diubah ke 'selesai' di
  --    langkah 3. Trigger pemotong stok (trg_posting_sj) jalan saat
  --    STATUS BERUBAH, jadi itemnya harus sudah ada lebih dulu.
  insert into surat_jalan (tanggal, so_id, pelanggan_id, gudang_id, status,
                           alamat_kirim, nama_penerima, telepon_penerima,
                           dibuat_oleh)
  values (p_tanggal, v_so, p_pelanggan_id, p_gudang_id, 'draf',
          p_alamat_kirim, p_nama_penerima, p_telepon_penerima, v_profil)
  returning id into v_sj;

  insert into surat_jalan_item (sj_id, so_item_id, produk_id, satuan_id, konversi, qty)
  select v_sj, soi.id, soi.produk_id, soi.satuan_id, soi.konversi, soi.qty
  from sales_order_item soi
  where soi.so_id = v_so;

  -- 3. Barang keluar (stok terpotong di sini oleh trigger).
  update surat_jalan set status = 'selesai' where id = v_sj;

  -- 4. Faktur -- item disalin dari Surat Jalan. HPP di-snapshot otomatis
  --    oleh trigger trg_snapshot_hpp saat item di-insert.
  insert into faktur_penjualan (tanggal, jatuh_tempo, pelanggan_id, kanal, so_id,
                                status, catatan, sales_id, dibuat_oleh)
  values (p_tanggal,
          p_tanggal + coalesce((select termin_hari from pelanggan where id = p_pelanggan_id), 0),
          p_pelanggan_id, p_kanal, v_so, 'disetujui', p_catatan, v_profil, v_profil)
  returning id into v_faktur;

  insert into faktur_penjualan_sj (faktur_id, sj_id) values (v_faktur, v_sj);

  insert into faktur_penjualan_item (faktur_id, produk_id, satuan_id, konversi, qty,
                                     harga_satuan, diskon_persen, diskon_nilai, urutan)
  select v_faktur, sji.produk_id, sji.satuan_id, sji.konversi, sji.qty,
         soi.harga_satuan, soi.diskon_persen, soi.diskon_nilai, row_number() over (order by sji.id) - 1
  from surat_jalan_item sji
  left join sales_order_item soi on soi.id = sji.so_item_id
  where sji.sj_id = v_sj;

  -- 5. Pembayaran -- hanya kalau akun kas/bank diisi. Kalau tidak,
  --    fakturnya sengaja dibiarkan jadi piutang (bayar menyusul).
  if p_akun_id is not null then
    select total into v_total from faktur_penjualan where id = v_faktur;

    insert into penerimaan_kas (tanggal, pelanggan_id, akun_id, metode, jumlah,
                                status, catatan, dibuat_oleh)
    values (p_tanggal, p_pelanggan_id, p_akun_id, p_metode, v_total,
            'disetujui', p_catatan, v_profil)
    returning id into v_kas;

    insert into penerimaan_kas_alokasi (penerimaan_id, faktur_id, jumlah)
    values (v_kas, v_faktur, v_total);
  end if;

  return v_faktur;
end;
$$;

grant execute on function penjualan_cepat(
  uuid, uuid, jsonb, date, kanal_penjualan, uuid, uuid, metode_bayar, text, text, text, text
) to authenticated;
