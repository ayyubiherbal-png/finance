/**
 * Nomor HP di data pelanggan diketik bebas ("0812-3456-7890", "+62 812...",
 * "812..."), sedangkan wa.me minta format internasional tanpa tanda baca
 * (628123456789). Fungsi ini yang menjembatani.
 */
export function normalkanNomorWa(nomor: string | null | undefined): string | null {
  if (!nomor) return null
  const digit = nomor.replace(/\D/g, '')
  if (digit.length < 8) return null
  if (digit.startsWith('62')) return digit
  if (digit.startsWith('0')) return `62${digit.slice(1)}`
  if (digit.startsWith('8')) return `62${digit}`
  return digit
}

/**
 * Tautan chat WhatsApp 1-per-1 (gratis, tanpa WhatsApp Business API).
 * Untuk blast massal tetap butuh penyedia API resmi -- di luar cakupan
 * aplikasi ini, lihat catatan CRM di supabase/README.md.
 */
export function tautanWa(nomor: string | null | undefined, pesan?: string): string | null {
  const normal = normalkanNomorWa(nomor)
  if (!normal) return null
  const teks = pesan ? `?text=${encodeURIComponent(pesan)}` : ''
  return `https://wa.me/${normal}${teks}`
}
