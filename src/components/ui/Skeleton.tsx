import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

/** Content-shaped placeholders. Calm sheen, no strobe. */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden className={cn('skeleton', className)} style={style} />
}

export function MessageSkeleton() {
  return (
    <div className="enter-fade space-y-2.5" role="status" aria-label="Loading messages">
      <Skeleton className="h-3.5 w-[70%]" />
      <Skeleton className="h-3.5 w-[92%]" />
      <Skeleton className="h-3.5 w-[55%]" />
    </div>
  )
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="enter-fade space-y-1.5 px-1" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 px-2.5 py-2">
          <Skeleton className="h-3.5" style={{ width: `${60 + ((i * 17) % 35)}%` }} />
        </div>
      ))}
    </div>
  )
}
