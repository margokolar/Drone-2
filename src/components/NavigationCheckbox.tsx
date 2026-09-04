import clsx from 'clsx'
import { Check } from 'lucide-react'

type NavigationCheckboxProps = {
  checked: boolean
  onToggle: () => void
  buttonClassName: string
  accentColor: 'cyan' | 'fuchsia' | 'amber'
  ariaLabelWhenChecked: string
  ariaLabelWhenUnchecked: string
}

const accentCheckedClass = {
  cyan: 'border-cyan-300 bg-cyan-300',
  fuchsia: 'border-fuchsia-300 bg-fuchsia-300',
  amber: 'border-amber-300 bg-amber-300',
} as const

export function NavigationCheckbox({
  checked,
  onToggle,
  buttonClassName,
  accentColor,
  ariaLabelWhenChecked,
  ariaLabelWhenUnchecked,
}: NavigationCheckboxProps) {
  return (
    <button
      type="button"
      className={buttonClassName}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? ariaLabelWhenChecked : ariaLabelWhenUnchecked}
    >
      <span
        className={clsx(
          'flex h-4 w-4 items-center justify-center rounded-sm border transition',
          checked ? accentCheckedClass[accentColor] : 'border-white/45 bg-transparent',
          checked ? 'text-[#14202a]' : 'text-transparent',
        )}
        aria-hidden
      >
        <Check size={12} strokeWidth={3} />
      </span>
    </button>
  )
}
