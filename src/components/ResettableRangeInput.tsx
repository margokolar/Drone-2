import { useRef, type InputHTMLAttributes } from 'react'

type ResettableRangeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  onReset: () => void
}

const DOUBLE_TAP_MS = 350
const DRAG_THRESHOLD_PX = 8

export function ResettableRangeInput({
  onReset,
  onPointerDown,
  onPointerUp,
  onDoubleClick,
  ...props
}: ResettableRangeInputProps) {
  const lastTapMsRef = useRef(0)
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null)

  const tryResetFromTap = () => {
    const now = Date.now()
    if (now - lastTapMsRef.current <= DOUBLE_TAP_MS) {
      lastTapMsRef.current = 0
      onReset()
      return
    }
    lastTapMsRef.current = now
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
        if (origin) {
          const moved = Math.hypot(event.clientX - origin.x, event.clientY - origin.y)
          if (moved <= DRAG_THRESHOLD_PX) {
            tryResetFromTap()
          }
        }
        onPointerUp?.(event)
      }}
      onPointerCancel={(event) => {
        pointerDownRef.current = null
        props.onPointerCancel?.(event)
      }}
      onDoubleClick={(event) => {
        event.preventDefault()
        lastTapMsRef.current = 0
        onReset()
        onDoubleClick?.(event)
      }}
    />
  )
}
