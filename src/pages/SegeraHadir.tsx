import { Construction } from 'lucide-react'
import { Card, CardContent } from '@/components/ui'

/**
 * Placeholder jujur untuk menu yang sudah ada di rancangan tapi
 * layarnya belum dibangun. Skema database-nya sudah siap.
 */
export function SegeraHadir({ judul, catatan }: { judul: string; catatan?: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{judul}</h1>
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
          <Construction className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Layar ini belum dibangun</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {catatan ?? 'Tabel dan trigger di database sudah siap; tinggal antarmukanya.'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
