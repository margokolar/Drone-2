import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react'

export const MAIN_TAB_SWIPE_ORDER = ['tone', 'overtones', 'presets', 'metronome'] as const
export type MainTabSwipeId = (typeof MAIN_TAB_SWIPE_ORDER)[number]

const MIN_SWIPE_DISTANCE_PX = 56
const MAX_VERTICAL_DRIFT_RATIO = 0.85

function isSwipeIgnoredTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false
  }
  return Boolean(
    target.closest(
      'input, textarea, select, button, a, [role="slider"], [data-no-tab-swipe]',
    ),
  )
}

type UseMainTabSwipeOptions = {
  activeTab: string
  setActiveTab: (tab: MainTabSwipeId) => void
  enabled: boolean
}

export function useMainTabSwipe({ activeTab, setActiveTab, enabled }: UseMainTabSwipeOptions) {
  const pointerStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null)

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (!enabled) {
        return
      }
      if (isSwipeIgnoredTarget(event.target)) {
        return
      }
      pointerStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        pointerId: event.pointerId,
      }
    },
    [enabled],
  )

  const finishSwipe = useCallback(
    (event: ReactPointerEvent) => {
      const start = pointerStartRef.current
      if (!start || start.pointerId !== event.pointerId) {
        return
      }
      pointerStartRef.current = null
      if (!enabled) {
        return
      }

      const dx = event.clientX - start.x
      const dy = event.clientY - start.y
      if (Math.abs(dx) < MIN_SWIPE_DISTANCE_PX) {
        return
      }
      if (Math.abs(dy) > Math.abs(dx) * MAX_VERTICAL_DRIFT_RATIO) {
        return
      }

      const index = MAIN_TAB_SWIPE_ORDER.indexOf(activeTab as MainTabSwipeId)
      if (index < 0) {
        return
      }

      if (dx < 0) {
        const next = MAIN_TAB_SWIPE_ORDER[index + 1]
        if (next) {
          setActiveTab(next)
        }
        return
      }

      const previous = MAIN_TAB_SWIPE_ORDER[index - 1]
      if (previous) {
        setActiveTab(previous)
      }
    },
    [activeTab, enabled, setActiveTab],
  )

  const onPointerUp = useCallback(
    (event: ReactPointerEvent) => {
      finishSwipe(event)
    },
    [finishSwipe],
  )

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent) => {
      finishSwipe(event)
    },
    [finishSwipe],
  )

  return { onPointerDown, onPointerUp, onPointerCancel }
}
