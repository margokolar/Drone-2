import clsx from 'clsx'
import { useRef, type MouseEvent } from 'react'
import { MetronomeIcon } from './MetronomeIcon'

export const METRONOME_LONG_PRESS_MS = 800

type ClickSyncButtonProps = {
  enabled: boolean
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
  onLongPress?: () => void
  ariaLabel: string
  inactiveClassName?: string
  className?: string
  iconSize?: number
}

export function ClickSyncButton({
  enabled,
  onClick,
  onLongPress,
  ariaLabel,
  inactiveClassName,
  className,
  iconSize = 22,
}: ClickSyncButtonProps) {
  const longPressTimerRef = useRef<number | null>(null)
  const longPressFiredRef = useRef(false)

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  return (
    <button
      type="button"
      onPointerDown={() => {
        if (!onLongPress) {
          return
        }
        longPressFiredRef.current = false
        clearLongPressTimer()
        longPressTimerRef.current = window.setTimeout(() => {
          longPressTimerRef.current = null
          longPressFiredRef.current = true
          onLongPress()
        }, METRONOME_LONG_PRESS_MS)
      }}
      onPointerUp={clearLongPressTimer}
      onPointerLeave={clearLongPressTimer}
      onPointerCancel={clearLongPressTimer}
      onClick={(event) => {
        if (longPressFiredRef.current) {
          longPressFiredRef.current = false
          event.preventDefault()
          event.stopPropagation()
          return
        }
        onClick(event)
      }}
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
