import { useRef, type InputHTMLAttributes } from 'react'

type ResettableRangeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  onReset: () => void
  onTripleReset?: () => void
}

const DOUBLE_TAP_MS = 350
const DRAG_THRESHOLD_PX = 8

export function ResettableRangeInput({
  onReset,
  onTripleReset,
  onClick,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onDoubleClick,
  ...props
}: ResettableRangeInputProps) {
  const lastTapMsRef = useRef(0)
  const tapCountRef = useRef(0)
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null)

  const clearTapState = () => {
    lastTapMsRef.current = 0
    tapCountRef.current = 0
  }

  const tryResetFromTap = () => {
    const now = Date.now()
    const tapCount = now - lastTapMsRef.current <= DOUBLE_TAP_MS ? tapCountRef.current + 1 : 1

    lastTapMsRef.current = now
    tapCountRef.current = tapCount

    if (onTripleReset && tapCount >= 3) {
      clearTapState()
      onTripleReset()
      return
    }

    if (tapCount === 2) {
      if (!onTripleReset) {
        clearTapState()
      }
      onReset()
    }
  }

  return (
    <input
      type="range"
      {...props}
      onPointerDown={(event) => {
        pointerDownRef.current = { x: event.clientX, y: event.clientY }
        onPointerDown?.(event)
      }}
      onPointerUp={(event) => {
        const origin = pointerDownRef.current
        pointerDownRef.current = null
        if (origin && event.pointerType !== 'mouse') {
          const moved = Math.hypot(event.clientX - origin.x, event.clientY - origin.y)
          if (moved <= DRAG_THRESHOLD_PX) {
            tryResetFromTap()
          }
        }
        onPointerUp?.(event)
      }}
      onPointerCancel={(event) => {
        pointerDownRef.current = null
        onPointerCancel?.(event)
      }}
      onClick={(event) => {
        if (onTripleReset && event.detail >= 3) {
          event.preventDefault()
          onTripleReset()
        }
        onClick?.(event)
      }}
      onDoubleClick={(event) => {
        event.preventDefault()
        clearTapState()
        onReset()
        onDoubleClick?.(event)
      }}
    />
  )
}
