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
        'relative h-[26px] w-[44px] shrink-0 rounded-full border transition-colors duration-200 disabled:opacity-40',
        checked ? 'border-transparent bg-[linear-gradient(135deg,#5b73ff,#7a5cff)]' : 'border-line-strong bg-surface-2',
      )}
    >
      <SwitchPrimitive.Thumb className="block h-[22px] w-[22px] translate-x-[1px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-transform duration-200 ease-spring data-[state=checked]:translate-x-[19px]" />
    </SwitchPrimitive.Root>
  )
}
