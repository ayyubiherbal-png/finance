-- Varian produk: mengelompokkan SKU yang sebenarnya produk sama tapi beda
-- kemasan/ukuran (mis. "Makaroni Pedo -- Original Daun Jeruk" 100 g/250 g/275 g).
-- Setiap varian TETAP baris `produk` independen (SKU, stok, harga sendiri) --
-- ini cuma link opsional ke "produk induk", pola sama seperti
-- kategori_produk.induk_id yang sudah ada (self-referencing FK).
alter table produk add column induk_id uuid references produk(id) on delete set null;
create index idx_produk_induk on produk(induk_id);

-- `induk_id` ditambahkan sebagai kolom PALING BELAKANG (bukan disisipkan di
-- tengah) karena `create or replace view` di Postgres tidak boleh mengubah
-- urutan/nama kolom output yang sudah ada, cuma boleh menambah di akhir.
create or replace view v_stok_produk with (security_invoker = true) as
select
  p.id                              as produk_id,
  p.kode,
  p.nama,
  k.nama                            as kategori,
  s.kode                            as satuan_dasar,
  coalesce(sum(st.qty), 0)          as qty,
  p.stok_min,
  p.hpp_rata2,
  round(coalesce(sum(st.qty), 0) * p.hpp_rata2, 2) as nilai_persediaan,
  coalesce(sum(st.qty), 0) <= p.stok_min           as perlu_restock,
  p.induk_id
from produk p
join satuan s              on s.id = p.satuan_dasar_id
left join kategori_produk k on k.id = p.kategori_id
left join stok st           on st.produk_id = p.id
where p.aktif
group by p.id, p.kode, p.nama, k.nama, s.kode, p.stok_min, p.hpp_rata2, p.induk_id;
