import { useEffect, useState } from 'react'
import { CheckCircle2, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToastItem {
  id: number
  pesan: string
  tipe: 'sukses' | 'error'
}

let daftar: ToastItem[] = []
let penghitung = 0
const pelanggan = new Set<(daftar: ToastItem[]) => void>()

function beriTahu() {
  pelanggan.forEach((fn) => fn(daftar))
}

function hapus(id: number) {
  daftar = daftar.filter((t) => t.id !== id)
  beriTahu()
}

/** Notifikasi singkat di pojok layar -- dipakai supaya user tahu Simpan/aksi lain
 *  benar-benar berhasil (sebelum ini tidak ada tanda apa pun, jadi user suka
 *  klik dua kali karena mengira klik pertama belum jalan). */
export function toast(pesan: string, tipe: ToastItem['tipe'] = 'sukses') {
  const id = ++penghitung
  daftar = [...daftar, { id, pesan, tipe }]
  beriTahu()
  setTimeout(() => hapus(id), 3000)
}

export function Toaster() {
  const [list, setList] = useState<ToastItem[]>(daftar)

  useEffect(() => {
    pelanggan.add(setList)
    return () => {
      pelanggan.delete(setList)
    }
  }, [])

  if (list.length === 0) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4 sm:left-auto sm:right-4 sm:items-end">
      {list.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex items-center gap-2 rounded-md border px-3 py-2 text-sm shadow-lg',
            t.tipe === 'sukses'
              ? 'border-primary/30 bg-primary text-primary-foreground'
              : 'border-destructive/30 bg-destructive text-destructive-foreground',
          )}
        >
          {t.tipe === 'sukses' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
          <span>{t.pesan}</span>
          <button
            type="button"
            onClick={() => hapus(t.id)}
            className="ml-1 shrink-0 opacity-70 hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
