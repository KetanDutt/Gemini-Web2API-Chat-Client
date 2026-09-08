import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

export const TooltipProvider = TooltipPrimitive.Provider

/** Tooltips share the floating material but stay flat (no outer shadow) so they read as labels, not panels. */
export function Tooltip({ content, children, side = 'top', shortcut }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right'; shortcut?: string }) {
  return (
    <TooltipPrimitive.Root delayDuration={450}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="glass-float motion-pop z-(--z-toast) flex select-none items-center gap-2 rounded-(--radius-sm) px-2.5 py-1.5 text-xs font-medium text-fg shadow-(--shadow-md) origin-(--radix-tooltip-content-transform-origin)"
        >
          {content}
          {shortcut && <span className="kbd">{shortcut}</span>}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
