import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Star } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { NAMA_TOKO } from '@/lib/identitasToko'
import { useI18n } from '@/lib/i18n'
import { tt } from '@/lib/i18nText'
import { Button, PesanError, Spinner, Textarea } from '@/components/ui'

/**
 * Halaman PUBLIK (0042, celah #6 & #7 customer journey) -- pelanggan
 * tidak punya akun di aplikasi ini sama sekali, jadi tautan `token`
 * acak inilah satu-satunya cara mereka mengisi. SENGAJA di luar
 * AuthProvider (lihat App.tsx) supaya tidak kena gerbang login.
 *
 * Satu formulir menangkap 2 hal sekaligus (bukan 2 sistem terpisah):
 * skor kepuasan (CSAT 1-5, celah #6 "survei kepuasan") DAN testimoni
 * teks opsional + izin publikasi (celah #7 "minta testimoni").
 */
export function UmpanBalikPublik() {
  const { token } = useParams<{ token: string }>()
  const { bahasa, setBahasa } = useI18n()

  const { data: link, isLoading, error } = useQuery({
    queryKey: ['umpan-balik-link', token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ambil_link_umpan_balik', { p_token: token as string })
      if (error) throw error
      return (data?.[0] ?? null) as { nama: string | null; sudah_diisi: boolean } | null
    },
  })

  const [skor, setSkor] = useState<number | null>(null)
  const [testimoni, setTestimoni] = useState('')
  const [bolehPublikasi, setBolehPublikasi] = useState(false)
  const [mengirim, setMengirim] = useState(false)
  const [errorKirim, setErrorKirim] = useState<unknown>(null)
  const [terkirim, setTerkirim] = useState(false)

  async function kirim() {
    setErrorKirim(null)
    if (!skor) {
      setErrorKirim(new Error('Pilih dulu berapa bintang.'))
      return
    }
    setMengirim(true)
    try {
      const { error: err } = await supabase.rpc('kirim_umpan_balik', {
        p_token: token as string,
        p_skor: skor,
        p_testimoni: testimoni,
        p_boleh_publikasi: bolehPublikasi,
      })
      if (err) throw err
      setTerkirim(true)
    } catch (e) {
      setErrorKirim(e)
    } finally {
      setMengirim(false)
    }
  }

  // Di luar JSX (bukan literal 'Kak'/'there' langsung di template literal
  // JSX) supaya tidak kena sisir dwibahasa -- ini sengaja tidak pernah
  // diterjemahkan, sama seperti fallback nama di draf pesan WA lain
  // (lihat renderPesan() di TugasFollowUp.tsx).
  const namaSapa = link?.nama || 'Kak'
  const namaSapaEn = link?.nama || 'there'

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-brand-wash p-4">
      <div className="absolute right-4 top-4 flex items-center rounded-full bg-card/80 p-0.5 text-xs font-semibold shadow-sm">
        {(['id', 'en'] as const).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBahasa(b)}
            className={cn(
              'cursor-pointer rounded-full px-2.5 py-1 uppercase transition-colors',
              bahasa === b ? 'bg-primary text-primary-foreground' : 'text-foreground/60 hover:text-foreground',
            )}
          >
            {b}
          </button>
        ))}
      </div>

      <div className="glass w-full max-w-sm rounded-xl p-6 shadow-lg">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <img src="/ayyubi-logo.jpeg" alt={NAMA_TOKO} className="h-16 w-16 rounded-2xl object-cover shadow-md ring-1 ring-border" />
          <h1 className="mt-1 text-lg font-semibold">{NAMA_TOKO}</h1>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner className="h-6 w-6" />
          </div>
        ) : error || !link ? (
          <p className="text-center text-sm text-muted-foreground">{tt('Tautan tidak ditemukan atau sudah kedaluwarsa.')}</p>
        ) : link.sudah_diisi || terkirim ? (
          <div className="space-y-2 text-center">
            <p className="text-2xl">🙏</p>
            <p className="font-medium">{tt('Terima kasih atas masukannya!')}</p>
            <p className="text-sm text-muted-foreground">
              {bahasa === 'id' ? `Sudah kami terima, sangat berarti untuk ${NAMA_TOKO}.` : `We've received it -- it means a lot to ${NAMA_TOKO}.`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-center text-sm text-muted-foreground">
              {bahasa === 'id' ? `Halo ${namaSapa}, gimana pengalaman belanja Anda di ${NAMA_TOKO}?` : `Hi ${namaSapaEn}, how was your experience shopping at ${NAMA_TOKO}?`}
            </p>

            <div className="flex justify-center gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSkor(n)}
                  aria-label={bahasa === 'id' ? `Beri skor ${n} dari 5` : `Rate ${n} out of 5`}
                  aria-pressed={skor === n}
                  className="cursor-pointer transition-transform hover:scale-110"
                >
                  <Star className={cn('h-8 w-8', skor && n <= skor ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} />
                </button>
              ))}
            </div>

            <Textarea
              rows={3}
              placeholder="Cerita singkat pengalaman Anda (opsional)..."
              value={testimoni}
              onChange={(e) => setTestimoni(e.target.value)}
            />

            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={bolehPublikasi}
                onChange={(e) => setBolehPublikasi(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-input"
              />
              {bahasa === 'id'
                ? `Boleh ${NAMA_TOKO} menampilkan cerita saya di atas sebagai testimoni publik.`
                : `${NAMA_TOKO} may display my note above as a public testimonial.`}
            </label>

            {errorKirim ? <PesanError error={errorKirim} /> : null}

            <Button className="w-full" onClick={kirim} disabled={mengirim || !skor}>
              {mengirim ? <Spinner /> : null}
              Kirim
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
