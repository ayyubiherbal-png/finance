import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { rupiah } from '@/lib/format'
import {
  Badge,
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
import type { VLimitKredit } from '@/types/db'

function usePelanggan(cari: string) {
  return useQuery({
    queryKey: ['pelanggan', cari],
    queryFn: async () => {
      // Filter (.or) harus dipasang sebelum .order/.limit.
      let q = supabase.from('v_limit_kredit').select('*')

      if (cari.trim()) {
        const pola = `%${cari.trim()}%`
        q = q.or(`nama.ilike.${pola},kode.ilike.${pola}`)
      }

      const { data, error } = await q.order('nama').limit(200).returns<VLimitKredit[]>()
      if (error) throw error
      return data ?? []
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

/** Pemakaian limit: aman < 75%, waspada 75-100%, terlampaui > 100% */
function statusLimit(p: VLimitKredit) {
  if (p.termin === 'cod' || p.limit_kredit <= 0) return null
  const persen = p.pemakaian_persen ?? 0
  if (persen > 100) return { label: 'Limit terlampaui', variant: 'bahaya' as const }
  if (persen >= 75) return { label: `${persen.toFixed(0)}% terpakai`, variant: 'peringatan' as const }
  return { label: `${persen.toFixed(0)}% terpakai`, variant: 'netral' as const }
}

export function Pelanggan() {
  const [cari, setCari] = useState('')
  const { data, isLoading, error, isFetching } = usePelanggan(cari)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Pelanggan</h1>
          <p className="text-sm text-muted-foreground">Termin, limit kredit, dan piutang berjalan</p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Cari nama atau kode..."
            value={cari}
            onChange={(e) => setCari(e.target.value)}
          />
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
                  <Th>Kode</Th>
                  <Th>Nama</Th>
                  <Th>Termin</Th>
                  <Th className="text-right">Limit kredit</Th>
                  <Th className="text-right">Piutang</Th>
                  <Th className="text-right">Sisa limit</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.map((p) => {
                  const status = statusLimit(p)
                  return (
                    <Tr key={p.pelanggan_id}>
                      <Td className="font-mono text-xs">{p.kode}</Td>
                      <Td className="font-medium">{p.nama}</Td>
                      <Td className="text-muted-foreground">
                        {p.termin === 'cod' ? 'COD' : `Tempo ${p.termin_hari} hari`}
                      </Td>
                      <Td className="tabular text-right">
                        {p.limit_kredit > 0 ? rupiah(p.limit_kredit) : '-'}
                      </Td>
                      <Td className="tabular text-right">{rupiah(p.piutang_berjalan)}</Td>
                      <Td
                        className={`tabular text-right ${p.sisa_limit < 0 ? 'text-destructive' : ''}`}
                      >
                        {p.limit_kredit > 0 ? rupiah(p.sisa_limit) : '-'}
                      </Td>
                      <Td className="text-right">
                        {status ? <Badge variant={status.variant}>{status.label}</Badge> : null}
                      </Td>
                    </Tr>
                  )
                })}
              </Tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
