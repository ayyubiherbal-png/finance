import { useState } from 'react'
import { MessageCircleQuestion } from 'lucide-react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cariPelanggan } from '@/lib/queries'
import { tt } from '@/lib/i18nText'
import { toast } from '@/components/Toast'
import { Combobox, type OpsiCombobox } from '@/components/Combobox'
import { Button, Card, CardContent, Label, PesanError, Spinner, Textarea } from '@/components/ui'

export function AsistenJawabPelanggan() {
  const { profil } = useAuth()
  const [pelangganId, setPelangganId] = useState<string | null>(null)
  const [pelangganLabel, setPelangganLabel] = useState<OpsiCombobox | null>(null)
  const [pertanyaan, setPertanyaan] = useState('')
  const [draf, setDraf] = useState('')
  const [membuat, setMembuat] = useState(false)
  const [mencatat, setMencatat] = useState(false)
  const [error, setError] = useState<unknown>(null)

  function pilihPelanggan(id: string, opsi: OpsiCombobox) {
    setPelangganId(id)
    setPelangganLabel(opsi)
  }

  async function buatDraf() {
    if (!pertanyaan.trim()) {
      setError(new Error('Isi pertanyaan pelanggan dulu.'))
      return
    }
    setError(null)
    setDraf('')
    setMembuat(true)
    try {
      const { data, error } = await supabase.functions.invoke('asisten-jawab-pelanggan', {
        body: { pertanyaan: pertanyaan.trim(), pelangganId },
      })
      if (error) {
        if (error instanceof FunctionsHttpError) {
          const body = await error.context.json().catch(() => null)
          throw new Error(body?.error ?? error.message)
        }
        throw error
      }
      if (data?.ok === false) throw new Error(data.error ?? 'Gagal membuat draf.')
      setDraf(data.draf as string)
    } catch (e) {
      setError(e)
    } finally {
      setMembuat(false)
    }
  }

  async function salin() {
    await navigator.clipboard.writeText(draf)
    toast(tt('Draf disalin ke clipboard.'))
  }

  async function catatFollowUp() {
    if (!pelangganId || !pelangganLabel) return
    setMencatat(true)
    try {
      const { error } = await supabase.from('riwayat_follow_up').insert({
        tugas_id: `manual-asisten-${crypto.randomUUID()}`,
        kategori: 'asisten_jawab',
        entitas_tipe: 'pelanggan',
        entitas_id: pelangganId,
        nama: pelangganLabel.label,
        catatan: `T: ${pertanyaan}\n\nJ: ${draf}`,
        selesai_oleh: profil?.id ?? null,
      })
      if (error) throw error
      toast(tt('Dicatat ke riwayat follow-up pelanggan.'))
    } catch (e) {
      setError(e)
    } finally {
      setMencatat(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <MessageCircleQuestion className="h-5 w-5" /> {tt('Asisten Jawab Pelanggan')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {tt('Tempel pertanyaan pelanggan, dapat draf jawaban dari katalog & riwayat asli -- Anda yang salin & kirim sendiri.')}
        </p>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="space-y-1.5">
            <Label>{tt('Pelanggan (opsional)')}</Label>
            <Combobox
              value={pelangganId}
              opsiTerpilih={pelangganLabel}
              onChange={pilihPelanggan}
              cariOpsi={cariPelanggan}
              placeholder={tt('Cari nama atau kode pelanggan...')}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{tt('Pertanyaan pelanggan')}</Label>
            <Textarea
              rows={3}
              value={pertanyaan}
              onChange={(e) => setPertanyaan(e.target.value)}
              placeholder={tt('Tempel pertanyaan dari WhatsApp/DM di sini...')}
            />
          </div>
          {error ? <PesanError error={error} /> : null}
          <div className="flex justify-end">
            <Button onClick={buatDraf} disabled={membuat}>
              {membuat ? <Spinner /> : null}
              {tt('Buat Draf Jawaban')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {draf ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{draf}</p>
            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
              <Button variant="outline" onClick={salin}>
                {tt('Salin')}
              </Button>
              {pelangganId ? (
                <Button variant="outline" onClick={catatFollowUp} disabled={mencatat}>
                  {mencatat ? <Spinner /> : null}
                  {tt('Catat sebagai Follow-up')}
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
