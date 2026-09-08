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

const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

export function GlassDialog({ open, onOpenChange, title, description, children, className, hideClose, size = 'md' }: GlassDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/30 backdrop-blur-[6px] data-[state=open]:animate-fade-in dark:bg-black/50" />
        <DialogPrimitive.Content
          className={cn(
            'glass glass-4 fixed left-1/2 top-1/2 z-[90] flex max-h-[min(88dvh,860px)] w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[28px] outline-none data-[state=open]:animate-rise',
            sizes[size],
            className,
          )}
        >
          {(title || !hideClose) && (
            <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
              <div className="min-w-0">
                {title && <DialogPrimitive.Title className="text-[17px] font-semibold tracking-tight">{title}</DialogPrimitive.Title>}
                {description ? (
                  <DialogPrimitive.Description className="mt-0.5 text-[13px] text-fg-muted">{description}</DialogPrimitive.Description>
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
        <button className="btn-glass" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
        <button
          className={destructive ? 'btn-danger' : 'btn-primary'}
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
