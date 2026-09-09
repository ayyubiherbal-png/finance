import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Bungkus nilai pencarian user dalam tanda kutip ganda sesuai aturan PostgREST,
 * supaya karakter reserved (`,` `.` `(` `)` `:`) di input tidak mengubah struktur
 * filter saat dipakai di dalam `.or(...)`/`.ilike(...)` mentah (mis. "budi,(admin").
 * Backslash dan kutip ganda di dalam nilai ikut di-escape sesuai spesnya.
 */
export function kutipFilterPostgrest(nilai: string): string {
  return `"${nilai.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}
