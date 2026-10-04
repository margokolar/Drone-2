import { Home, Lock, LockOpen, Menu, Pencil, Save } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { suppressTrailingClickAfterLongPress } from '../utils/suppressTrailingClick'
import { triggerSaveFlash } from '../utils/saveFlash'

const DRONE_TITLE_LONG_PRESS_TO_OVERTONES_MS = 800
const TOUCH_LOCK_LONG_PRESS_MS = 800

function formatClock(): string {
  return new Date().toLocaleTimeString('et-EE', { hour: '2-digit', minute: '2-digit' })
}

function useClock(): string {
  const [currentTime, setCurrentTime] = useState(formatClock)
  useEffect(() => {
    const timerId = window.setInterval(() => {
      setCurrentTime(formatClock())
    }, 1000)
    return () => window.clearInterval(timerId)
  }, [])
  return currentTime
}

/** Run `onLongPress` after holding for `ms`; swallows the click that ends a long press. */
function useLongPress(ms: number, onLongPress: () => void, suppressTrailingClick: boolean) {
  const timerRef = useRef<number | null>(null)
  const firedRef = useRef(false)
  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])
  const onPointerDown = useCallback(() => {
    firedRef.current = false
    clear()
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      firedRef.current = true
      if (suppressTrailingClick) {
        suppressTrailingClickAfterLongPress()
      }
      onLongPress()
    }, ms)
  }, [clear, ms, onLongPress, suppressTrailingClick])
  /** True when the click belongs to a long press that already fired (and resets the flag). */
  const consumeLongPressClick = useCallback(() => {
    if (firedRef.current) {
      firedRef.current = false
      return true
    }
    return false
  }, [])
  return { onPointerDown, clear, consumeLongPressClick }
}

type TitleBarProps = {
  controlsLocked: boolean
  homeScreenOpen: boolean
  menuOpen: boolean
  onOpenMenu: () => void
  /** Tap on the "Drone" title. */
  onOpenTone: () => void
  /** Long-press on the "Drone" title. */
  onOpenOvertones: () => void
  /** Home / edit button: opens home screen, or leaves it for the presets page. */
  onHomeButton: () => void
  onSave: () => void
  /** Long-press on the lock button. */
  onToggleTouchLock: () => void
}

export function TitleBar({
  controlsLocked,
  homeScreenOpen,
  menuOpen,
  onOpenMenu,
  onOpenTone,
  onOpenOvertones,
  onHomeButton,
  onSave,
  onToggleTouchLock,
}: TitleBarProps) {
  const currentTime = useClock()
  const titlePress = useLongPress(DRONE_TITLE_LONG_PRESS_TO_OVERTONES_MS, onOpenOvertones, true)
  const lockPress = useLongPress(TOUCH_LOCK_LONG_PRESS_MS, onToggleTouchLock, false)
  const menuLabel = menuOpen ? 'Close menu' : 'Open menu'

  return (
    <header className={`title-bar mx-auto flex max-w-[26.5rem] min-w-0 flex-nowrap items-center gap-3 rounded-xl border border-white/10 bg-[#111019] px-3 py-2 max-[480px]:px-2 max-[480px]:py-1.5 md:max-w-[62.5rem] ios-app:gap-0.5 ios-app:px-2 ios-app:py-2 ${
      controlsLocked ? 'pointer-events-none' : ''
    } ${
      controlsLocked || homeScreenOpen ? '' : 'landscape:hidden max-h-[500px]:hidden'
    }`}>
      <button
        type="button"
        aria-label={controlsLocked ? 'Menu locked while touch lock is on' : menuLabel}
        aria-disabled={controlsLocked}
        disabled={controlsLocked}
        className={`title-bar-icon flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/80 ${
          controlsLocked ? 'cursor-not-allowed opacity-40' : ''
        }`}
        onClick={() => {
          if (controlsLocked) {
            return
          }
          onOpenMenu()
        }}
      >
        <Menu size={20} className="ios-app:hidden" />
        <span className="title-bar-menu-icon hidden ios-app:flex" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>
      <button
        type="button"
        className="shrink-0 select-none rounded-lg px-0 py-1 text-xl font-semibold tracking-wide text-white transition hover:bg-white/10"
        onPointerDown={titlePress.onPointerDown}
        onPointerUp={titlePress.clear}
        onPointerLeave={titlePress.clear}
        onPointerCancel={titlePress.clear}
        onClick={() => {
          if (titlePress.consumeLongPressClick()) {
            return
          }
          onOpenTone()
        }}
        aria-label="Open Tone. Long-press to open Timbre."
      >
        Drone
      </button>
      <button
        type="button"
        className={`title-bar-icon relative z-50 flex items-center justify-center rounded-xl border transition ${
          controlsLocked
            ? 'cursor-not-allowed border-white/10 bg-white/5 text-white/40 opacity-40'
            : homeScreenOpen
              ? 'pointer-events-auto border-amber-300/50 bg-amber-300/15 text-amber-100'
              : 'pointer-events-auto border-cyan-300/50 bg-cyan-300/15 text-cyan-100 hover:bg-cyan-300/25'
        }`}
        onClick={() => {
          if (controlsLocked) {
            return
          }
          onHomeButton()
        }}
        aria-label={homeScreenOpen ? 'Edit drone' : 'Open home screen'}
        aria-pressed={homeScreenOpen}
        aria-disabled={controlsLocked}
      >
        {homeScreenOpen ? <Pencil size={20} /> : <Home size={20} />}
      </button>
      <div className="title-bar-end ml-auto flex shrink-0 items-center gap-3 ios-app:gap-1">
        <button
          type="button"
          className="title-bar-icon button-safe flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10"
          onClick={(event) => {
            triggerSaveFlash(event.currentTarget)
            onSave()
          }}
          aria-label="Save drone state"
          title="Save drone state"
        >
          <Save size={20} />
        </button>
        <button
          type="button"
          className={`title-bar-icon relative z-50 flex items-center justify-center rounded-xl border transition ${
            controlsLocked
              ? 'pointer-events-auto border-amber-300/50 bg-amber-300/15 text-amber-100'
              : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
          }`}
          onPointerDown={lockPress.onPointerDown}
          onPointerUp={lockPress.clear}
          onPointerLeave={lockPress.clear}
          onPointerCancel={lockPress.clear}
          onClick={lockPress.consumeLongPressClick}
          aria-label={
            controlsLocked
              ? 'Long-press to unlock screen touches. BlueTurn and media remote keep working.'
              : 'Long-press to lock screen touches for pocket use. BlueTurn and media remote keep working.'
          }
          aria-pressed={controlsLocked}
        >
          {controlsLocked ? <Lock size={20} /> : <LockOpen size={20} />}
        </button>
        <div className="shrink-0 whitespace-nowrap tabular-nums text-4xl font-extrabold leading-none text-fuchsia-100">{currentTime}</div>
      </div>
    </header>
  )
}
