import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function FieldRow({ label, description, children, htmlFor, className, vertical }: { label: ReactNode; description?: ReactNode; children: ReactNode; htmlFor?: string; className?: string; vertical?: boolean }) {
  return (
    <div className={cn('flex gap-x-4 gap-y-2.5 py-3', vertical ? 'flex-col' : 'flex-wrap items-center justify-between', className)}>
      <div className={cn('min-w-0', !vertical && 'flex-1 basis-[220px]')}>
        <label htmlFor={htmlFor} className="block text-[14px] font-medium">
          {label}
        </label>
        {description && <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-muted">{description}</p>}
      </div>
      <div className={cn('shrink-0', vertical ? 'w-full' : 'ml-auto')}>{children}</div>
    </div>
  )
}

export function Section({ title, description, children, className }: { title: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('mb-7', className)}>
      <h3 className="eyebrow px-1">{title}</h3>
      {description && <p className="mt-1 px-1 text-[13px] text-fg-muted">{description}</p>}
      <div className="group-panel mt-2 divide-y divide-line px-4">{children}</div>
    </section>
  )
}
