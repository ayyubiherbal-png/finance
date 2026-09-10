import { useEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { Button, Spinner } from '@/components/ui'
import { toast } from '@/components/Toast'
import { tt } from '@/lib/i18nText'
import { pesanKesalahan } from '@/lib/format'
import { unduhCsv, unduhPdf, type KolomEkspor, type OpsiEkspor } from '@/lib/eksporData'

interface TombolEksporProps<T> {
  /** Ambil dataset LENGKAP (mengabaikan .limit() layar), dipanggil hanya
   * saat tombol diklik (lazy). Harus menghormati filter/pencarian yang
   * sedang aktif di halaman, tanpa batas selain pengaman internal. */
  ambilData: () => Promise<T[]>
  kolom: KolomEkspor<T>[]
  opsi: OpsiEkspor
  disabled?: boolean
}

export function TombolEkspor<T>({ ambilData, kolom, opsi, disabled }: TombolEksporProps<T>) {
  const [terbuka, setTerbuka] = useState(false)
  const [memproses, setMemproses] = useState<'csv' | 'pdf' | null>(null)
  const kotakRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKlikLuar(e: MouseEvent) {
      if (kotakRef.current && !kotakRef.current.contains(e.target as Node)) setTerbuka(false)
    }
    document.addEventListener('mousedown', onKlikLuar)
    return () => document.removeEventListener('mousedown', onKlikLuar)
  }, [])

  async function ekspor(format: 'csv' | 'pdf') {
    setTerbuka(false)
    setMemproses(format)
    try {
      const baris = await ambilData()
      if (baris.length === 0) {
        toast('Tidak ada data untuk diekspor.', 'error')
        return
      }
      if (format === 'csv') unduhCsv(baris, kolom, opsi)
      else await unduhPdf(baris, kolom, opsi)
    } catch (e) {
      toast(pesanKesalahan(e), 'error')
    } finally {
      setMemproses(null)
    }
  }

  return (
    <div ref={kotakRef} className="relative inline-block text-left">
      <Button variant="outline" onClick={() => setTerbuka((v) => !v)} disabled={disabled || !!memproses}>
        {memproses ? <Spinner className="h-3.5 w-3.5" /> : <Download className="h-4 w-4" />}
        Ekspor
      </Button>
      {terbuka ? (
        <div className="absolute right-0 top-full z-10 mt-1 min-w-[8rem] rounded-md border border-border bg-card p-1 shadow-md">
          <button
            type="button"
            onClick={() => ekspor('csv')}
            className="flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
          >
            {tt('Excel (CSV)')}
          </button>
          <button
            type="button"
            onClick={() => ekspor('pdf')}
            className="flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
          >
            {tt('PDF')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
