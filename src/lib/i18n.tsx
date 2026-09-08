import { createContext, useContext, useState, type ReactNode } from 'react'
import { KAMUS, TEKS, bahasaTersimpan, setBahasaAktif, type Bahasa, type KunciTerjemahan } from './i18nText'

export type { Bahasa, KunciTerjemahan }

interface I18nCtx {
  bahasa: Bahasa
  setBahasa: (b: Bahasa) => void
  t: (kunci: KunciTerjemahan) => string
  /** Terjemahkan teks isi halaman. Kuncinya kalimat Indonesia itu sendiri. */
  tt: (teks: string) => string
}

const Ctx = createContext<I18nCtx | null>(null)

const KUNCI_STORAGE = 'ayyubi-bahasa'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [bahasa, setBahasaState] = useState<Bahasa>(bahasaTersimpan)

  function setBahasa(b: Bahasa) {
    setBahasaAktif(b) // supaya `tt()` versi non-hook (di i18nText.ts) ikut berganti
    setBahasaState(b)
    try {
      localStorage.setItem(KUNCI_STORAGE, b)
    } catch {
      // Pilihan bahasa tidak akan diingat lintas sesi -- tidak fatal.
    }
  }

  const t = (kunci: KunciTerjemahan) => KAMUS[kunci][bahasa]
  // Belum ada terjemahannya -> kembalikan teks Indonesia apa adanya, supaya
  // kalimat yang terlewat tetap terbaca, bukan jadi kosong/kunci mentah.
  const terjemah = (teks: string) => (bahasa === 'en' ? (TEKS[teks] ?? teks) : teks)

  return <Ctx.Provider value={{ bahasa, setBahasa, t, tt: terjemah }}>{children}</Ctx.Provider>
}

export function useI18n() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useI18n dipakai di luar <I18nProvider>')
  return ctx
}
