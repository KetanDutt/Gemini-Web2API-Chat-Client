import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Icon · title · one short line · at most one action. */
export function EmptyState({ icon, title, description, action, className, compact }: { icon: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string; compact?: boolean }) {
  return (
    <div className={cn('enter-rise flex flex-col items-center justify-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14', className)}>
      <div
        className={cn(
          'mb-3 flex items-center justify-center rounded-(--radius-lg) bg-surface text-fg-muted shadow-[inset_0_0_0_1px_var(--line)]',
          compact ? 'h-10 w-10 rounded-(--radius-md)' : 'h-14 w-14',
        )}
      >
        {icon}
      </div>
      <h3 className={cn('font-semibold tracking-tight', compact ? 'text-[14px]' : 'text-[16px]')}>{title}</h3>
      {description && <p className={cn('mt-1 max-w-xs text-fg-muted', compact ? 'text-[12.5px]' : 'text-[13.5px]')}>{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
