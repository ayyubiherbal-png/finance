-- =====================================================================
-- 0021  Impor pesanan Shopee/TikTok dari file export Seller Centre
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  User tidak mau lagi input pesanan marketplace satu-satu -- di halaman
--  Impor Pesanan (frontend), file export Excel/CSV dari Shopee/TikTok
--  Seller Centre diunggah, dikelompokkan per nomor pesanan, lalu tiap
--  pesanan dibuat lewat fungsi `penjualan_cepat` yang sudah ada (0020).
--
--  Dua hal baru di sini:
--
--  1. Tabel `pesanan_marketplace_impor` -- cuma pencatat "nomor pesanan
--     X dari kanal Y sudah pernah diimpor jadi faktur Z", supaya file
--     yang sama tidak sengaja diunggah dua kali dan menggandakan
--     penjualan (stok akan terpotong dua kali kalau itu terjadi).
--     Unique constraint (kanal, nomor_pesanan_platform) adalah
--     penjaga SUNGGUHAN-nya; pengecekan di frontend sebelum submit
--     cuma untuk pengalaman pakai (supaya kelihatan sebelum diproses,
--     bukan baru gagal di tengah jalan).
--
--  2. `penjualan_cepat` ditambah DUA parameter opsional
--     `p_nomor_pesanan_platform` dan `p_status_platform`. Kalau diisi,
--     setelah faktur dibuat, fungsi ini juga mencatatnya ke tabel di
--     atas -- dalam TRANSAKSI YANG SAMA dengan pembuatan SO/Surat
--     Jalan/Faktur. Kalau nomor itu ternyata sudah pernah dicatat
--     (constraint unique kena), SELURUH transaksi ikut batal (termasuk
--     potongan stok) -- bukan cuma baris pencatatnya. Ini kenapa
--     fungsinya di-drop lalu dibuat ulang (bukan cuma create-or-
--     replace): menambah parameter mengubah signature, dan create-or-
--     replace TIDAK bisa mengubah signature fungsi yang sudah ada --
--     hasilnya malah dua fungsi overload nyangkut bareng kalau
--     dipaksakan.
--
--     `p_status_platform` menyimpan APA ADANYA teks status dari kolom
--     "Status Pesanan" di file export (mis. "Selesai", "Dikirim") --
--     bukan versi terjemahan/verdict aplikasi. User: "kenapa statusnya
--     tidak mengikuti yang ada di marketplace saja... kalau ikut status
--     yang di MP kita jadi tahu paket ini statusnya apa." Jadi status
--     asli platform ikut tersimpan permanen di baris ini, bisa dilihat
--     lagi kapan saja dari Faktur-nya -- bukan cuma kelihatan sesaat
--     di layar pratinjau impor lalu hilang.
-- =====================================================================

-- ---------- Pencatat dedup ----------
create table if not exists pesanan_marketplace_impor (
  id                      uuid primary key default gen_random_uuid(),
  kanal                   kanal_penjualan not null,
  nomor_pesanan_platform  text not null,
  status_platform         text,
  faktur_id               uuid references faktur_penjualan(id) on delete set null,
  diimpor_oleh            uuid references profil(id) on delete set null,
  diimpor_pada            timestamptz not null default now(),
  unique (kanal, nomor_pesanan_platform)
);
create index if not exists idx_impor_faktur on pesanan_marketplace_impor(faktur_id);

alter table pesanan_marketplace_impor enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'pesanan_marketplace_impor' and policyname = 'baca'
  ) then
    create policy baca on pesanan_marketplace_impor
      for select to authenticated using (user_aktif());
  end if;
  if not exists (
    select 1 from pg_policies
    where tablename = 'pesanan_marketplace_impor' and policyname = 'tulis'
  ) then
    create policy tulis on pesanan_marketplace_impor
      for insert to authenticated with check (boleh_sales());
  end if;
end $$;

grant select, insert on pesanan_marketplace_impor to authenticated;

-- ---------- penjualan_cepat: tambah p_nomor_pesanan_platform ----------
drop function if exists penjualan_cepat(
  uuid, uuid, jsonb, date, kanal_penjualan, uuid, uuid, metode_bayar, text, text, text, text
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
  p_status_platform text    default null       -- status ASLI dari file export platform, apa adanya -- lihat 0021
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
