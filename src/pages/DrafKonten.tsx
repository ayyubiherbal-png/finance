import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PenTool } from 'lucide-react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { cariProduk } from '@/lib/queries'
import { tanggalWaktu } from '@/lib/format'
import { tt } from '@/lib/i18nText'
import { toast } from '@/components/Toast'
import { Combobox, type OpsiCombobox } from '@/components/Combobox'
import { Button, Card, CardContent, KondisiKosong, Label, PesanError, Select, Spinner } from '@/components/ui'
import { LABEL_KANAL } from '@/pages/SalesOrder'
import type { KanalPenjualan } from '@/types/db'

interface BarisDraf {
  id: string
  kanal: KanalPenjualan
  draf: string
  dibuat_pada: string
  produk: { nama: string } | null
}

export function DrafKonten() {
  const queryClient = useQueryClient()
  const [produkId, setProdukId] = useState<string | null>(null)
  const [produkLabel, setProdukLabel] = useState<OpsiCombobox | null>(null)
  const [kanal, setKanal] = useState<KanalPenjualan>('whatsapp')
  const [membuat, setMembuat] = useState(false)
  const [terbuka, setTerbuka] = useState<Set<string>>(new Set())
  const [error, setError] = useState<unknown>(null)

  const { data, isLoading, error: errorMuat } = useQuery({
    queryKey: ['konten-draft'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('konten_draft')
        .select('id, kanal, draf, dibuat_pada, produk:produk_id(nama)')
        .order('dibuat_pada', { ascending: false })
        .limit(30)
      if (error) throw error
      return (data ?? []) as unknown as BarisDraf[]
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

  function pilihProduk(id: string, opsi: OpsiCombobox) {
    setProdukId(id)
    setProdukLabel(opsi)
  }

  async function buatDraf() {
    if (!produkId) {
      setError(new Error('Pilih produk dulu.'))
      return
    }
    setError(null)
    setMembuat(true)
    try {
      const { data, error } = await supabase.functions.invoke('buat-draf-konten', { body: { produkId, kanal } })
      if (error) {
        if (error instanceof FunctionsHttpError) {
          const body = await error.context.json().catch(() => null)
          throw new Error(body?.error ?? error.message)
        }
        throw error
      }
      if (data?.ok === false) throw new Error(data.error ?? 'Gagal membuat draf.')
      await queryClient.invalidateQueries({ queryKey: ['konten-draft'] })
      if (data?.draf?.id) setTerbuka((s) => new Set(s).add(data.draf.id))
    } catch (e) {
      setError(e)
    } finally {
      setMembuat(false)
    }
  }

  async function salin(teks: string) {
    await navigator.clipboard.writeText(teks)
    toast(tt('Draf disalin ke clipboard.'))
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <PenTool className="h-5 w-5" /> {tt('Draf Konten')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {tt('Draf caption promosi dari data produk asli, per kanal -- Anda yang tinjau & posting sendiri.')}
        </p>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{tt('Produk')}</Label>
              <Combobox value={produkId} opsiTerpilih={produkLabel} onChange={pilihProduk} cariOpsi={cariProduk} placeholder={tt('Cari produk...')} />
            </div>
            <div className="space-y-1.5">
              <Label>{tt('Kanal')}</Label>
              <Select value={kanal} onChange={(e) => setKanal(e.target.value as KanalPenjualan)}>
                {Object.entries(LABEL_KANAL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {error ? <PesanError error={error} /> : null}
          <div className="flex justify-end">
            <Button onClick={buatDraf} disabled={membuat}>
              {membuat ? <Spinner /> : <PenTool className="h-4 w-4" />}
              {tt('Buat Draf Konten')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : errorMuat ? (
        <PesanError error={errorMuat} />
      ) : !data?.length ? (
        <KondisiKosong pesan={tt('Belum ada draf konten. Pilih produk & kanal di atas untuk membuat yang pertama.')} />
      ) : (
        <div className="space-y-3">
          {data.map((d) => {
            const buka = terbuka.has(d.id)
            return (
              <Card key={d.id}>
                <CardContent className="p-4">
                  <button type="button" onClick={() => toggle(d.id)} className="flex w-full items-center justify-between gap-3 text-left">
                    <div>
                      <p className="text-sm font-medium">
                        {d.produk?.nama ?? tt('Produk sudah dihapus')} &middot; {LABEL_KANAL[d.kanal]}
                      </p>
                      <p className="text-xs text-muted-foreground">{tanggalWaktu(d.dibuat_pada)}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{buka ? tt('Tutup') : tt('Baca selengkapnya')}</span>
                  </button>
                  {buka ? (
                    <>
                      <div className="mt-3 whitespace-pre-wrap border-t border-border pt-3 text-sm leading-relaxed">{d.draf}</div>
                      <div className="mt-3 flex justify-end border-t border-border pt-3">
                        <Button variant="outline" onClick={() => salin(d.draf)}>
                          {tt('Salin')}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{d.draf}</p>
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
