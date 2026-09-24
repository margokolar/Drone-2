import clsx from 'clsx'
import type { MouseEvent } from 'react'
import { MetronomeIcon } from './MetronomeIcon'

type ClickSyncButtonProps = {
  enabled: boolean
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
  ariaLabel: string
  inactiveClassName?: string
  className?: string
  iconSize?: number
}

export function ClickSyncButton({
  enabled,
  onClick,
  ariaLabel,
  inactiveClassName,
  className,
  iconSize = 22,
}: ClickSyncButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'button-safe flex size-9 shrink-0 items-center justify-center rounded-lg border transition',
        enabled
          ? 'border-fuchsia-300/60 bg-fuchsia-300/20 text-fuchsia-100 hover:bg-fuchsia-300/30'
          : (inactiveClassName ??
            'border-white/10 bg-white/5 text-white/55 hover:bg-white/10'),
        className,
      )}
      aria-pressed={enabled}
      aria-label={ariaLabel}
    >
      <MetronomeIcon size={iconSize} />
    </button>
  )
}
