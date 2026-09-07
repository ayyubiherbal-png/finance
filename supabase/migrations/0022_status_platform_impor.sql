-- =====================================================================
-- 0022  pesanan_marketplace_impor: simpan status ASLI marketplace
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  0021 sudah dijalankan lebih dulu (tabel pesanan_marketplace_impor
--  dan penjualan_cepat versi 13-parameter sudah ada) -- makanya ini
--  migrasi TERPISAH, bukan mengedit 0021 lagi (0021 sudah jalan di
--  produksi, mengedit migrasi yang sudah jalan tidak akan diapply ulang
--  dan cuma bikin riwayat migrasi tidak sinkron dengan skema sungguhan).
--
--  Latar belakang: User protes soal fitur "Impor Pesanan" -- "kenapa
--  statusnya tidak mengikuti yang ada di marketplace saja, dari pada
--  buat versi sendiri malah bingung. kalau ikut status yang di MP kita
--  jadi tahu paket ini statusnya apa." Jadi status ASLI dari kolom
--  "Status Pesanan" di file export (mis. "Selesai", "Dikirim") perlu
--  tersimpan permanen -- bukan cuma kelihatan sesaat di layar pratinjau
--  impor lalu hilang -- supaya bisa dilihat lagi kapan saja dari
--  Faktur-nya.
--
--  Dua perubahan:
--
--  1. Kolom baru `status_platform text` di `pesanan_marketplace_impor`.
--  2. `penjualan_cepat` ditambah SATU parameter opsional lagi,
--     `p_status_platform`, yang mengisi kolom itu di transaksi yang
--     sama saat faktur dibuat. Fungsinya di-drop lalu dibuat ulang
--     (bukan cuma create-or-replace) karena menambah parameter
--     mengubah signature -- lihat catatan yang sama di 0021.
-- =====================================================================

alter table pesanan_marketplace_impor add column if not exists status_platform text;

drop function if exists penjualan_cepat(
  uuid, uuid, jsonb, date, kanal_penjualan, uuid, uuid, metode_bayar, text, text, text, text, text
);

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
  p_catatan         text    default null,
  p_nomor_pesanan_platform text default null,  -- diisi kalau ini hasil impor Shopee/TikTok -- lihat 0021
  p_status_platform text    default null       -- status ASLI dari file export platform, apa adanya -- lihat 0022
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
  --    fakturnya sengaja dibiarkan jadi piutang (bayar menyusul). Untuk
  --    pesanan marketplace ini SENGAJA dibiarkan piutang secara default
  --    -- Shopee/TikTok mencairkan dana secara batch belakangan, bukan
  --    langsung per pesanan, jadi tidak bisa dianggap "lunas" saat itu juga.
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

  -- 6. Catat sebagai sudah-diimpor -- kalau nomor ini sudah pernah
  --    dicatat sebelumnya, unique constraint gagal di sini dan SELURUH
  --    transaksi di atas ikut batal (termasuk potongan stok barusan).
  if p_nomor_pesanan_platform is not null then
    insert into pesanan_marketplace_impor (kanal, nomor_pesanan_platform, status_platform, faktur_id, diimpor_oleh)
    values (p_kanal, p_nomor_pesanan_platform, p_status_platform, v_faktur, v_profil);
  end if;

  return v_faktur;
end;
$$;

grant execute on function penjualan_cepat(
  uuid, uuid, jsonb, date, kanal_penjualan, uuid, uuid, metode_bayar, text, text, text, text, text, text
) to authenticated;
