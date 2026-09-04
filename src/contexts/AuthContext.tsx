import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profil } from '@/types/db'

interface AuthState {
  session: Session | null
  profil: Profil | null
  memuat: boolean
  masuk: (email: string, sandi: string) => Promise<void>
  keluar: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profil, setProfil] = useState<Profil | null>(null)
  const [memuat, setMemuat] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setMemuat(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sesi) => {
      setSession(sesi)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  // Profil dibuat otomatis oleh trigger trg_user_baru saat pendaftaran,
  // jadi di sini cukup dibaca.
  useEffect(() => {
    const userId = session?.user.id
    if (!userId) {
      setProfil(null)
      return
    }

    let batal = false
    supabase
      .from('profil')
      .select('id, nama, peran, telepon, aktif')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (!batal) setProfil((data as Profil) ?? null)
      })

    return () => {
      batal = true
    }
  }, [session?.user.id])

  async function masuk(email: string, sandi: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: sandi })
    if (error) throw new Error(terjemahkanError(error.message))
  }

  async function keluar() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, profil, memuat, masuk, keluar }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider')
  return ctx
}

function terjemahkanError(pesan: string) {
  if (pesan.includes('Invalid login credentials')) return 'Email atau kata sandi salah.'
  if (pesan.includes('Email not confirmed')) return 'Email belum dikonfirmasi.'
  return pesan
}
