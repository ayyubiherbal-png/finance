import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Columns3, Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { tanggal as fmtTanggal } from '@/lib/format'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  KondisiKosong,
  PesanError,
  Spinner,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui'
import type { SumberPelanggan, TipePelanggan, VPelangganRingkas } from '@/types/db'

function usePelanggan(cari: string) {
  return useQuery({
    queryKey: ['pelanggan', cari],
    queryFn: async () => {
      // Filter (.or) harus dipasang sebelum .order/.limit.
      let q = supabase.from('v_pelanggan_ringkas').select('*')

      if (cari.trim()) {
        const pola = `%${cari.trim()}%`
        q = q.or(`nama.ilike.${pola},kode.ilike.${pola}`)
      }

      const { data, error } = await q.order('nama').limit(200).returns<VPelangganRingkas[]>()
      if (error) throw error
      return data ?? []
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

const LABEL_TIPE: Record<TipePelanggan, string> = {
  customer: 'Customer',
  mitra: 'Mitra',
  horeka: 'Horeka',
  perusahaan: 'Perusahaan',
}

const LABEL_SUMBER: Record<SumberPelanggan, string> = {
  relasi: 'Relasi',
  sosmed: 'Sosmed',
  shopee: 'Shopee',
  tiktok: 'TikTok',
  website: 'Website',
  custom: 'Custom',
}

function labelSumber(p: VPelangganRingkas) {
  if (!p.sumber) return '-'
  if (p.sumber === 'custom') return p.sumber_custom || 'Custom'
  return LABEL_SUMBER[p.sumber]
}

// Kolom di luar ID/Nama/Tipe (selalu tampil) -- banyak yang sering kosong
// (mis. Kontak/Telepon cuma dipakai Horeka/Perusahaan), jadi biar user yang
// pilih sendiri mana yang mau ditampilkan lewat KolomPicker di bawah.
type KunciKolom = 'kontak_nama' | 'sales_nama' | 'telepon' | 'whatsapp' | 'email' | 'sumber' | 'tanggal_lahir' | 'sosial_media' | 'alamat_lengkap'

const KOLOM_OPSIONAL: { kunci: KunciKolom; label: string }[] = [
  { kunci: 'kontak_nama', label: 'Kontak' },
  { kunci: 'sales_nama', label: 'Sales' },
  { kunci: 'telepon', label: 'Telepon' },
  { kunci: 'whatsapp', label: 'WhatsApp' },
  { kunci: 'email', label: 'Email' },
  { kunci: 'sumber', label: 'Sumber' },
  { kunci: 'tanggal_lahir', label: 'Tanggal lahir' },
  { kunci: 'sosial_media', label: 'Media sosial' },
  { kunci: 'alamat_lengkap', label: 'Alamat' },
]

const DEFAULT_KOLOM: KunciKolom[] = ['whatsapp', 'sumber', 'alamat_lengkap']
const KUNCI_PENYIMPANAN = 'ayyubi-pelanggan-kolom'

function muatKolomAktif(): Set<KunciKolom> {
  try {
    const tersimpan = localStorage.getItem(KUNCI_PENYIMPANAN)
    if (!tersimpan) return new Set(DEFAULT_KOLOM)
    const daftar: string[] = JSON.parse(tersimpan)
    return new Set(daftar.filter((k): k is KunciKolom => KOLOM_OPSIONAL.some((o) => o.kunci === k)))
  } catch {
    return new Set(DEFAULT_KOLOM)
  }
}

function KolomPicker({ aktif, onUbah }: { aktif: Set<KunciKolom>; onUbah: (kunci: KunciKolom, tampil: boolean) => void }) {
  const [terbuka, setTerbuka] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKlikLuar(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setTerbuka(false)
    }
    document.addEventListener('mousedown', onKlikLuar)
    return () => document.removeEventListener('mousedown', onKlikLuar)
  }, [])

  return (
    <div ref={boxRef} className="relative">
      <Button variant="outline" onClick={() => setTerbuka((v) => !v)}>
        <Columns3 className="h-4 w-4" />
        Kolom
      </Button>
      {terbuka ? (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-border bg-card p-1 shadow-md">
          {KOLOM_OPSIONAL.map((k) => (
            <label
              key={k.kunci}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={aktif.has(k.kunci)}
                onChange={(e) => onUbah(k.kunci, e.target.checked)}
              />
              {k.label}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function Pelanggan() {
  const [cari, setCari] = useState('')
  const { data, isLoading, error, isFetching } = usePelanggan(cari)
  const [kolomAktif, setKolomAktif] = useState<Set<KunciKolom>>(muatKolomAktif)

  function ubahKolom(kunci: KunciKolom, tampil: boolean) {
    setKolomAktif((lama) => {
      const baru = new Set(lama)
      if (tampil) baru.add(kunci)
      else baru.delete(kunci)
      try {
        localStorage.setItem(KUNCI_PENYIMPANAN, JSON.stringify([...baru]))
      } catch {
        // localStorage bisa gagal (private mode dll.) -- abaikan, cukup state di memori.
      }
      return baru
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Pelanggan</h1>
          <p className="text-sm text-muted-foreground">Data master -- piutang berjalan ada di Laporan Piutang</p>
        </div>

        <div className="flex flex-1 flex-wrap justify-end gap-2 sm:flex-none">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Cari nama atau kode..."
              value={cari}
              onChange={(e) => setCari(e.target.value)}
            />
          </div>
          <KolomPicker aktif={kolomAktif} onUbah={ubahKolom} />
          <Button asChild>
            <Link to="/pelanggan/baru">
              <Plus className="h-4 w-4" />
              Pelanggan Baru
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 pb-2">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Spinner className="h-6 w-6" />
            </div>
          ) : error ? (
            <div className="p-4">
              <PesanError error={error} />
            </div>
          ) : !data || data.length === 0 ? (
            <KondisiKosong pesan="Belum ada pelanggan." />
          ) : (
            <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
              <Thead>
                <Tr>
                  <Th>ID</Th>
                  <Th>Nama</Th>
                  <Th>Tipe</Th>
                  {kolomAktif.has('kontak_nama') ? <Th>Kontak</Th> : null}
                  {kolomAktif.has('sales_nama') ? <Th>Sales</Th> : null}
                  {kolomAktif.has('telepon') ? <Th>Telepon</Th> : null}
                  {kolomAktif.has('whatsapp') ? <Th>WhatsApp</Th> : null}
                  {kolomAktif.has('email') ? <Th>Email</Th> : null}
                  {kolomAktif.has('sumber') ? <Th>Sumber</Th> : null}
                  {kolomAktif.has('tanggal_lahir') ? <Th>Tanggal lahir</Th> : null}
                  {kolomAktif.has('sosial_media') ? <Th>Media sosial</Th> : null}
                  {kolomAktif.has('alamat_lengkap') ? <Th>Alamat</Th> : null}
                </Tr>
              </Thead>
              <Tbody>
                {data.map((p) => (
                  <Tr key={p.pelanggan_id}>
                    <Td className="font-mono text-xs">{p.kode}</Td>
                    <Td className="font-medium">
                      <Link to={`/pelanggan/${p.pelanggan_id}`} className="text-primary hover:underline">
                        {p.nama}
                      </Link>
                    </Td>
                    <Td>
                      <Badge variant="netral">{LABEL_TIPE[p.tipe]}</Badge>
                    </Td>
                    {kolomAktif.has('kontak_nama') ? <Td className="text-muted-foreground">{p.kontak_nama || '-'}</Td> : null}
                    {kolomAktif.has('sales_nama') ? <Td className="text-muted-foreground">{p.sales_nama || '-'}</Td> : null}
                    {kolomAktif.has('telepon') ? <Td className="text-muted-foreground">{p.telepon || '-'}</Td> : null}
                    {kolomAktif.has('whatsapp') ? <Td className="text-muted-foreground">{p.whatsapp || '-'}</Td> : null}
                    {kolomAktif.has('email') ? <Td className="text-muted-foreground">{p.email || '-'}</Td> : null}
                    {kolomAktif.has('sumber') ? <Td className="text-muted-foreground">{labelSumber(p)}</Td> : null}
                    {kolomAktif.has('tanggal_lahir') ? (
                      <Td className="text-muted-foreground">{p.tanggal_lahir ? fmtTanggal(p.tanggal_lahir) : '-'}</Td>
                    ) : null}
                    {kolomAktif.has('sosial_media') ? <Td className="text-muted-foreground">{p.sosial_media || '-'}</Td> : null}
                    {kolomAktif.has('alamat_lengkap') ? (
                      <Td className="max-w-xs truncate text-muted-foreground" title={p.alamat_lengkap ?? undefined}>
                        {p.alamat_lengkap || '-'}
                      </Td>
                    ) : null}
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
