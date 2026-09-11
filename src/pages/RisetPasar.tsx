import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { tanggalWaktu } from '@/lib/format'
import { tt } from '@/lib/i18nText'
import { Button, Card, CardContent, KondisiKosong, PesanError, Spinner } from '@/components/ui'

interface BriefRiset {
  id: string
  hasil_riset: string
  model: string
  dibuat_pada: string
  pembuat: { nama: string } | null
}

export function RisetPasar() {
  const queryClient = useQueryClient()
  const [terbuka, setTerbuka] = useState<Set<string>>(new Set())
  const [membuat, setMembuat] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const { data, isLoading, error: errorMuat } = useQuery({
    queryKey: ['riset-pasar-brief'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('riset_pasar_brief')
        .select('id, hasil_riset, model, dibuat_pada, pembuat:dibuat_oleh(nama)')
        .order('dibuat_pada', { ascending: false })
        .limit(30)
      if (error) throw error
      return (data ?? []) as unknown as BriefRiset[]
    },
  })

  function toggle(id: string) {
    setTerbuka((s) => {
      const salinan = new Set(s)
      if (salinan.has(id)) salinan.delete(id)
      else salinan.add(id)
      return salinan
    })
  }

  async function buatRiset() {
    setError(null)
    setMembuat(true)
    try {
      const { data: hasil, error } = await supabase.functions.invoke('riset-pasar')
      if (error) {
        if (error instanceof FunctionsHttpError) {
          const body = await error.context.json().catch(() => null)
          throw new Error(body?.error ?? error.message)
        }
        throw error
      }
      if (hasil?.ok === false) throw new Error(hasil.error ?? 'Gagal membuat riset.')
      await queryClient.invalidateQueries({ queryKey: ['riset-pasar-brief'] })
      if (hasil?.brief?.id) setTerbuka((s) => new Set(s).add(hasil.brief.id))
    } catch (e) {
      setError(e)
    } finally {
      setMembuat(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Sparkles className="h-5 w-5" /> {tt('Riset Pasar')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tt('Brief AI yang menggabungkan data penjualan internal dengan tren pasar luar -- dipicu manual, belum terjadwal otomatis.')}
          </p>
        </div>
        <Button onClick={buatRiset} disabled={membuat}>
          {membuat ? <Spinner /> : <Sparkles className="h-4 w-4" />}
          {tt('Buat Riset Baru')}
        </Button>
      </div>

      {error ? <PesanError error={error} /> : null}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : errorMuat ? (
        <PesanError error={errorMuat} />
      ) : !data?.length ? (
        <KondisiKosong pesan={tt('Belum ada riset. Klik "Buat Riset Baru" untuk memulai -- butuh beberapa saat sampai hasilnya siap.')} />
      ) : (
        <div className="space-y-3">
          {data.map((brief) => {
            const buka = terbuka.has(brief.id)
            return (
              <Card key={brief.id}>
                <CardContent className="p-4">
                  <button
                    type="button"
                    onClick={() => toggle(brief.id)}
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <div>
                      <p className="text-sm font-medium">{tanggalWaktu(brief.dibuat_pada)}</p>
                      <p className="text-xs text-muted-foreground">
                        {brief.pembuat?.nama ?? tt('Sistem')} &middot; {brief.model}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">{buka ? tt('Tutup') : tt('Baca selengkapnya')}</span>
                  </button>
                  {buka ? (
                    <div className="mt-3 whitespace-pre-wrap border-t border-border pt-3 text-sm leading-relaxed">{brief.hasil_riset}</div>
                  ) : (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{brief.hasil_riset}</p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
