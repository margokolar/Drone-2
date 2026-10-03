import clsx from 'clsx'
import { Repeat } from 'lucide-react'
import { useRef, type MouseEvent } from 'react'
import { loopSlotLabel, type LoopSlot } from '../audio/loopSlots'
import { METRONOME_LONG_PRESS_MS } from './ClickSyncButton'

type LoopSyncButtonProps = {
  enabled: boolean
  slot?: LoopSlot | null
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
  onLongPress?: () => void
  ariaLabel: string
  inactiveClassName?: string
  className?: string
  iconSize?: number
}

export function LoopSyncButton({
  enabled,
  slot = null,
  onClick,
  onLongPress,
  ariaLabel,
  inactiveClassName,
  className,
  iconSize = 22,
}: LoopSyncButtonProps) {
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
          ? 'border-emerald-300/60 bg-emerald-300/20 text-emerald-100 hover:bg-emerald-300/30'
          : (inactiveClassName ??
            'border-white/10 bg-white/5 text-white/55 hover:bg-white/10'),
        className,
      )}
      aria-pressed={enabled}
      aria-label={ariaLabel}
    >
      {enabled && slot != null ? (
        <span className="text-[11px] font-bold leading-none tracking-tight">{loopSlotLabel(slot)}</span>
      ) : (
        <Repeat size={iconSize} strokeWidth={2.25} aria-hidden />
      )}
    </button>
  )
}
