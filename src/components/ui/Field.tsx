import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function FieldRow({ label, description, children, htmlFor, className, vertical }: { label: ReactNode; description?: ReactNode; children: ReactNode; htmlFor?: string; className?: string; vertical?: boolean }) {
  return (
    <div className={cn('flex gap-4 py-3', vertical ? 'flex-col' : 'items-center justify-between', className)}>
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-[14px] font-medium">
          {label}
        </label>
        {description && <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-muted">{description}</p>}
      </div>
      <div className={cn('shrink-0', vertical && 'w-full')}>{children}</div>
    </div>
  )
}

export function Section({ title, description, children, className }: { title: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('mb-7', className)}>
      <h3 className="text-[12px] font-semibold uppercase tracking-wider text-fg-subtle">{title}</h3>
      {description && <p className="mt-1 text-[13px] text-fg-muted">{description}</p>}
      <div className="mt-2 divide-y divide-line rounded-[20px] border border-line bg-surface px-4">{children}</div>
    </section>
  )
}
