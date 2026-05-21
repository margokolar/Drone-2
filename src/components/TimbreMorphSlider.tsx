import type { ChangeEvent, KeyboardEvent } from 'react'
import type { TimbreBlend } from '../audio/types'

type TimbreMorphSliderProps = {
  timbreBlend: TimbreBlend
  onSetTimbreValue: (key: 'sine' | 'saw' | 'square', value: number) => void
  onTimbreChangeStart?: () => void
  onTimbreChangeEnd?: () => void
  orientation?: 'horizontal' | 'vertical'
  className?: string
}

function morphFromBlend(sine: number, saw: number, square: number): number {
  const total = Math.max(0, sine) + Math.max(0, saw) + Math.max(0, square)
  if (total <= 0) {
    return 0
  }
  return (Math.max(0, saw) * 0.5 + Math.max(0, square)) / total
}

function blendFromMorph(morph: number): TimbreBlend {
  const clamped = Math.max(0, Math.min(1, morph))
  if (clamped <= 0.5) {
    const t = clamped / 0.5
    return {
      sine: 1 - t,
      saw: t,
      square: 0,
    }
  }
  const t = (clamped - 0.5) / 0.5
  return {
    sine: 0,
    saw: 1 - t,
    square: t,
  }
}

export function TimbreMorphSlider({
  timbreBlend,
  onSetTimbreValue,
  onTimbreChangeStart,
  onTimbreChangeEnd,
  orientation = 'horizontal',
  className = '',
}: TimbreMorphSliderProps) {
  const timbreMorph = morphFromBlend(timbreBlend.sine, timbreBlend.saw, timbreBlend.square)

  const applyMorph = (nextMorph: number) => {
    onTimbreChangeStart?.()
    const nextBlend = blendFromMorph(nextMorph)
    onSetTimbreValue('sine', nextBlend.sine)
    onSetTimbreValue('saw', nextBlend.saw)
    onSetTimbreValue('square', nextBlend.square)
  }

  const handleTimbreKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
      onTimbreChangeStart?.()
    }
  }

  const sharedRangeProps = {
    min: 0,
    max: 1,
    step: 0.01,
    value: timbreMorph,
    onPointerDown: onTimbreChangeStart,
    onPointerUp: onTimbreChangeEnd,
    onPointerCancel: onTimbreChangeEnd,
    onKeyDown: handleTimbreKeyDown,
    onKeyUp: onTimbreChangeEnd,
    onBlur: onTimbreChangeEnd,
    onChange: (event: ChangeEvent<HTMLInputElement>) => applyMorph(Number(event.target.value)),
    'aria-label': 'Timbre morph from sine to saw to square',
  }

  if (orientation === 'vertical') {
    return (
      <div
        className={`flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-[#111019]/90 p-2 shadow-lg backdrop-blur-sm ${className}`}
      >
        <span className="flex h-7 shrink-0 items-center text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">
          Square
        </span>
        <div className="relative flex h-44 w-10 items-center justify-center">
          <input
            type="range"
            {...sharedRangeProps}
            className="absolute left-1/2 top-1/2 h-2 w-44 -translate-x-1/2 -translate-y-1/2 -rotate-90 accent-fuchsia-300"
          />
        </div>
        <span className="flex h-7 shrink-0 items-center text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">
          Sine
        </span>
      </div>
    )
  }

  return (
    <div className={`space-y-2 rounded-xl border border-white/10 bg-white/5 p-3 ${className}`}>
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-white/60">
        <span>Sine</span>
        <span>Saw</span>
        <span>Square</span>
      </div>
      <input type="range" {...sharedRangeProps} className="h-2 w-full accent-fuchsia-300" />
    </div>
  )
}
