import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { MoreVertical, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import { pesanKesalahan } from '@/lib/format'

/* ------------------------------------------------------------ Dwibahasa */

/**
 * Menerjemahkan children yang berupa teks biasa. Dipakai di komponen
 * bersama (Th, Label, Badge, Button, ...) supaya isi halaman ikut
 * dwibahasa TANPA perlu menyentuh ~700 tempat pemakaian di 40+ file.
 *
 * `React.Children.map` (bukan `.map` biasa) supaya key tiap anak tetap
 * ditangani React -- kalau pakai array.map, muncul peringatan key hilang.
 *
 * Yang BUKAN string (ikon, angka, elemen JSX) dibiarkan apa adanya. Td
 * SENGAJA tidak ikut: isinya data milik user (nama pelanggan, catatan),
 * bukan label aplikasi -- itu tidak boleh diterjemahkan.
 */
function useTeks() {
  const { tt } = useI18n()
  return (anak: React.ReactNode): React.ReactNode =>
    React.Children.map(anak, (c) => (typeof c === 'string' ? tt(c) : c))
}

/* ---------------------------------------------------------------- Button */

const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        // Tombol pill penuh -- dipakai selektif untuk CTA utama di header
        // halaman (mis. "SO Baru"), BUKAN untuk tombol aksi kompak di tabel
        // supaya tidak terkesan aneh pada tombol kecil/ikon.
        pill: 'rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
        'pill-outline': 'rounded-full border border-input bg-card shadow-sm hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    const teks = useTeks()
    const Comp = asChild ? Slot : 'button'
    // Dengan asChild, teksnya ada di DALAM elemen anak (biasanya <Link>),
    // bukan di children Button langsung -- jadi elemennya di-clone dengan
    // isi yang sudah diterjemahkan.
    const anak = children as React.ReactElement | React.ReactNode
    const isi =
      asChild && React.isValidElement(anak)
        ? React.cloneElement(anak, {}, teks(anak.props.children))
        : teks(children)
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {isi}
      </Comp>
    )
  },
)
Button.displayName = 'Button'

/* ----------------------------------------------------------- Input, Label */

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, placeholder, ...props }, ref) => {
    const { tt } = useI18n()
    return (
      <input
        ref={ref}
        placeholder={placeholder ? tt(placeholder) : placeholder}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    )
  },
)

/** Sama seperti Input, tapi multi-baris -- dipakai untuk teks bebas yang bisa lebih dari satu kalimat (mis. deskripsi Tiket). */
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, placeholder, ...props }, ref) => {
    const { tt } = useI18n()
    return (
      <textarea
        ref={ref}
        placeholder={placeholder ? tt(placeholder) : placeholder}
        className={cn(
          'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    )
  },
)
Textarea.displayName = 'Textarea'
Input.displayName = 'Input'

function formatRibuan(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString('id-ID') : ''
}

interface InputAngkaProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number
  onChange: (nilai: number) => void
}

/**
 * Input angka dengan pemisah ribuan ("1.000.000") supaya gampang dibaca
 * & kelihatan kalau salah ketik nolnya -- dipakai untuk field nominal
 * uang (harga, saldo, dsb.), bukan qty/persen/hari yang biasanya kecil.
 * Value asli tetap number biasa, cuma tampilannya yang diformat.
 */
export const InputAngka = React.forwardRef<HTMLInputElement, InputAngkaProps>(
  ({ value, onChange, className, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement>(null)
    React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement)

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const input = e.target
      const posisiKursor = input.selectionStart ?? input.value.length
      const digitSebelumKursor = (input.value.slice(0, posisiKursor).match(/\d/g) ?? []).length
      const angkaBersih = input.value.replace(/\D/g, '')
      const angka = angkaBersih ? Number(angkaBersih) : 0
      onChange(angka)

      // Kursor diposisikan ulang berdasarkan jumlah DIGIT (bukan karakter)
      // sebelum posisi semula, supaya titik pemisah yang baru muncul/hilang
      // tidak mendorong kursor ke tempat yang salah.
      requestAnimationFrame(() => {
        const elemen = innerRef.current
        if (!elemen) return
        const teksBaru = formatRibuan(angka)
        let posisi = 0
        let hitung = 0
        while (posisi < teksBaru.length && hitung < digitSebelumKursor) {
          if (/\d/.test(teksBaru.charAt(posisi))) hitung++
          posisi++
        }
        elemen.setSelectionRange(posisi, posisi)
      })
    }

    return (
      <Input
        ref={innerRef}
        inputMode="numeric"
        value={value === 0 ? '' : formatRibuan(value)}
        onChange={handleChange}
        className={cn('text-right tabular', className)}
        {...props}
      />
    )
  },
)
InputAngka.displayName = 'InputAngka'

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => {
  const teks = useTeks()
  // Isi dropdown ada di elemen <option>, bukan di children Select langsung --
  // jadi tiap option di-clone dengan label terjemahannya. React.Children.map
  // ikut meratakan array hasil .map() di halaman, jadi option yang dibuat
  // dari daftar (mis. daftar status) tetap kena.
  const opsi = React.Children.map(children, (c) =>
    React.isValidElement(c) && c.type === 'option' ? React.cloneElement(c, {}, teks(c.props.children)) : c,
  )
  return (
    <select
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {opsi}
    </select>
  )
})
Select.displayName = 'Select'

export function Label({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  const teks = useTeks()
  return (
    <label className={cn('text-sm font-medium leading-none text-foreground', className)} {...props}>
      {teks(children)}
    </label>
  )
}

/* ------------------------------------------------------------------ Card */

/**
 * Gaya kartu tema baru (2026-09-07): sudut lebih membulat, tanpa garis tepi,
 * dan bayangan lembut menyebar -- kesan "melayang" di atas latar abu-abu.
 * Diubah DI SINI supaya seluruh halaman ikut berubah sekaligus, bukan
 * ditempel satu-satu di tiap halaman.
 *
 * Sengaja TANPA `overflow-hidden`: dropdown Combobox di dalam form dirender
 * absolut di dalam Card, kalau di-clip malah tidak kelihatan.
 */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border-none bg-card text-card-foreground shadow-[0_2px_24px_-8px_rgba(0,0,0,0.12)]',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 p-4 pb-2', className)} {...props} />
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  const teks = useTeks()
  return (
    <h3 className={cn('font-semibold leading-tight tracking-tight', className)} {...props}>
      {teks(children)}
    </h3>
  )
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4 pt-2', className)} {...props} />
}

/* ----------------------------------------------------------------- Badge */

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/10 text-primary',
        netral: 'border-transparent bg-muted text-muted-foreground',
        sukses: 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
        peringatan: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
        bahaya: 'border-transparent bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export function Badge({
  className,
  variant,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  const teks = useTeks()
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {teks(children)}
    </span>
  )
}

/* ----------------------------------------------------------------- Table */

/**
 * Geser-dengan-mouse (klik tahan + tarik) untuk tabel lebar yang perlu
 * discroll ke samping. Bawaan browser cuma bisa discroll pakai scrollbar
 * bawah/shift+scroll wheel/trackpad -- mouse biasa tidak bisa "diseret"
 * di atas konten seperti touchscreen. User: "gak bisa di geser ke kanan
 * nih kalau pakai mouse".
 *
 * Dipasang di komponen bersama `Table` (bukan per halaman) supaya semua
 * tabel di aplikasi ikut kebagian sekali jalan. Elemen interaktif
 * (tombol/tautan/input/select) DIKECUALIKAN dari pemicu drag -- kalau
 * tidak, mengeklik tombol "Hapus" dkk. di dalam tabel bisa malah dianggap
 * awal drag dan klik-nya batal.
 */
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const seret = React.useRef({ aktif: false, mulaiX: 0, mulaiScroll: 0 })

  function mulaiSeret(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement
    if (target.closest('button, a, input, select, textarea, [contenteditable]')) return
    if (!scrollRef.current) return
    seret.current = { aktif: true, mulaiX: e.clientX, mulaiScroll: scrollRef.current.scrollLeft }
    e.preventDefault() // cegah teks ikut terseleksi biru saat menyeret
  }

  React.useEffect(() => {
    function gerak(e: MouseEvent) {
      if (!seret.current.aktif || !scrollRef.current) return
      scrollRef.current.scrollLeft = seret.current.mulaiScroll - (e.clientX - seret.current.mulaiX)
    }
    function lepas() {
      seret.current.aktif = false
    }
    window.addEventListener('mousemove', gerak)
    window.addEventListener('mouseup', lepas)
    return () => {
      window.removeEventListener('mousemove', gerak)
      window.removeEventListener('mouseup', lepas)
    }
  }, [])

  return (
    <div ref={scrollRef} onMouseDown={mulaiSeret} className="w-full cursor-grab overflow-x-auto active:cursor-grabbing">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
}

/**
 * Latar abu-abu kepala tabel dihapus (tema baru): tabel biasanya jadi elemen
 * paling atas di dalam Card, dan bidang abu-abu bersudut siku itu menonjol
 * keluar dari sudut membulat kartunya. Garis bawah saja sudah cukup memisah,
 * sekaligus lebih dekat ke gaya daftar di referensi.
 */
export function Thead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('border-b border-border', className)} {...props} />
}

export function Tbody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}

export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-b border-border hover:bg-muted/40', className)} {...props} />
}

export function Th({ className, children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  const teks = useTeks()
  return (
    <th
      className={cn(
        'h-9 px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground',
        className,
      )}
      {...props}
    >
      {teks(children)}
    </th>
  )
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2 align-middle', className)} {...props} />
}

/* --------------------------------------------------------- Status tampilan */

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary',
        className,
      )}
      role="status"
      aria-label="Memuat"
    />
  )
}

export function KondisiKosong({ pesan = 'Belum ada data.' }: { pesan?: string }) {
  const { tt } = useI18n()
  return <div className="px-3 py-10 text-center text-sm text-muted-foreground">{tt(pesan)}</div>
}

/**
 * Pesan errornya ikut diterjemahkan lewat `tt()` -- pesan buatan sendiri
 * (`new Error('Pilih pelanggan dulu.')` dkk. di ~20 halaman) ada di kamus
 * jadi ikut berganti bahasa, sementara pesan teknis dari Postgres/Supabase
 * (bahasa Inggris, tidak ada di kamus) aman lewat apa adanya karena `tt()`
 * mengembalikan teks aslinya kalau tidak ketemu.
 */
export function PesanError({ error }: { error: unknown }) {
  const { tt } = useI18n()
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {tt(pesanKesalahan(error))}
    </div>
  )
}

/* ------------------------------------------------------------- Menu aksi */

export interface MenuAksiItem {
  label: string
  onClick: () => void
  ikon?: LucideIcon
  bahaya?: boolean
}

/**
 * Tombol titik-tiga di baris tabel -- diklik memunculkan kotak pilihan
 * kecil (mis. "Ubah" / "Hapus") di bawahnya. Ditutup sendiri kalau
 * diklik di luar atau salah satu pilihannya dipilih.
 */
export function MenuAksi({ item }: { item: MenuAksiItem[] }) {
  const { tt } = useI18n()
  const [terbuka, setTerbuka] = React.useState(false)
  const kotakRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function onKlikLuar(e: MouseEvent) {
      if (kotakRef.current && !kotakRef.current.contains(e.target as Node)) setTerbuka(false)
    }
    document.addEventListener('mousedown', onKlikLuar)
    return () => document.removeEventListener('mousedown', onKlikLuar)
  }, [])

  return (
    <div ref={kotakRef} className="relative inline-block text-left">
      <Button variant="ghost" size="icon" onClick={() => setTerbuka((v) => !v)}>
        <MoreVertical className="h-4 w-4" />
      </Button>
      {terbuka ? (
        <div className="absolute right-0 top-full z-10 mt-1 min-w-[9rem] rounded-md border border-border bg-card p-1 shadow-md">
          {item.map((it, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setTerbuka(false)
                it.onClick()
              }}
              className={cn(
                'flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent',
                it.bahaya ? 'text-destructive' : 'text-foreground',
              )}
            >
              {it.ikon ? <it.ikon className="h-4 w-4" /> : null}
              {tt(it.label)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
