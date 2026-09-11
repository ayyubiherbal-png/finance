import { useState } from 'react'
import { Link } from 'react-router-dom'
import { tt } from '@/lib/i18nText'
import { useKonfirmasi } from '@/components/Konfirmasi'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { toast } from '@/components/Toast'
import { Badge, Button, Card, CardContent, CardHeader, Input, Label, PesanError, Select, Spinner, Textarea } from '@/components/ui'
import { INFO_KATEGORI, useTahapanTreatment, kelompokTahapan } from '@/pages/TugasFollowUp'
import type { KategoriTreatmentFu, TahapanTreatmentFu as TahapRow } from '@/types/db'

/**
 * Halaman tersendiri (dulunya panel di dalam Tugas Follow-Up) --
 * dipisah + tampilan dirapikan atas permintaan user: satu kartu per
 * kategori, tahap ditampilkan sebagai daftar "H+N" berurutan (bukan
 * tabel rata yang bikin kategori susah dibedakan sekilas & pesan
 * kepotong), pesan WA ditampilkan penuh (tidak dipotong lagi).
 */
const URUTAN_KATEGORI_TREATMENT: KategoriTreatmentFu[] = ['baru', 'naik_setia', 'naik_juara', 'mulai_hilang', 'tidur', 'ulang_tahun']

/** Warna aksen kartu per kategori -- samakan makna warna dengan Badge (INFO_KATEGORI[k].varian) supaya konsisten dengan tabel Tugas Follow-Up. */
const VARIAN_AKSEN: Record<string, string> = {
  default: 'border-l-primary',
  netral: 'border-l-muted-foreground/30',
  sukses: 'border-l-emerald-400',
  peringatan: 'border-l-amber-400',
  bahaya: 'border-l-red-400',
}

interface FormTahap {
  kategori: KategoriTreatmentFu
  label: string
  hari_min: number
  hari_max: number
  pesan_template: string
  urutan: number
  aktif: boolean
}

function tahapKosong(kategori: KategoriTreatmentFu): FormTahap {
  return { kategori, label: '', hari_min: 0, hari_max: 0, pesan_template: '', urutan: 0, aktif: true }
}

export function TahapanTreatmentFu() {
  const konfirmasi = useKonfirmasi()
  const { profil } = useAuth()
  const bolehAkses = profil?.peran === 'owner' || profil?.peran === 'admin'
  const queryClient = useQueryClient()
  const { data: tahapan, isLoading, error } = useTahapanTreatment()
  const tahapanPerKategori = kelompokTahapan(tahapan)

  const [sedangEdit, setSedangEdit] = useState<string | null>(null)
  const [form, setForm] = useState<FormTahap>(tahapKosong('baru'))
  const [menyimpan, setMenyimpan] = useState(false)
  const [errorSimpan, setErrorSimpan] = useState<unknown>(null)

  function ubah<K extends keyof FormTahap>(kunci: K, nilai: FormTahap[K]) {
    setForm((f) => ({ ...f, [kunci]: nilai }))
  }

  function mulaiTambah(kategori: KategoriTreatmentFu) {
    setForm(tahapKosong(kategori))
    setErrorSimpan(null)
    setSedangEdit('baru')
  }

  function mulaiEdit(t: TahapRow) {
    setForm({ kategori: t.kategori, label: t.label, hari_min: t.hari_min, hari_max: t.hari_max, pesan_template: t.pesan_template, urutan: t.urutan, aktif: t.aktif })
    setErrorSimpan(null)
    setSedangEdit(t.id)
  }

  function batal() {
    setSedangEdit(null)
    setErrorSimpan(null)
  }

  async function simpan() {
    setErrorSimpan(null)
    if (!form.label.trim()) {
      setErrorSimpan(new Error('Label tahap wajib diisi.'))
      return
    }
    if (!form.pesan_template.trim()) {
      setErrorSimpan(new Error('Pesan tahap wajib diisi.'))
      return
    }
    if (form.hari_max < form.hari_min) {
      setErrorSimpan(new Error('Hari maksimum tidak boleh kurang dari hari minimum.'))
      return
    }
    const payload = {
      kategori: form.kategori,
      label: form.label.trim(),
      hari_min: form.hari_min,
      hari_max: form.hari_max,
      pesan_template: form.pesan_template.trim(),
      urutan: form.urutan,
      aktif: form.aktif,
    }
    setMenyimpan(true)
    try {
      if (sedangEdit === 'baru') {
        const { error: err } = await supabase.from('tahapan_treatment_fu').insert(payload)
        if (err) throw err
        toast('Tahap ditambahkan.')
      } else {
        const { error: err } = await supabase.from('tahapan_treatment_fu').update(payload).eq('id', sedangEdit)
        if (err) throw err
        toast('Tahap tersimpan.')
      }
      setSedangEdit(null)
      queryClient.invalidateQueries({ queryKey: ['tahapan-treatment-fu'] })
    } catch (err) {
      setErrorSimpan(err)
    } finally {
      setMenyimpan(false)
    }
  }

  async function hapus(t: TahapRow) {
    if (!(await konfirmasi(`Hapus tahap "${t.label}"?`, { labelSetuju: 'Hapus', berbahaya: true }))) return
    const { error: err } = await supabase.from('tahapan_treatment_fu').delete().eq('id', t.id)
    if (err) {
      setErrorSimpan(err)
    } else {
      toast('Tahap dihapus.')
      queryClient.invalidateQueries({ queryKey: ['tahapan-treatment-fu'] })
    }
  }

  async function toggleAktif(t: TahapRow) {
    const { error: err } = await supabase.from('tahapan_treatment_fu').update({ aktif: !t.aktif }).eq('id', t.id)
    if (err) setErrorSimpan(err)
    else queryClient.invalidateQueries({ queryKey: ['tahapan-treatment-fu'] })
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/tugas-follow-up">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Tahapan Treatment')}</h1>
          <p className="text-sm text-muted-foreground">
            {tt('Titik sentuh (H+N) dan pesan WA per kategori -- satu kategori bisa punya beberapa tahap. Cuma admin/owner yang boleh mengubah.')}
          </p>
        </div>
      </div>

      {!bolehAkses ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {tt('Halaman ini cuma bisa diubah oleh admin/owner.')}
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : error ? (
        <PesanError error={error} />
      ) : (
        <div className="space-y-4">
          {errorSimpan ? <PesanError error={errorSimpan} /> : null}

          {URUTAN_KATEGORI_TREATMENT.map((kategori) => {
            const info = INFO_KATEGORI[kategori]
            const daftar = tahapanPerKategori[kategori] ?? []
            const sedangTambahDisini = sedangEdit === 'baru' && form.kategori === kategori

            return (
              <Card key={kategori} className={cn('border-l-4', VARIAN_AKSEN[info.varian])}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Badge variant={info.varian}>{info.label}</Badge>
                      <p className="mt-1 text-sm text-muted-foreground">{info.jelas}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => mulaiTambah(kategori)}>
                      <Plus className="h-4 w-4" />
                      {tt('Tambah Tahap')}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 pt-0">
                  {sedangTambahDisini ? (
                    <FormTahapKartu form={form} ubah={ubah} onSimpan={simpan} onBatal={batal} menyimpan={menyimpan} />
                  ) : null}

                  {daftar.length === 0 && !sedangTambahDisini ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">{tt('Belum ada tahap di kategori ini.')}</p>
                  ) : (
                    daftar.map((t) =>
                      sedangEdit === t.id ? (
                        <FormTahapKartu key={t.id} form={form} ubah={ubah} onSimpan={simpan} onBatal={batal} menyimpan={menyimpan} />
                      ) : (
                        <div key={t.id} className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-start">
                          <div className="shrink-0">
                            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 font-mono text-xs font-semibold text-foreground">
                              H+{t.hari_min}
                              {t.hari_min !== t.hari_max ? `..${t.hari_max}` : ''}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{t.label}</p>
                            <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{t.pesan_template}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5 sm:flex-col sm:items-end">
                            <button type="button" className="cursor-pointer" onClick={() => toggleAktif(t)}>
                              <Badge variant={t.aktif ? 'sukses' : 'netral'}>{t.aktif ? tt('Aktif') : tt('Nonaktif')}</Badge>
                            </button>
                            <div className="flex gap-1.5 whitespace-nowrap">
                              <Button variant="outline" size="sm" onClick={() => mulaiEdit(t)}>
                                {tt('Edit')}
                              </Button>
                              <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => hapus(t)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ),
                    )
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

interface FormTahapProps {
  form: FormTahap
  ubah: <K extends keyof FormTahap>(kunci: K, nilai: FormTahap[K]) => void
  onSimpan: () => void
  onBatal: () => void
  menyimpan: boolean
}

function FormTahapKartu({ form, ubah, onSimpan, onBatal, menyimpan }: FormTahapProps) {
  return (
    <div className="space-y-3 rounded-md border border-dashed border-primary/40 bg-primary/[0.03] p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">{tt('Kategori')}</Label>
          <Select value={form.kategori} onChange={(e) => ubah('kategori', e.target.value as KategoriTreatmentFu)}>
            {URUTAN_KATEGORI_TREATMENT.map((k) => (
              <option key={k} value={k}>
                {INFO_KATEGORI[k].label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{tt('Label')}</Label>
          <Input placeholder="mis. Sapa H+1" value={form.label} onChange={(e) => ubah('label', e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{tt('Hari minimum')}</Label>
          <Input type="number" min={0} value={form.hari_min} onChange={(e) => ubah('hari_min', Number(e.target.value))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{tt('Hari maksimum')}</Label>
          <Input type="number" min={0} value={form.hari_max} onChange={(e) => ubah('hari_max', Number(e.target.value))} />
        </div>
        <div className="space-y-1 sm:col-span-2 lg:col-span-3">
          <Label className="text-xs">{tt('Pesan WA')}</Label>
          <Textarea
            rows={3}
            placeholder="Gunakan {nama} untuk menyisipkan nama pembeli/pelanggan"
            value={form.pesan_template}
            onChange={(e) => ubah('pesan_template', e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 self-end pb-1.5 text-sm">
          <input type="checkbox" checked={form.aktif} onChange={(e) => ubah('aktif', e.target.checked)} className="h-4 w-4 rounded border-input" />
          {tt('Aktif')}
        </label>
      </div>
      <div className="flex justify-end gap-1.5">
        <Button variant="outline" size="sm" onClick={onBatal} disabled={menyimpan}>
          {tt('Batal')}
        </Button>
        <Button size="sm" onClick={onSimpan} disabled={menyimpan}>
          {menyimpan ? <Spinner className="h-3.5 w-3.5" /> : null}
          {tt('Simpan')}
        </Button>
      </div>
    </div>
  )
}
