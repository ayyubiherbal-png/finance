const rupiahFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const angkaFormatter = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 2,
})

const tanggalFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const tanggalWaktuFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** Rp 1.250.000 */
export function rupiah(nilai: number | string | null | undefined): string {
  const n = Number(nilai ?? 0)
  return rupiahFormatter.format(Number.isFinite(n) ? n : 0)
}

/** 1.250,5 — untuk kuantitas, bukan uang */
export function angka(nilai: number | string | null | undefined): string {
  const n = Number(nilai ?? 0)
  return angkaFormatter.format(Number.isFinite(n) ? n : 0)
}

/** 04 Sep 2026 */
export function tanggal(nilai: string | Date | null | undefined): string {
  if (!nilai) return '-'
  const d = typeof nilai === 'string' ? new Date(nilai) : nilai
  return Number.isNaN(d.getTime()) ? '-' : tanggalFormatter.format(d)
}

/** 04 Sep 2026 14.30 -- dipakai untuk timestamptz (kapan tepatnya, bukan cuma tanggal). */
export function tanggalWaktu(nilai: string | Date | null | undefined): string {
  if (!nilai) return '-'
  const d = typeof nilai === 'string' ? new Date(nilai) : nilai
  return Number.isNaN(d.getTime()) ? '-' : tanggalWaktuFormatter.format(d)
}

/** Untuk input type="date" dan kolom date Postgres: 2026-09-04 */
export function tanggalISO(nilai: Date = new Date()): string {
  const offset = nilai.getTimezoneOffset() * 60_000
  return new Date(nilai.getTime() - offset).toISOString().slice(0, 10)
}

/**
 * Cek kasar: teks ini masuk akal sebagai NAMA orang, bukan angka polos.
 *
 * Dipakai buat `nama_penerima` di daftar Sales Order/Surat Jalan/Faktur
 * -- ditemukan kasus nyata: satu batch impor TikTok lama nampilin "100",
 * "100", "1400" dst. sebagai "nama pembeli", karena pemetaan kolom "Nama
 * Pembeli/Penerima" di layar Impor Pesanan waktu itu ternyata kena
 * kolom angka (mis. berat/ongkir), bukan kolom nama/username -- salah
 * pencet manual, bukan bug di logika impornya. Data lamanya tidak
 * diubah (bisa saja itu memang isi filenya), tapi TIDAK ditampilkan
 * sebagai "nama" kalau isinya cuma angka -- jatuh balik ke nama akun
 * pelanggan biasa, daripada nampilin angka yang jelas bukan nama.
 */
export function terlihatSepertiNama(teks: string | null | undefined): boolean {
  const t = (teks ?? '').trim()
  if (!t) return false
  return !/^[\d.,\s]+$/.test(t)
}

/**
 * Mengambil pesan yang bisa dibaca dari error apa pun -- termasuk error
 * dari Supabase/PostgREST, yang bentuknya OBJEK BIASA `{code, message,
 * details, hint}`, BUKAN instance `Error` (diverifikasi lewat browser
 * langsung: `error instanceof Error` selalu `false` untuk error dari
 * `.rpc()`/query Supabase). Kalau ditulis `error instanceof Error ?
 * error.message : String(error)` seperti yang sempat dipakai di
 * `PesanError`, hasilnya jatuh ke `String(objek biasa)` yang cuma
 * mencetak "[object Object]" -- pesan errornya yang sebenarnya berguna
 * (mis. "invalid input syntax for type uuid...") jadi terbuang, dan user
 * tidak pernah tahu APA yang sebenarnya gagal.
 */
export function pesanKesalahan(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err) {
    const pesan = (err as { message?: unknown }).message
    if (typeof pesan === 'string' && pesan.trim()) return pesan
  }
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}
