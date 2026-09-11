import { useState } from 'react'
import { tt } from '@/lib/i18nText'
import { Input, Select } from '@/components/ui'
import { tanggalISO } from '@/lib/format'

export interface RentangTanggal {
  dari: string | null
  sampai: string | null
}

export const RENTANG_KOSONG: RentangTanggal = { dari: null, sampai: null }

type PresetPeriode = 'semua' | 'hari_ini' | 'kemarin' | 'minggu_ini' | 'minggu_lalu' | 'bulan_ini' | 'bulan_lalu' | 'custom'

const LABEL_PRESET: Record<PresetPeriode, string> = {
  semua: 'Semua tanggal',
  hari_ini: 'Hari ini',
  kemarin: 'Kemarin',
  minggu_ini: 'Minggu ini',
  minggu_lalu: 'Minggu lalu',
  bulan_ini: 'Bulan ini',
  bulan_lalu: 'Bulan lalu',
  custom: 'Tanggal custom...',
}

/** Senin sebagai awal minggu (konvensi kalender Indonesia). */
function awalMinggu(d: Date): Date {
  const x = new Date(d)
  const hari = x.getDay() // 0=Minggu .. 6=Sabtu
  const geser = hari === 0 ? -6 : 1 - hari
  x.setDate(x.getDate() + geser)
  return x
}

function tambahHari(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/**
 * Menghitung rentang tanggal dari satu preset. Dipisah dari komponennya
 * supaya bisa dipakai di tempat lain (mis. Laporan Omzet) tanpa perlu
 * merender UI-nya.
 */
export function rentangDariPreset(preset: PresetPeriode): RentangTanggal {
  const sekarang = new Date()
  switch (preset) {
    case 'hari_ini':
      return { dari: tanggalISO(sekarang), sampai: tanggalISO(sekarang) }
    case 'kemarin': {
      const k = tambahHari(sekarang, -1)
      return { dari: tanggalISO(k), sampai: tanggalISO(k) }
    }
    case 'minggu_ini': {
      const awal = awalMinggu(sekarang)
      return { dari: tanggalISO(awal), sampai: tanggalISO(tambahHari(awal, 6)) }
    }
    case 'minggu_lalu': {
      const awal = tambahHari(awalMinggu(sekarang), -7)
      return { dari: tanggalISO(awal), sampai: tanggalISO(tambahHari(awal, 6)) }
    }
    case 'bulan_ini': {
      const awal = new Date(sekarang.getFullYear(), sekarang.getMonth(), 1)
      const akhir = new Date(sekarang.getFullYear(), sekarang.getMonth() + 1, 0)
      return { dari: tanggalISO(awal), sampai: tanggalISO(akhir) }
    }
    case 'bulan_lalu': {
      const awal = new Date(sekarang.getFullYear(), sekarang.getMonth() - 1, 1)
      const akhir = new Date(sekarang.getFullYear(), sekarang.getMonth(), 0)
      return { dari: tanggalISO(awal), sampai: tanggalISO(akhir) }
    }
    default:
      return RENTANG_KOSONG
  }
}

/**
 * Dropdown preset periode (Hari ini/Kemarin/Minggu/Bulan) + rentang
 * tanggal custom -- dipakai seragam di semua daftar transaksi Penjualan
 * & Pengiriman. Kalau perlu rentang di layar lain tanpa dropdown-nya
 * (mis. laporan yang grouping-nya sendiri), pakai `rentangDariPreset`.
 */
export function FilterPeriode({
  onChange,
  presetAwal = 'semua',
}: {
  onChange: (r: RentangTanggal) => void
  /** Preset saat halaman pertama dibuka -- default 'semua' (perilaku lama, tidak berubah untuk pemanggil lain). */
  presetAwal?: PresetPeriode
}) {
  const [preset, setPreset] = useState<PresetPeriode>(presetAwal)
  const [dariCustom, setDariCustom] = useState('')
  const [sampaiCustom, setSampaiCustom] = useState('')

  function ubahPreset(p: PresetPeriode) {
    setPreset(p)
    onChange(p === 'custom' ? { dari: dariCustom || null, sampai: sampaiCustom || null } : rentangDariPreset(p))
  }
  function ubahDariCustom(v: string) {
    setDariCustom(v)
    onChange({ dari: v || null, sampai: sampaiCustom || null })
  }
  function ubahSampaiCustom(v: string) {
    setSampaiCustom(v)
    onChange({ dari: dariCustom || null, sampai: v || null })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select className="w-full sm:w-44" value={preset} onChange={(e) => ubahPreset(e.target.value as PresetPeriode)}>
        {Object.entries(LABEL_PRESET).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Select>
      {preset === 'custom' ? (
        <>
          <Input type="date" className="w-full sm:w-40" value={dariCustom} onChange={(e) => ubahDariCustom(e.target.value)} />
          <span className="text-sm text-muted-foreground">{tt('s/d')}</span>
          <Input type="date" className="w-full sm:w-40" value={sampaiCustom} onChange={(e) => ubahSampaiCustom(e.target.value)} />
        </>
      ) : null}
    </div>
  )
}
