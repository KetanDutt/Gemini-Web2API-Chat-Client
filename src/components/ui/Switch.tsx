import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

export function Switch({ checked, onCheckedChange, disabled, id, 'aria-label': ariaLabel }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; id?: string; 'aria-label'?: string }) {
  return (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
      aria-label={ariaLabel}
      className={cn(
        'relative h-[26px] w-[44px] shrink-0 rounded-(--radius-pill) transition-[background-color,box-shadow] duration-(--duration-base) ease-(--ease-standard) disabled:opacity-40 active:[&>span]:w-[26px]',
        checked ? 'bg-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]' : 'bg-surface-2 shadow-[inset_0_0_0_1px_var(--line-strong)]',
      )}
    >
      <SwitchPrimitive.Thumb className="block h-[22px] w-[22px] translate-x-[2px] rounded-(--radius-pill) bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2),0_2px_6px_rgba(0,0,0,0.12)] transition-[transform,width] duration-(--duration-base) ease-(--ease-spring) data-[state=checked]:translate-x-[20px] active:data-[state=checked]:translate-x-[16px]" />
    </SwitchPrimitive.Root>
  )
}
