import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export function Segmented<T extends string>({ value, onChange, options, className, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; icon?: ReactNode }[]; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div role="radiogroup" className={cn('inline-flex rounded-full border border-line bg-surface p-1', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 font-medium transition-all duration-200',
              size === 'sm' ? 'h-7 text-xs' : 'h-8 text-[13px]',
              active ? 'bg-surface-3 text-fg shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-fg-muted hover:text-fg',
            )}
          >
            {o.icon}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
