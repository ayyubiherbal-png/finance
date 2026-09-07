import { useId, useRef, useState } from 'react'
import { rupiah, tanggal } from '@/lib/format'

/**
 * Grafik & sparkline kecil, dibangun dari SVG polos (tanpa library) supaya
 * bundle tetap ringan. Mengikuti spesifikasi skill dataviz: garis 2px,
 * area wash ~10% opacity, gridline hairline, lapisan hover wajib untuk
 * grafik utama (bukan sparkline mini).
 */

/** Sparkline mini untuk kartu statistik -- tanpa sumbu, tanpa hover. */
export function Sparkline({
  data,
  warna = 'hsl(var(--primary))',
  lebar = 72,
  tinggi = 28,
}: {
  data: number[]
  warna?: string
  lebar?: number
  tinggi?: number
}) {
  if (data.length < 2) return null
  const maks = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const stepX = lebar / (data.length - 1)
  const skalaY = (v: number) => tinggi - 2 - ((v - min) / (maks - min || 1)) * (tinggi - 4)
  const path = data.map((v, i) => `${i === 0 ? 'M' : 'L'}${i * stepX},${skalaY(v)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${lebar} ${tinggi}`} width={lebar} height={tinggi} className="overflow-visible">
      <path d={path} fill="none" stroke={warna} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

interface TitikTren {
  tanggal: string
  nilai: number
}

/** Grafik area untuk tren harian, dengan crosshair + tooltip saat hover. */
export function GrafikArea({
  data,
  warna = 'hsl(var(--primary))',
  tinggi = 200,
}: {
  data: TitikTren[]
  warna?: string
  tinggi?: number
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const gradientId = useId()
  const lebar = 600
  const padAtas = 16
  const padBawah = 20

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height: tinggi }}>
        Belum ada data penjualan.
      </div>
    )
  }

  const nilaiMaks = Math.max(...data.map((d) => d.nilai), 1)
  const stepX = data.length > 1 ? lebar / (data.length - 1) : 0
  const skalaY = (v: number) => tinggi - padBawah - (v / nilaiMaks) * (tinggi - padAtas - padBawah)

  const titik = data.map((d, i) => ({ x: i * stepX, y: skalaY(d.nilai), ...d }))
  const garisPath = titik.map((t, i) => `${i === 0 ? 'M' : 'L'}${t.x},${t.y}`).join(' ')
  const titikAkhir = titik[titik.length - 1]!
  const titikAwal = titik[0]!
  const areaPath = `${garisPath} L${titikAkhir.x},${tinggi - padBawah} L${titikAwal.x},${tinggi - padBawah} Z`

  function padaGerak(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    const relX = (e.clientX - rect.left) / rect.width
    const idx = Math.round(relX * (data.length - 1))
    setHoverIdx(Math.max(0, Math.min(data.length - 1, idx)))
  }

  const aktif = hoverIdx !== null ? titik[hoverIdx] : null

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${lebar} ${tinggi}`}
        preserveAspectRatio="none"
        className="w-full cursor-crosshair"
        style={{ height: tinggi }}
        onMouseMove={padaGerak}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={warna} stopOpacity="0.14" />
            <stop offset="100%" stopColor={warna} stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={0}
            x2={lebar}
            y1={padAtas + f * (tinggi - padAtas - padBawah)}
            y2={padAtas + f * (tinggi - padAtas - padBawah)}
            stroke="hsl(var(--border))"
            strokeWidth={1}
          />
        ))}

        <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
        <path d={garisPath} fill="none" stroke={warna} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {aktif ? (
          <>
            <line x1={aktif.x} x2={aktif.x} y1={padAtas} y2={tinggi - padBawah} stroke="hsl(var(--border))" strokeWidth={1} />
            <circle cx={aktif.x} cy={aktif.y} r={4} fill={warna} stroke="hsl(var(--card))" strokeWidth={2} />
          </>
        ) : null}
      </svg>

      {aktif ? (
        <div
          className="pointer-events-none absolute top-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: `${(aktif.x / lebar) * 100}%`,
            transform: `translateX(${aktif.x < lebar / 2 ? '0' : '-100%'})`,
          }}
        >
          <p className="text-muted-foreground">{tanggal(aktif.tanggal)}</p>
          <p className="tabular font-semibold">{rupiah(aktif.nilai)}</p>
        </div>
      ) : null}
    </div>
  )
}

interface TitikBatang {
  label: string
  nilai: number
}

/**
 * Grafik batang untuk perbandingan antar-periode (mis. omzet per bulan/
 * kuartal/tahun di Laporan Omzet) -- beda dari GrafikArea yang untuk tren
 * harian kontinu. Label sumbu-X ditipiskan otomatis kalau batangnya banyak
 * (>12) supaya tidak numpuk.
 */
export function GrafikBatang({
  data,
  warna = 'hsl(var(--primary))',
  tinggi = 220,
}: {
  data: TitikBatang[]
  warna?: string
  tinggi?: number
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const lebar = 600
  const padAtas = 16
  const padBawah = 24

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height: tinggi }}>
        Belum ada data penjualan.
      </div>
    )
  }

  const nilaiMaks = Math.max(...data.map((d) => d.nilai), 1)
  const lebarSlot = lebar / data.length
  const lebarBatang = Math.min(lebarSlot * 0.6, 48)
  const skalaTinggi = (v: number) => (v / nilaiMaks) * (tinggi - padAtas - padBawah)
  const langkahLabel = Math.max(1, Math.ceil(data.length / 12))

  const aktif = hoverIdx !== null ? data[hoverIdx] : null

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${lebar} ${tinggi}`} preserveAspectRatio="none" className="w-full" style={{ height: tinggi }}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={0}
            x2={lebar}
            y1={padAtas + f * (tinggi - padAtas - padBawah)}
            y2={padAtas + f * (tinggi - padAtas - padBawah)}
            stroke="hsl(var(--border))"
            strokeWidth={1}
          />
        ))}
        {data.map((d, i) => {
          const tinggiBatang = Math.max(skalaTinggi(d.nilai), d.nilai > 0 ? 1 : 0)
          const x = i * lebarSlot + (lebarSlot - lebarBatang) / 2
          const y = tinggi - padBawah - tinggiBatang
          return (
            <g key={i} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)}>
              <rect x={i * lebarSlot} y={padAtas} width={lebarSlot} height={tinggi - padAtas - padBawah} fill="transparent" />
              <rect
                x={x}
                y={y}
                width={lebarBatang}
                height={tinggiBatang}
                rx={2}
                fill={warna}
                opacity={hoverIdx === null || hoverIdx === i ? 1 : 0.35}
              />
              {i % langkahLabel === 0 ? (
                <text x={i * lebarSlot + lebarSlot / 2} y={tinggi - 8} textAnchor="middle" fontSize={10} fill="hsl(var(--muted-foreground))">
                  {d.label}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>

      {aktif ? (
        <div
          className="pointer-events-none absolute top-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: `${((hoverIdx! + 0.5) / data.length) * 100}%`,
            transform: 'translateX(-50%)',
          }}
        >
          <p className="text-muted-foreground">{aktif.label}</p>
          <p className="tabular font-semibold">{rupiah(aktif.nilai)}</p>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Grafik batang kapsul (ujung membulat penuh) dengan tooltip permanen di
 * batang puncak -- gaya "Project Analytics" pada referensi tema baru
 * (2026-09-07). Beda dari GrafikBatang (dipakai Laporan Omzet, netral):
 * ini dipakai di Dasbor untuk kesan lebih hidup, hari kosong (nilai 0)
 * ditampilkan bermotif garis diagonal, bukan batang kosong polos.
 */
export function GrafikKapsul({ data, tinggi = 160 }: { data: TitikTren[]; tinggi?: number }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const patternId = useId()
  const lebar = 600
  const padAtas = 12
  const padBawah = 4

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height: tinggi }}>
        Belum ada data penjualan.
      </div>
    )
  }

  const nilaiMaks = Math.max(...data.map((d) => d.nilai), 1)
  const idxPuncak = data.reduce((m, d, i, arr) => (d.nilai > arr[m]!.nilai ? i : m), 0)
  const lebarSlot = lebar / data.length
  const lebarBatang = Math.max(Math.min(lebarSlot * 0.55, 16), 3)
  const tinggiArea = tinggi - padAtas - padBawah
  const skalaTinggi = (v: number) => (v / nilaiMaks) * tinggiArea

  const aktifIdx = hoverIdx ?? idxPuncak
  const aktif = data[aktifIdx]!

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${lebar} ${tinggi}`} preserveAspectRatio="none" className="w-full" style={{ height: tinggi }}>
        <defs>
          <pattern id={patternId} width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="5" stroke="hsl(var(--border))" strokeWidth="2.5" />
          </pattern>
        </defs>
        {data.map((d, i) => {
          const tinggiBatang = Math.max(skalaTinggi(d.nilai), 3)
          const x = i * lebarSlot + (lebarSlot - lebarBatang) / 2
          const y = tinggi - padBawah - tinggiBatang
          const disorot = i === aktifIdx
          const kosong = d.nilai <= 0
          return (
            <g key={i} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)} className="cursor-pointer">
              <rect x={i * lebarSlot} y={0} width={lebarSlot} height={tinggi} fill="transparent" />
              <rect
                x={x}
                y={y}
                width={lebarBatang}
                height={tinggiBatang}
                rx={lebarBatang / 2}
                fill={kosong ? `url(#${patternId})` : disorot ? 'hsl(var(--primary-soft))' : 'hsl(var(--primary-dark))'}
              />
            </g>
          )
        })}
      </svg>

      <div
        className="pointer-events-none absolute top-1 rounded-lg bg-primary-dark px-2.5 py-1.5 text-[11px] shadow-md"
        style={{
          left: `${((aktifIdx + 0.5) / data.length) * 100}%`,
          transform: `translateX(${aktifIdx < data.length / 2 ? '-10%' : '-90%'})`,
        }}
      >
        <p className="text-primary-dark-foreground/70">{tanggal(aktif.tanggal)}</p>
        <p className="tabular font-semibold text-primary-dark-foreground">{rupiah(aktif.nilai)}</p>
      </div>
    </div>
  )
}

/**
 * Donut/ring gauge tebal untuk satu metrik persentase -- gaya "Project
 * Progress" pada referensi. Dipakai di Dasbor untuk margin laba kotor.
 */
export function GrafikDonut({
  persen,
  warna = 'hsl(var(--primary))',
  ukuran = 132,
  tebal = 16,
}: {
  persen: number
  warna?: string
  ukuran?: number
  tebal?: number
}) {
  const jariJari = (ukuran - tebal) / 2
  const keliling = 2 * Math.PI * jariJari
  const persenAman = Math.max(0, Math.min(100, persen))
  const offset = keliling * (1 - persenAman / 100)

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: ukuran, height: ukuran }}>
      <svg width={ukuran} height={ukuran} viewBox={`0 0 ${ukuran} ${ukuran}`} className="-rotate-90">
        <circle cx={ukuran / 2} cy={ukuran / 2} r={jariJari} fill="none" stroke="hsl(var(--muted))" strokeWidth={tebal} />
        <circle
          cx={ukuran / 2}
          cy={ukuran / 2}
          r={jariJari}
          fill="none"
          stroke={warna}
          strokeWidth={tebal}
          strokeDasharray={keliling}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="tabular text-2xl font-bold">{persenAman.toFixed(0)}%</span>
      </div>
    </div>
  )
}
