/**
 * Ekspor tabel data (baris + kolom) ke CSV atau PDF. Dipakai lewat
 * `<TombolEkspor>` (src/components/TombolEkspor.tsx) di semua halaman
 * daftar/laporan -- lihat komponen itu untuk cara pakainya.
 */

/** Satu kolom ekspor: `nilai()` mengembalikan data MENTAH (dipakai apa
 * adanya di CSV, supaya Excel bisa menjumlah/mem-filter angka betulan --
 * BUKAN string "Rp 1.250.000"). `format()` opsional memberi representasi
 * tampilan untuk PDF (biasanya rupiah()/tanggal()/angka() dari lib/format). */
export interface KolomEkspor<T> {
  header: string
  nilai: (baris: T) => string | number | null | undefined
  format?: (nilai: string | number | null | undefined, baris: T) => string
  rata?: 'kiri' | 'kanan'
}

export interface OpsiEkspor {
  /** Tanpa ekstensi, mis. 'faktur-penjualan-2026-09-10'. */
  namaFile: string
  judul: string
  subjudul?: string
  orientasi?: 'portrait' | 'landscape'
}

const DELIMITER = ';'
// Semicolon, BUKAN koma -- Excel di Windows berlokal Indonesia (desimal ",")
// memakai daftar-pemisah OS (biasanya ";") saat file CSV dibuka langsung
// (klik-2x), bukan lewat "Data > Dari Teks/CSV". Koma akan bikin semua data
// jatuh ke SATU kolom untuk mayoritas pengguna aplikasi ini.
const POLA_PERLU_KUTIP = new RegExp(`["${DELIMITER}\n\r]`)

function selCsv(nilai: string | number | null | undefined): string {
  const s = nilai === null || nilai === undefined ? '' : String(nilai)
  if (POLA_PERLU_KUTIP.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function unduhBlob(blob: Blob, namaFile: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = namaFile
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function unduhCsv<T>(baris: T[], kolom: KolomEkspor<T>[], opsi: OpsiEkspor): void {
  const header = kolom.map((k) => selCsv(k.header)).join(DELIMITER)
  const isi = [header, ...baris.map((b) => kolom.map((k) => selCsv(k.nilai(b))).join(DELIMITER))].join('\r\n')
  // BOM UTF-8 supaya Excel Windows mengenali encoding & tidak merusak
  // karakter non-ASCII (nama pelanggan/produk dari impor marketplace, dll).
  const blob = new Blob(['﻿' + isi], { type: 'text/csv;charset=utf-8;' })
  unduhBlob(blob, `${opsi.namaFile}.csv`)
}

/** Di atas ini, PDF ditolak (arahkan ke CSV) -- ribuan baris lewat
 * autoTable jadi lambat & filenya besar sekali, sementara CSV tidak
 * masalah untuk jumlah baris berapa pun. */
const BATAS_BARIS_PDF = 3000

export class TerlaluBanyakBarisUntukPdf extends Error {
  constructor() {
    super('Terlalu banyak baris untuk PDF (>3000) -- gunakan Excel (CSV) untuk data sebanyak ini.')
  }
}

export async function unduhPdf<T>(baris: T[], kolom: KolomEkspor<T>[], opsi: OpsiEkspor): Promise<void> {
  if (baris.length > BATAS_BARIS_PDF) throw new TerlaluBanyakBarisUntukPdf()

  const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const autoTable = autoTableModule.default
  const orientasi = opsi.orientasi ?? (kolom.length > 6 ? 'landscape' : 'portrait')
  const doc = new jsPDF({ orientation: orientasi, unit: 'pt', format: 'a4' })

  doc.setFontSize(14)
  doc.text(opsi.judul, 40, 40)
  if (opsi.subjudul) {
    doc.setFontSize(10)
    doc.setTextColor(120)
    doc.text(opsi.subjudul, 40, 58)
  }

  autoTable(doc, {
    startY: opsi.subjudul ? 72 : 56,
    head: [kolom.map((k) => k.header)],
    body: baris.map((b) => kolom.map((k) => (k.format ? k.format(k.nilai(b), b) : String(k.nilai(b) ?? '-')))),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [63, 125, 32] }, // hijau identitas Ayyubi Food
    columnStyles: Object.fromEntries(kolom.map((k, i) => [i, { halign: k.rata === 'kanan' ? 'right' : 'left' }])),
    didDrawPage: () => {
      const halaman = `Halaman ${doc.getCurrentPageInfo().pageNumber} / ${doc.getNumberOfPages()}`
      doc.setFontSize(8)
      doc.setTextColor(150)
      doc.text(halaman, doc.internal.pageSize.getWidth() - 90, doc.internal.pageSize.getHeight() - 20)
    },
  })

  doc.save(`${opsi.namaFile}.pdf`)
}
