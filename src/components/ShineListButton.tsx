import clsx from 'clsx'
import { Sparkles } from 'lucide-react'
import { useRef, type MouseEvent } from 'react'
import { METRONOME_LONG_PRESS_MS } from './ClickSyncButton'

type ShineListButtonProps = {
  enabled: boolean
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
  onLongPress?: () => void
  ariaLabel: string
  inactiveClassName?: string
}

export function ShineListButton({
  enabled,
  onClick,
  onLongPress,
  ariaLabel,
  inactiveClassName,
}: ShineListButtonProps) {
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
          ? 'border-cyan-300/60 bg-cyan-300/20 text-cyan-100 hover:bg-cyan-300/30'
          : (inactiveClassName ??
            'border-white/10 bg-white/5 text-white/55 hover:bg-white/10'),
      )}
      aria-pressed={enabled}
      aria-label={ariaLabel}
    >
      <Sparkles size={22} strokeWidth={2} aria-hidden />
    </button>
  )
}
