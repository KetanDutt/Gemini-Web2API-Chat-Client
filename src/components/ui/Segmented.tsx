import { motion } from 'motion/react'
import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Segmented control with a sliding active pill (shared layoutId per instance). */
export function Segmented<T extends string>({ value, onChange, options, className, size = 'md', fullWidth }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; icon?: ReactNode }[]; className?: string; size?: 'sm' | 'md'; fullWidth?: boolean }) {
  const layoutId = useId()
  return (
    <div role="radiogroup" className={cn('inline-flex rounded-(--radius-pill) bg-surface p-1 shadow-[inset_0_0_0_1px_var(--line)]', fullWidth && 'flex w-full', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative flex items-center justify-center gap-1.5 rounded-(--radius-pill) px-3 font-medium transition-colors duration-(--duration-fast) active:scale-[0.98]',
              size === 'sm' ? 'h-7 text-xs' : 'h-8 text-[13px]',
              fullWidth && 'flex-1',
              active ? 'text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-(--radius-pill) bg-surface-3 shadow-(--shadow-sm) [box-shadow:inset_0_0_0_1px_var(--glass-edge),var(--shadow-sm)]"
                transition={{ type: 'spring', stiffness: 500, damping: 40, mass: 0.6 }}
              />
            )}
            <span className="relative z-1 flex items-center gap-1.5">
              {o.icon}
              {o.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
