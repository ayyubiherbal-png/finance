import { NAMA_TOKO, NOMOR_WA_TOKO } from '@/lib/identitasToko'
import { tanggal as fmtTanggal } from '@/lib/format'

// Ekspedisi diisi bebas (teks) di form Surat Jalan, jadi dicocokkan by
// keyword (bukan persis sama) supaya "JNE", "jne reguler", dst. tetap
// kena. Tambah baris baru di sini kalau ada logo ekspedisi lain nanti.
const LOGO_EKSPEDISI: { kata: string; src: string }[] = [
  { kata: 'jne', src: '/ekspedisi/jne.jpg' },
  { kata: 'j&t', src: '/ekspedisi/jnt.png' },
  { kata: 'jnt', src: '/ekspedisi/jnt.png' },
  { kata: 'paxel', src: '/ekspedisi/paxel.svg' },
]

function cariLogoEkspedisi(nama: string | null): string | null {
  if (!nama) return null
  const teks = nama.toLowerCase()
  return LOGO_EKSPEDISI.find((l) => teks.includes(l.kata))?.src ?? null
}

export interface SJCetakDetail {
  id: string
  nomor: string
  tanggal: string
  alamat_kirim: string | null
  nama_penerima: string | null
  telepon_penerima: string | null
  ekspedisi: string | null
  no_resi: string | null
  nomor_kendaraan: string | null
  nama_sopir: string | null
  catatan: string | null
  pelanggan: { nama: string; kode: string; telepon: string | null; whatsapp: string | null } | null
}

export interface SJCetakItem {
  id: string
  sj_id?: string
  qty: number
  produk: { nama: string; kode: string } | null
  satuan: { kode: string } | null
}

/**
 * Satu kartu label A6, dipakai baik di cetak satuan (SuratJalanCetak)
 * maupun cetak massal (SuratJalanCetakMassal) -- supaya tampilannya
 * selalu identik di kedua tempat, tidak ada risiko dua versi menyimpang.
 */
export function LabelSuratJalan({ sj, items }: { sj: SJCetakDetail; items: SJCetakItem[] }) {
  const kontak = sj.pelanggan?.whatsapp || sj.pelanggan?.telepon
  const logoEkspedisi = cariLogoEkspedisi(sj.ekspedisi)

  return (
    <div className="mx-auto flex min-h-[140mm] w-[105mm] flex-col border-2 border-black text-black">
      <div className="flex items-center justify-between gap-2 border-b-2 border-black px-3 py-2">
        <img src="/ayyubi-logo.jpeg" alt={NAMA_TOKO} className="h-[15mm] w-[15mm] shrink-0 rounded object-cover" />
        {logoEkspedisi ? (
          <img src={logoEkspedisi} alt={sj.ekspedisi ?? 'Ekspedisi'} className="h-[15mm] max-w-[42mm] object-contain" />
        ) : (
          <p className="text-[16px] font-bold uppercase tracking-wide">{sj.ekspedisi || 'Ekspedisi'}</p>
        )}
      </div>

      {sj.no_resi ? (
        <div className="border-b-2 border-black px-3 py-1 text-center">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-gray-500">No. Resi</p>
          <p className="font-mono text-[13px] font-bold tracking-wide">{sj.no_resi}</p>
        </div>
      ) : null}

      <div className="flex items-center justify-between bg-black px-3 py-1 text-white">
        <span className="font-mono text-[12px] font-bold tracking-wide">{sj.nomor}</span>
        <span className="text-[11px]">{fmtTanggal(sj.tanggal)}</span>
      </div>

      <div className="border-b-2 border-black px-3 py-2">
        <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.15em] text-gray-500">Penerima</p>
        <p className="text-[18px] font-bold leading-tight">{sj.nama_penerima || sj.pelanggan?.nama || '-'}</p>
        {sj.telepon_penerima ?? kontak ? <p className="mt-0.5 text-[14px] font-bold">{sj.telepon_penerima ?? kontak}</p> : null}
        {sj.alamat_kirim ? <p className="mt-1 whitespace-pre-line text-[12px] font-medium leading-snug">{sj.alamat_kirim}</p> : null}
      </div>

      <div className="border-b-2 border-black px-3 py-1.5">
        <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-gray-500">Pengirim</p>
        <p className="text-[12px] leading-snug">
          <span className="font-bold">{NAMA_TOKO}</span> &middot; {NOMOR_WA_TOKO}
        </p>
        {sj.nomor_kendaraan ?? sj.nama_sopir ? (
          <p className="text-[11px] text-gray-600">
            {sj.nomor_kendaraan ? `Kendaraan: ${sj.nomor_kendaraan}` : null}
            {sj.nomor_kendaraan && sj.nama_sopir ? ' · ' : null}
            {sj.nama_sopir ? `Sopir: ${sj.nama_sopir}` : null}
          </p>
        ) : null}
      </div>

      {/* flex-1 supaya bingkai label mengisi penuh kertas A6, tidak berhenti
          di tengah halaman waktu itemnya sedikit. */}
      <div className="flex-1 px-3 py-2">
        <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.15em] text-gray-500">Isi Paket</p>
        <table className="w-full border-collapse text-[12px]">
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b border-gray-300">
                <td className="py-1 pr-2">{it.produk?.nama}</td>
                <td className="whitespace-nowrap py-1 text-right font-bold">
                  {it.qty} {it.satuan?.kode}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sj.catatan ? <p className="mt-2 text-[11px]">Catatan: {sj.catatan}</p> : null}
      </div>

      <div className="border-t border-gray-300 px-3 py-1 text-center text-[9px] text-gray-500">
        Terima kasih telah berbelanja di {NAMA_TOKO}
      </div>
    </div>
  )
}
