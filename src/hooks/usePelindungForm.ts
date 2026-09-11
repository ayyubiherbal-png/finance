import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useKonfirmasi } from '@/components/Konfirmasi'

/**
 * Menandai form sebagai berubah setelah interaksi input pertama. Refresh/tab
 * memakai peringatan native browser; tautan internal memakai dialog aplikasi.
 */
export function usePelindungForm(aktif = true) {
  const ref = useRef<HTMLDivElement>(null)
  const [kotor, setKotor] = useState(false)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const konfirmasi = useKonfirmasi()

  useEffect(() => {
    if (!kotor) return
    const sebelumKeluar = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', sebelumKeluar)
    return () => window.removeEventListener('beforeunload', sebelumKeluar)
  }, [kotor])

  useEffect(() => {
    const elemen = ref.current
    if (!elemen) return
    const berubah = () => { if (aktif) setKotor(true) }
    elemen.addEventListener('input', berubah)
    elemen.addEventListener('change', berubah)
    return () => {
      elemen.removeEventListener('input', berubah)
      elemen.removeEventListener('change', berubah)
    }
  }, [aktif])

  useEffect(() => setKotor(false), [pathname])

  useEffect(() => {
    if (!kotor) return
    const cegahTautan = async (e: MouseEvent) => {
      const tautan = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
      if (!tautan || !ref.current?.contains(tautan) || tautan.target === '_blank') return
      const url = new URL(tautan.href, window.location.href)
      if (url.origin !== window.location.origin) return
      e.preventDefault()
      e.stopPropagation()
      if (await konfirmasi('Perubahan belum disimpan. Tinggalkan halaman ini?', { judul: 'Perubahan belum disimpan' })) {
        setKotor(false)
        navigate(`${url.pathname}${url.search}${url.hash}`)
      }
    }
    document.addEventListener('click', cegahTautan, true)
    return () => document.removeEventListener('click', cegahTautan, true)
  }, [kotor, konfirmasi, navigate])

  return { ref, kotor, tandaiBersih: () => setKotor(false) }
}
