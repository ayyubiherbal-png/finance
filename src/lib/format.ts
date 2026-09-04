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

/** Untuk input type="date" dan kolom date Postgres: 2026-09-04 */
export function tanggalISO(nilai: Date = new Date()): string {
  const offset = nilai.getTimezoneOffset() * 60_000
  return new Date(nilai.getTime() - offset).toISOString().slice(0, 10)
}
