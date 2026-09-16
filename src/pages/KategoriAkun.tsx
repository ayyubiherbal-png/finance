import { useMemo, useState } from 'react'
import { tt } from '@/lib/i18nText'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { tanggalISO } from '@/lib/format'
import { ambilSemuaBertahap } from '@/lib/ambilSemua'
import { TombolEkspor } from '@/components/TombolEkspor'
import type { KolomEkspor } from '@/lib/eksporData'
import {
  BarisInfo,
  Badge,
  Button,
  Card,
  CardContent,
  DaftarMobile,
  Input,
  KartuBaris,
  KondisiKosong,
  PesanError,
  Spinner,
  TabelDesktop,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui'
import type { AkunCoa } from '@/types/db'

const LABEL_TIPE: Record<AkunCoa['tipe'], string> = {
  aset: 'Aset',
  liabilitas: 'Liabilitas',
  ekuitas: 'Ekuitas',
  pendapatan: 'Pendapatan',
  beban: 'Beban',
}

const URUTAN_TIPE: AkunCoa['tipe'][] = ['aset', 'liabilitas', 'ekuitas', 'pendapatan', 'beban']

function useAkunCoa() {
  return useQuery({
    queryKey: ['akun-coa-list'],
    queryFn: async () =>
      ambilSemuaBertahap<AkunCoa>((dari, sampai) =>
        supabase.from('akun_coa').select('*').order('kode').range(dari, sampai).returns<AkunCoa[]>(),
      ),
  })
}

const KOLOM_EKSPOR: KolomEkspor<AkunCoa>[] = [
  { header: 'Kode', nilai: (r) => r.kode },
  { header: 'Nama', nilai: (r) => r.nama },
  { header: 'Tipe', nilai: (r) => LABEL_TIPE[r.tipe] },
  { header: 'Saldo Normal', nilai: (r) => (r.saldo_normal === 'debit' ? 'Debit' : 'Kredit') },
  { header: 'Aktif', nilai: (r) => (r.aktif ? 'Ya' : 'Tidak') },
]

export function KategoriAkun() {
  const [cari, setCari] = useState('')
  const { data, isLoading, error } = useAkunCoa()

  const petaIndukNama = useMemo(() => {
    const peta = new Map<string, string>()
    for (const a of data ?? []) peta.set(a.id, a.nama)
    return peta
  }, [data])

  const pola = cari.trim().toLowerCase()
  const tersaring = (data ?? []).filter(
    (a) => !pola || a.kode.toLowerCase().includes(pola) || a.nama.toLowerCase().includes(pola),
  )
  const perTipe = useMemo(() => {
    const peta = new Map<AkunCoa['tipe'], AkunCoa[]>()
    for (const a of tersaring) {
      const arr = peta.get(a.tipe) ?? []
      arr.push(a)
      peta.set(a.tipe, arr)
    }
    return peta
  }, [tersaring])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('Kategori Akun (COA)')}</h1>
          <p className="text-sm text-muted-foreground">
            {tt('Chart of Accounts -- dipakai Jurnal Umum untuk posting otomatis tiap transaksi keuangan')}
          </p>
        </div>
        <div className="flex flex-1 flex-wrap justify-end gap-2 sm:flex-none">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder={tt('Cari kode atau nama akun...')} value={cari} onChange={(e) => setCari(e.target.value)} />
          </div>
          {data && data.length > 0 ? (
            <TombolEkspor
              ambilData={async () => tersaring}
              kolom={KOLOM_EKSPOR}
              opsi={{ namaFile: `kategori-akun-${tanggalISO()}`, judul: tt('Kategori Akun (COA)') }}
            />
          ) : null}
          <Button variant="pill" asChild>
            <Link to="/kategori-akun/baru">
              <Plus className="h-4 w-4" />
              {tt('Akun Baru')}
            </Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : error ? (
        <PesanError error={error} />
      ) : tersaring.length === 0 ? (
        <Card>
          <CardContent className="p-4">
            <KondisiKosong pesan={tt('Belum ada akun.')} />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {URUTAN_TIPE.filter((t) => (perTipe.get(t) ?? []).length > 0).map((tipe) => (
            <div key={tipe} className="space-y-2">
              <h2 className="text-base font-semibold">{LABEL_TIPE[tipe]}</h2>
              <Card>
                <CardContent className="p-0 pb-2">
                  <TabelDesktop>
                    <Table>
                      <Thead>
                        <Tr>
                          <Th>Kode</Th>
                          <Th>Nama</Th>
                          <Th>Induk</Th>
                          <Th>Saldo Normal</Th>
                          <Th></Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {(perTipe.get(tipe) ?? []).map((a) => (
                          <Tr key={a.id}>
                            <Td className="font-mono text-xs">{a.kode}</Td>
                            <Td>
                              <Link to={`/kategori-akun/${a.id}`} className="font-medium text-primary hover:underline">
                                {a.nama}
                              </Link>
                            </Td>
                            <Td className="text-muted-foreground">{a.induk_id ? petaIndukNama.get(a.induk_id) ?? '-' : '-'}</Td>
                            <Td>{a.saldo_normal === 'debit' ? tt('Debit') : tt('Kredit')}</Td>
                            <Td className="text-right">{!a.aktif ? <Badge variant="netral">Nonaktif</Badge> : null}</Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </TabelDesktop>
                  <DaftarMobile>
                    {(perTipe.get(tipe) ?? []).map((a) => (
                      <KartuBaris key={a.id}>
                        <div className="flex items-center justify-between gap-2">
                          <Link to={`/kategori-akun/${a.id}`} className="font-medium text-primary hover:underline">
                            {a.nama}
                          </Link>
                          {!a.aktif ? <Badge variant="netral">Nonaktif</Badge> : null}
                        </div>
                        <BarisInfo label="Kode" value={<span className="font-mono text-xs">{a.kode}</span>} />
                        <BarisInfo label="Induk" value={a.induk_id ? petaIndukNama.get(a.induk_id) ?? '-' : '-'} />
                        <BarisInfo label="Saldo Normal" value={a.saldo_normal === 'debit' ? tt('Debit') : tt('Kredit')} />
                      </KartuBaris>
                    ))}
                  </DaftarMobile>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
