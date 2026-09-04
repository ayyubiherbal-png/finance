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
