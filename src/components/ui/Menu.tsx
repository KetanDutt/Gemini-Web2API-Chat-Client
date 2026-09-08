import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Floating glass menus — layer 4 (z-popover). Enter/exit: fade + scale + 4px translate. */
const surface = 'glass-float motion-pop z-(--z-popover) rounded-(--radius-lg) p-1.5 origin-(--radix-dropdown-menu-content-transform-origin)'

export const Menu = DropdownMenu.Root
export const MenuTrigger = DropdownMenu.Trigger
export const MenuSub = DropdownMenu.Sub
export const MenuSubTrigger = ({ children, className }: { children: ReactNode; className?: string }) => (
  <DropdownMenu.SubTrigger className={cn('menu-item justify-between', className)}>{children}</DropdownMenu.SubTrigger>
)
export const MenuSubContent = ({ children }: { children: ReactNode }) => (
  <DropdownMenu.Portal>
    <DropdownMenu.SubContent sideOffset={6} collisionPadding={8} className={cn(surface, 'min-w-40')}>
      {children}
    </DropdownMenu.SubContent>
  </DropdownMenu.Portal>
)

export function MenuContent({ children, align = 'end', side, className, sideOffset = 6 }: { children: ReactNode; align?: 'start' | 'center' | 'end'; side?: 'top' | 'bottom' | 'left' | 'right'; className?: string; sideOffset?: number }) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content align={align} side={side} sideOffset={sideOffset} collisionPadding={8} className={cn(surface, 'min-w-48', className)}>
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  )
}

export function MenuItem({ children, onSelect, icon, danger, shortcut, disabled, className }: { children: ReactNode; onSelect?: (e: Event) => void; icon?: ReactNode; danger?: boolean; shortcut?: string; disabled?: boolean; className?: string }) {
  return (
    <DropdownMenu.Item className={cn('menu-item', danger && 'danger', className)} onSelect={onSelect} disabled={disabled}>
      {icon && <span className="flex w-4 items-center justify-center text-fg-muted [.danger_&]:text-inherit">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <span className="kbd ml-3">{shortcut}</span>}
    </DropdownMenu.Item>
  )
}

export function MenuCheckItem({ children, checked, onCheckedChange, description }: { children: ReactNode; checked: boolean; onCheckedChange: (v: boolean) => void; description?: ReactNode }) {
  return (
    <DropdownMenu.CheckboxItem className="menu-item" checked={checked} onCheckedChange={onCheckedChange}>
      <span className="flex w-4 items-center justify-center">
        <Check size={14} className={cn('text-accent transition-[opacity,transform] duration-(--duration-fast) ease-(--ease-spring)', checked ? 'scale-100 opacity-100' : 'scale-50 opacity-0')} />
      </span>
      <span className="flex-1">
        <span className="block truncate">{children}</span>
        {description && <span className="block text-[11.5px] leading-snug text-fg-subtle">{description}</span>}
      </span>
    </DropdownMenu.CheckboxItem>
  )
}

export const MenuSeparator = () => <DropdownMenu.Separator className="menu-sep" />
export const MenuLabel = ({ children }: { children: ReactNode }) => <DropdownMenu.Label className="menu-label">{children}</DropdownMenu.Label>
