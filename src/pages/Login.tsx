import { useState, type FormEvent } from 'react'
import { Truck } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button, Card, CardContent, Input, Label, PesanError, Spinner } from '@/components/ui'

export function Login() {
  const { masuk } = useAuth()
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
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="p-6">
          <div className="mb-6 flex flex-col items-center gap-2 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Truck className="h-5 w-5" />
            </div>
            <h1 className="text-lg font-semibold">Ayyubi Finance</h1>
            <p className="text-sm text-muted-foreground">Masuk untuk melanjutkan</p>
          </div>

          <form onSubmit={kirim} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
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
              <Label htmlFor="sandi">Kata sandi</Label>
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
              Masuk
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
