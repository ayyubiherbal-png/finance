import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { rupiah } from '@/lib/format'
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
import type { VSaldoKasBank } from '@/types/db'

const LABEL_JENIS = { kas: 'Kas', bank: 'Bank' }

function useSaldoKasBank(cari: string) {
  return useQuery({
    queryKey: ['akun-kas-bank', cari],
    queryFn: async () => {
      let q = supabase.from('v_saldo_kas_bank').select('*')
      if (cari.trim()) q = q.or(`nama.ilike.%${cari.trim()}%,kode.ilike.%${cari.trim()}%`)
      const { data, error } = await q.order('jenis').order('nama').returns<VSaldoKasBank[]>()
      if (error) throw error
      return data ?? []
    },
    placeholderData: (sebelumnya) => sebelumnya,
  })
}

export function AkunKasBank() {
  const [cari, setCari] = useState('')
  const { data, isLoading, error, isFetching } = useSaldoKasBank(cari)

  const totalSaldo = (data ?? []).filter((a) => a.aktif).reduce((t, a) => t + Number(a.saldo), 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Kas & Bank</h1>
          <p className="text-sm text-muted-foreground">
            Setiap Penerimaan Kas dan Pembayaran Supplier tertaut ke salah satu akun ini
          </p>
        </div>
        <div className="flex flex-1 justify-end gap-2 sm:flex-none">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Cari nama atau kode..." value={cari} onChange={(e) => setCari(e.target.value)} />
          </div>
          <Button asChild>
            <Link to="/kas-bank/baru">
              <Plus className="h-4 w-4" />
              Akun Baru
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
            <KondisiKosong pesan="Belum ada akun kas/bank. Tambahkan minimal satu supaya Penerimaan Kas & Pembayaran Supplier bisa dicatat." />
          ) : (
            <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
              <Thead>
                <Tr>
                  <Th>Kode</Th>
                  <Th>Nama</Th>
                  <Th>Jenis</Th>
                  <Th>No. rekening</Th>
                  <Th className="text-right">Saldo</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.map((a) => (
                  <Tr key={a.akun_id}>
                    <Td className="font-mono text-xs">{a.kode}</Td>
                    <Td>
                      <Link to={`/kas-bank/${a.akun_id}`} className="font-medium text-primary hover:underline">
                        {a.nama}
                      </Link>
                    </Td>
                    <Td className="text-muted-foreground">{LABEL_JENIS[a.jenis]}</Td>
                    <Td className="text-muted-foreground">{a.nomor_rekening ?? '-'}</Td>
                    <Td className={`tabular text-right font-semibold ${a.saldo < 0 ? 'text-destructive' : ''}`}>
                      {rupiah(a.saldo)}
                    </Td>
                    <Td className="text-right">{!a.aktif ? <Badge variant="netral">Nonaktif</Badge> : null}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      {data && data.length > 0 ? (
        <p className="text-right text-sm text-muted-foreground">
          Total saldo (akun aktif): <span className="tabular font-medium text-foreground">{rupiah(totalSaldo)}</span>
        </p>
      ) : null}
    </div>
  )
}
