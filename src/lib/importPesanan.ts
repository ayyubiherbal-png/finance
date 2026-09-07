import type { KanalPenjualan } from '@/types/db'

/**
 * Impor pesanan Shopee/TikTok dari file export Seller Centre.
 *
 * SENGAJA tidak hardcode nama kolom Shopee/TikTok -- format export
 * platform itu berubah dari waktu ke waktu dan saya tidak punya sampel
 * file terbaru untuk dipastikan. Jadi: baca file APA ADANYA, tebak
 * pemetaan kolom lewat daftar kata kunci umum (`TEBAKAN_KOLOM`), user
 * KONFIRMASI/PERBAIKI di layar sebelum apa pun diproses. Kalau formatnya
 * berubah di kemudian hari, cukup tebakannya meleset -- user tinggal
 * pilih manual, bukan aplikasi error/salah baca diam-diam.
 */

export type BidangKolom =
  | 'nomor_pesanan'
  | 'tanggal'
  | 'status_pesanan'
  | 'nama_pembeli'
  | 'telepon'
  | 'alamat_kirim'
  | 'ekspedisi'
  | 'sku'
  | 'nama_produk'
  | 'qty'
  | 'subtotal_baris'

export interface DefinisiBidang {
  bidang: BidangKolom
  label: string
  wajib: boolean
  /** Kata kunci (huruf kecil) buat menebak kolom mana yang cocok dari header file. */
  tebakan: string[]
}

export const DAFTAR_BIDANG: DefinisiBidang[] = [
  { bidang: 'nomor_pesanan', label: 'Nomor Pesanan', wajib: true, tebakan: ['no. pesanan', 'no pesanan', 'nomor pesanan', 'order id', 'order sn'] },
  { bidang: 'tanggal', label: 'Tanggal Pesanan', wajib: true, tebakan: ['waktu pesanan dibuat', 'tanggal pesanan', 'tanggal pembayaran', 'created time', 'order date', 'tanggal'] },
  { bidang: 'status_pesanan', label: 'Status Pesanan', wajib: false, tebakan: ['status pesanan', 'order status', 'status'] },
  { bidang: 'nama_pembeli', label: 'Nama Pembeli/Penerima', wajib: false, tebakan: ['nama penerima', 'username', 'nama pembeli', 'recipient', 'buyer'] },
  { bidang: 'telepon', label: 'No. Telepon', wajib: false, tebakan: ['no. telepon', 'no telepon', 'nomor telepon', 'phone'] },
  { bidang: 'alamat_kirim', label: 'Alamat Pengiriman', wajib: false, tebakan: ['alamat pengiriman', 'alamat penerima', 'shipping address', 'alamat'] },
  { bidang: 'ekspedisi', label: 'Ekspedisi/Kurir', wajib: false, tebakan: ['opsi pengiriman', 'kurir', 'shipping provider', 'jasa kirim'] },
  { bidang: 'sku', label: 'SKU Produk', wajib: false, tebakan: ['nomor referensi sku', 'seller sku', 'sku'] },
  { bidang: 'nama_produk', label: 'Nama Produk', wajib: true, tebakan: ['nama produk', 'product name', 'nama barang'] },
  { bidang: 'qty', label: 'Qty', wajib: true, tebakan: ['jumlah produk dibeli', 'jumlah', 'quantity', 'qty'] },
  {
    bidang: 'subtotal_baris',
    label: 'Subtotal Baris (qty x harga, setelah diskon)',
    wajib: true,
    tebakan: ['total harga produk', 'harga setelah diskon', 'subtotal', 'total harga'],
  },
]

export type PemetaanKolom = Partial<Record<BidangKolom, string>>

/** Baris mentah = satu baris di file, key-nya header kolom ASLI dari file. */
export type BarisMentah = Record<string, string>

export interface FileTerbaca {
  headerKolom: string[]
  baris: BarisMentah[]
}

/**
 * Membaca file .xlsx/.xls/.csv jadi baris-baris mentah (semua nilai sebagai teks).
 *
 * `xlsx` (SheetJS) dimuat lewat dynamic import -- library-nya cukup besar
 * (~400KB), dan cuma dipakai satu halaman ini. Kalau di-import statis di
 * atas file, dia ikut ke bundle awal yang dimuat SETIAP kali aplikasi
 * dibuka, padahal cuma dipakai kalau user benar-benar buka halaman Impor
 * Pesanan.
 */
export async function bacaFile(file: File): Promise<FileTerbaca> {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]!]
  if (!sheet) return { headerKolom: [], baris: [] }

  // raw:false -> nilai tanggal/angka ikut diformat XLSX ke teks apa adanya
  // (mis. "07/09/2026"), bukan serial number Excel yang susah dibaca ulang.
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false, defval: '' })
  const headerKolom = rows.length > 0 ? Object.keys(rows[0]!) : []
  const baris = rows.map((r) => {
    const b: BarisMentah = {}
    for (const k of headerKolom) b[k] = String(r[k] ?? '').trim()
    return b
  })
  return { headerKolom, baris }
}

/** Menebak pemetaan kolom dari nama header file, berdasar daftar kata kunci di atas. */
export function tebakPemetaan(headerKolom: string[]): PemetaanKolom {
  const pemetaan: PemetaanKolom = {}
  for (const def of DAFTAR_BIDANG) {
    const cocok = headerKolom.find((h) => def.tebakan.some((kw) => h.toLowerCase().includes(kw)))
    if (cocok) pemetaan[def.bidang] = cocok
  }
  return pemetaan
}

export interface ItemPesanan {
  sku: string
  namaProduk: string
  qty: number
  subtotalBaris: number
  /** Harga efektif per satuan, dihitung dari subtotal/qty -- ikut memperhitungkan diskon seller. */
  hargaSatuan: number
}

export interface PesananDikelompokkan {
  nomorPesanan: string
  tanggal: string | null
  statusPesanan: string
  namaPembeli: string
  telepon: string
  alamatKirim: string
  ekspedisi: string
  item: ItemPesanan[]
  total: number
}

/**
 * Mengelompokkan baris mentah (1 baris = 1 item) jadi per pesanan (1 nomor
 * pesanan bisa punya banyak baris/item) berdasarkan pemetaan kolom yang
 * sudah dikonfirmasi user.
 */
export function kelompokkanPesanan(baris: BarisMentah[], peta: PemetaanKolom): PesananDikelompokkan[] {
  const kolomNomor = peta.nomor_pesanan
  if (!kolomNomor) return []

  const urutan: string[] = []
  const perNomor = new Map<string, PesananDikelompokkan>()

  for (const b of baris) {
    const nomor = b[kolomNomor]?.trim()
    if (!nomor) continue

    const qty = Number(String(peta.qty ? b[peta.qty] : '0').replace(/[^\d.-]/g, '')) || 0
    const subtotal = Number(String(peta.subtotal_baris ? b[peta.subtotal_baris] : '0').replace(/[^\d.-]/g, '')) || 0

    let p = perNomor.get(nomor)
    if (!p) {
      p = {
        nomorPesanan: nomor,
        tanggal: peta.tanggal ? parseTanggalFleksibel(b[peta.tanggal] ?? '') : null,
        statusPesanan: peta.status_pesanan ? (b[peta.status_pesanan] ?? '') : '',
        namaPembeli: peta.nama_pembeli ? (b[peta.nama_pembeli] ?? '') : '',
        telepon: peta.telepon ? (b[peta.telepon] ?? '') : '',
        alamatKirim: peta.alamat_kirim ? (b[peta.alamat_kirim] ?? '') : '',
        ekspedisi: peta.ekspedisi ? (b[peta.ekspedisi] ?? '') : '',
        item: [],
        total: 0,
      }
      perNomor.set(nomor, p)
      urutan.push(nomor)
    }

    if (qty > 0) {
      p.item.push({
        sku: peta.sku ? (b[peta.sku] ?? '') : '',
        namaProduk: peta.nama_produk ? (b[peta.nama_produk] ?? '') : '',
        qty,
        subtotalBaris: subtotal,
        hargaSatuan: Math.round((subtotal / qty) * 100) / 100,
      })
      p.total += subtotal
    }
  }

  return urutan.map((n) => perNomor.get(n)!)
}

/** Menerima format tanggal umum ("07/09/2026", "2026-09-07 14:30", dll). Null kalau gagal parse. */
function parseTanggalFleksibel(teks: string): string | null {
  const t = teks.trim()
  if (!t) return null

  // dd/mm/yyyy atau dd-mm-yyyy (format umum export Asia Tenggara)
  const cocokDMY = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (cocokDMY) {
    const [, d, m, y] = cocokDMY
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    return Number.isNaN(new Date(iso).getTime()) ? null : iso
  }

  // yyyy-mm-dd (ISO, dengan atau tanpa jam)
  const cocokISO = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (cocokISO) {
    const [, y, m, d] = cocokISO
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    return Number.isNaN(new Date(iso).getTime()) ? null : iso
  }

  const coba = new Date(t)
  return Number.isNaN(coba.getTime()) ? null : coba.toISOString().slice(0, 10)
}

/**
 * Status pesanan yang AMAN diimpor (barangnya sungguh keluar gudang).
 * Sengaja daftar yang HARUS COCOK (allowlist), bukan daftar yang
 * dikecualikan -- supaya status baru/asing dari platform (yang saya
 * tidak tahu artinya) default DITOLAK dulu, bukan lolos diam-diam.
 * User tetap bisa centang manual kalau yakin.
 *
 * DICOCOKKAN PERSIS (bukan "mengandung kata") -- percobaan pertama pakai
 * substring match, dan ternyata KENA KASUS NYATA: user menunjukkan tab
 * status asli TikTok Seller Center "Perlu dikirim 15 / Dikirim 606 /
 * Selesai / Dalam proses / Dibatalkan / Pengantaran gagal". "Perlu
 * dikirim" (artinya BELUM dikirim, masih perlu diproses) mengandung
 * kata "dikirim" di dalamnya, jadi ikut kena cocok dan dianggap aman --
 * padahal itu KEBALIKAN dari "Dikirim" (sudah terkirim). Diverifikasi:
 * dengan substring match, statusAmanDiimpor("Perlu dikirim") === true
 * (SALAH). Dengan exact match di bawah ini, hasilnya false (BENAR).
 *
 * Konsekuensinya: status yang beda tulisan sedikit dari daftar ini
 * (mis. "Pesanan Selesai" bukan cuma "Selesai") tidak akan otomatis
 * cocok. Itu disengaja, bukan celah -- untuk keputusan "potong stok
 * atau tidak", lebih aman gagal ke arah "user centang manual" daripada
 * "salah tercentang otomatis".
 *
 * SENGAJA TIDAK termasuk "ready"/"ready to ship" -- di Shopee itu berarti
 * pesanan sudah dibayar & MENUNGGU dikemas, BUKAN barang sudah keluar
 * gudang.
 */
export const KATA_STATUS_AMAN = ['selesai', 'sudah dikirim', 'dikirim', 'terkirim', 'completed', 'shipped', 'delivered']

export function statusAmanDiimpor(statusPesanan: string): boolean {
  const s = statusPesanan.trim().toLowerCase()
  if (!s) return true // kolom status tidak dipetakan -- tidak ada info buat menyaring, izinkan
  return KATA_STATUS_AMAN.includes(s)
}

/**
 * Subset dari `KATA_STATUS_AMAN` yang berarti pesanan sudah BENAR-BENAR
 * final -- lewat masa komplain/retur di platform, dananya praktis pasti
 * cair. User: "yang memang produknya sudah terkonfirmasi selesai dari
 * tiktok atau shopeenya, maka statusnya langsung paid."
 *
 * SENGAJA BUKAN seluruh `KATA_STATUS_AMAN` -- "Dikirim"/"Shipped" cuma
 * berarti barang sudah keluar gudang (makanya boleh diimpor & memotong
 * stok), TAPI paket masih dalam perjalanan/dalam masa retur, jadi
 * belum tentu dananya sudah aman cair. Cuma "Selesai"/"Completed" yang
 * berarti masa itu sudah lewat.
 */
export const KATA_STATUS_SELESAI = ['selesai', 'completed']

export function statusSudahFinal(statusPesanan: string): boolean {
  return KATA_STATUS_SELESAI.includes(statusPesanan.trim().toLowerCase())
}

export const KANAL_IMPOR: { kunci: Extract<KanalPenjualan, 'shopee' | 'tiktok'>; label: string; kodeAgregat: string }[] = [
  { kunci: 'shopee', label: 'Shopee', kodeAgregat: 'SHOPEE' },
  { kunci: 'tiktok', label: 'TikTok Shop', kodeAgregat: 'TIKTOK' },
]
