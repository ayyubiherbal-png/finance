import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui'
import { tt } from '@/lib/i18nText'

interface OpsiKonfirmasi {
  judul?: string
  labelSetuju?: string
  berbahaya?: boolean
}

type MintaKonfirmasi = (pesan: string, opsi?: OpsiKonfirmasi) => Promise<boolean>

const KonteksKonfirmasi = createContext<MintaKonfirmasi | null>(null)

export function PenyediaKonfirmasi({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<{ pesan: string; opsi: OpsiKonfirmasi } | null>(null)
  const penyelesai = useRef<((hasil: boolean) => void) | null>(null)

  const konfirmasi = useCallback<MintaKonfirmasi>((pesan, opsi = {}) => {
    penyelesai.current?.(false)
    setDialog({ pesan, opsi })
    return new Promise<boolean>((resolve) => {
      penyelesai.current = resolve
    })
  }, [])

  function selesai(hasil: boolean) {
    penyelesai.current?.(hasil)
    penyelesai.current = null
    setDialog(null)
  }

  function tombolDialog(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') selesai(false)
  }

  return (
    <KonteksKonfirmasi.Provider value={konfirmasi}>
      {children}
      {dialog ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/40 p-4" onMouseDown={() => selesai(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="judul-konfirmasi"
            aria-describedby="pesan-konfirmasi"
            className="w-full max-w-md rounded-2xl bg-card p-5 shadow-floating"
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={tombolDialog}
          >
            <div className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 id="judul-konfirmasi" className="text-lg font-semibold">{dialog.opsi.judul ?? tt('Konfirmasi tindakan')}</h2>
                <p id="pesan-konfirmasi" className="mt-1 text-sm text-muted-foreground">{dialog.pesan}</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => selesai(false)} autoFocus>Batal</Button>
              <Button variant={dialog.opsi.berbahaya ? 'destructive' : 'default'} onClick={() => selesai(true)}>
                {dialog.opsi.labelSetuju ?? 'Lanjutkan'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </KonteksKonfirmasi.Provider>
  )
}

export function useKonfirmasi() {
  const konteks = useContext(KonteksKonfirmasi)
  if (!konteks) throw new Error('useKonfirmasi harus dipakai di dalam PenyediaKonfirmasi')
  return konteks
}
