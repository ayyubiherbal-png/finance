export type DaftarBerhalaman<T> = T[] & { total: number }

export function daftarBerhalaman<T>(baris: T[], total: number | null): DaftarBerhalaman<T> {
  const hasil = baris as DaftarBerhalaman<T>
  hasil.total = total ?? 0
  return hasil
}
