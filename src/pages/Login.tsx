import { useState, type FormEvent } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Button, Input, Label, PesanError, Spinner } from '@/components/ui'

export function Login() {
  const { masuk } = useAuth()
  const { bahasa, setBahasa, t } = useI18n()
  const [email, setEmail] = useState('')
  const [sandi, setSandi] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [proses, setProses] = useState(false)

  async function kirim(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setProses(true)
    try {
      await masuk(email, sandi)
    } catch (err) {
      setError(err)
    } finally {
      setProses(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-brand-wash p-4">
      <div className="absolute right-4 top-4 flex items-center rounded-full bg-card/80 p-0.5 text-xs font-semibold shadow-sm">
        {(['id', 'en'] as const).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBahasa(b)}
            className={cn(
              'rounded-full px-2.5 py-1 uppercase transition-colors',
              bahasa === b ? 'bg-primary text-primary-foreground' : 'text-foreground/60 hover:text-foreground',
            )}
          >
            {b}
          </button>
        ))}
      </div>

      {/* Panel kaca -- ditulis manual (bukan komponen Card) supaya class .glass
          tidak kalah rebutan sama bg-card bawaan Card. */}
      <div className="glass w-full max-w-sm rounded-xl p-6 shadow-lg">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <img
            src="/ayyubi-logo.jpeg"
            alt="Ayyubi Food"
            className="h-16 w-16 rounded-2xl object-cover shadow-md ring-1 ring-border"
          />
          <h1 className="mt-1 text-lg font-semibold">Ayyubi Finance</h1>
          <p className="text-sm text-muted-foreground">{t('login.subjudul')}</p>
        </div>

        <form onSubmit={kirim} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">{t('login.email')}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sandi">{t('login.kataSandi')}</Label>
            <Input
              id="sandi"
              type="password"
              autoComplete="current-password"
              required
              value={sandi}
              onChange={(e) => setSandi(e.target.value)}
            />
          </div>

          {error ? <PesanError error={error} /> : null}

          <Button type="submit" className="w-full" disabled={proses}>
            {proses ? <Spinner /> : null}
            {proses ? t('login.memproses') : t('login.masuk')}
          </Button>
        </form>
      </div>
    </div>
  )
}
