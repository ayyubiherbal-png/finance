import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface OpsiCombobox {
  value: string
  label: string
  sublabel?: string
}

interface ComboboxProps {
  value: string | null
  /** Opsi yang sedang terpilih, supaya labelnya bisa ditampilkan tanpa fetch ulang (mis. saat buka form edit). */
  opsiTerpilih?: OpsiCombobox | null
  onChange: (value: string, opsi: OpsiCombobox) => void
  cariOpsi: (kueri: string) => Promise<OpsiCombobox[]>
  placeholder?: string
  disabled?: boolean
  className?: string
}

/**
 * Dropdown pencarian generik (tanpa library eksternal) untuk memilih
 * produk/pelanggan/supplier dari daftar yang bisa ratusan baris --
 * ketik untuk cari, jangan render semuanya sekaligus.
 */
export function Combobox({
  value,
  opsiTerpilih,
  onChange,
  cariOpsi,
  placeholder,
  disabled,
  className,
}: ComboboxProps) {
  const [terbuka, setTerbuka] = useState(false)
  const [kueri, setKueri] = useState('')
  const [opsi, setOpsi] = useState<OpsiCombobox[]>([])
  const [memuat, setMemuat] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const terpilih = opsiTerpilih && opsiTerpilih.value === value ? opsiTerpilih : null

  useEffect(() => {
    function onKlikLuar(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setTerbuka(false)
        setKueri('')
      }
    }
    document.addEventListener('mousedown', onKlikLuar)
    return () => document.removeEventListener('mousedown', onKlikLuar)
  }, [])

  useEffect(() => {
    if (!terbuka) return
    let batal = false
    setMemuat(true)
    const timer = setTimeout(() => {
      cariOpsi(kueri)
        .then((hasil) => {
          if (!batal) setOpsi(hasil)
        })
        .finally(() => {
          if (!batal) setMemuat(false)
        })
    }, 200)
    return () => {
      batal = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kueri, terbuka])

  return (
    <div ref={boxRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setTerbuka((v) => !v)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={cn('truncate text-left', !terpilih && 'text-muted-foreground')}>
          {terpilih ? terpilih.label : (placeholder ?? 'Pilih...')}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {terbuka ? (
        <div className="absolute z-20 mt-1 w-full min-w-[240px] rounded-md border border-border bg-card shadow-md">
          <div className="flex items-center gap-2 border-b border-border px-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={kueri}
              onChange={(e) => setKueri(e.target.value)}
              placeholder="Ketik untuk cari..."
              className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {memuat ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">Mencari...</p>
            ) : opsi.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">Tidak ada hasil.</p>
            ) : (
              opsi.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange(o.value, o)
                    setTerbuka(false)
                    setKueri('')
                  }}
                  className={cn(
                    'flex w-full flex-col items-start px-3 py-1.5 text-left text-sm hover:bg-accent',
                    o.value === value && 'bg-accent',
                  )}
                >
                  <span>{o.label}</span>
                  {o.sublabel ? (
                    <span className="text-xs text-muted-foreground">{o.sublabel}</span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function KeteranganField({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>
}
