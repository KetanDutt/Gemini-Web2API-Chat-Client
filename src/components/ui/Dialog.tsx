import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface GlassDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  className?: string
  hideClose?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizes = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }

/**
 * Elevated glass dialog. Layer 5 (z-dialog).
 * Enter: overlay fades, panel rises 12px + scales 0.96→1 (motion-dialog).
 * Exit: same, reversed and faster. Both honour prefers-reduced-motion.
 */
export function GlassDialog({ open, onOpenChange, title, description, children, className, hideClose, size = 'md' }: GlassDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="motion-fade fixed inset-0 z-(--z-dialog) bg-(--scrim) backdrop-blur-[3px]" />
        <DialogPrimitive.Content
          className={cn(
            'glass-lg motion-dialog fixed left-1/2 top-1/2 z-(--z-dialog) flex max-h-[min(88dvh,860px)] w-[calc(100vw-20px)] flex-col overflow-hidden rounded-(--radius-2xl) outline-none',
            sizes[size],
            className,
          )}
        >
          {(title || !hideClose) && (
            <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
              <div className="min-w-0">
                {title && <DialogPrimitive.Title className="text-[17px] font-semibold tracking-tight">{title}</DialogPrimitive.Title>}
                {description ? (
                  <DialogPrimitive.Description className="mt-0.5 text-[13px] leading-snug text-fg-muted">{description}</DialogPrimitive.Description>
                ) : (
                  <DialogPrimitive.Description className="sr-only">Dialog</DialogPrimitive.Description>
                )}
              </div>
              {!hideClose && (
                <DialogPrimitive.Close className="icon-btn icon-btn-sm -mr-2 -mt-1" aria-label="Close">
                  <X size={16} />
                </DialogPrimitive.Close>
              )}
            </div>
          )}
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Delete',
  destructive = true,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description?: ReactNode
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => void | Promise<void>
}) {
  return (
    <GlassDialog open={open} onOpenChange={onOpenChange} title={title} description={description} size="sm" hideClose>
      <div className="flex justify-end gap-2 px-6 pb-5 pt-2">
        <button className="btn btn-secondary" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
        <button
          className={cn('btn', destructive ? 'btn-danger' : 'btn-primary')}
          onClick={async () => {
            await onConfirm()
            onOpenChange(false)
          }}
          autoFocus
        >
          {confirmLabel}
        </button>
      </div>
    </GlassDialog>
  )
}
