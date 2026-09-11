const UKURAN_BATCH = 1000

/** Ambil seluruh hasil Supabase tanpa terpotong batas respons bawaan 1.000 baris. */
export async function ambilSemuaBertahap<T>(
  ambil: (dari: number, sampai: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const hasil: T[] = []
  for (let dari = 0; ; dari += UKURAN_BATCH) {
    const { data, error } = await ambil(dari, dari + UKURAN_BATCH - 1)
    if (error) throw error
    const batch = data ?? []
    hasil.push(...batch)
    if (batch.length < UKURAN_BATCH) return hasil
  }
}
