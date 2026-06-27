import type { ChangeEvent, KeyboardEvent } from 'react'
import clsx from 'clsx'
import { AudioWaveform } from 'lucide-react'
import type { TimbreBlend } from '../audio/types'
import { DEFAULT_TIMBRE_BLEND } from '../presets/defaultPresets'
import { ResettableRangeInput } from './ResettableRangeInput'

type TimbreMorphSliderProps = {
  timbreBlend: TimbreBlend
  onSetTimbreValue: (key: 'sine' | 'saw' | 'square', value: number) => void
  onTimbreChangeStart?: () => void
  onTimbreChangeEnd?: () => void
  orientation?: 'horizontal' | 'vertical'
  variant?: 'boxed' | 'mixer'
  compact?: boolean
  faderOnly?: boolean
  className?: string
  accentClassName?: string
}

function morphFromBlend(sine: number, saw: number, square: number): number {
  const total = Math.max(0, sine) + Math.max(0, saw) + Math.max(0, square)
  if (total <= 0) {
    return 0
  }
  return (Math.max(0, sine) * 0.5 + Math.max(0, square)) / total
}

function blendFromMorph(morph: number): TimbreBlend {
  const clamped = Math.max(0, Math.min(1, morph))
  if (clamped <= 0.5) {
    const t = clamped / 0.5
    return {
      sine: t,
      saw: 1 - t,
      square: 0,
    }
  }
  const t = (clamped - 0.5) / 0.5
  return {
    sine: 1 - t,
    saw: 0,
    square: t,
  }
}

export function TimbreMorphSlider({
  timbreBlend,
  onSetTimbreValue,
  onTimbreChangeStart,
  onTimbreChangeEnd,
  orientation = 'horizontal',
  variant = 'boxed',
  compact = false,
  faderOnly = false,
  className = '',
  accentClassName = 'accent-fuchsia-300',
}: TimbreMorphSliderProps) {
  const timbreMorph = morphFromBlend(timbreBlend.sine, timbreBlend.saw, timbreBlend.square)

  const applyMorph = (nextMorph: number) => {
    onTimbreChangeStart?.()
    const nextBlend = blendFromMorph(nextMorph)
    onSetTimbreValue('sine', nextBlend.sine)
    onSetTimbreValue('saw', nextBlend.saw)
    onSetTimbreValue('square', nextBlend.square)
  }

  const restoreToDefault = () => {
    onTimbreChangeStart?.()
    onSetTimbreValue('sine', DEFAULT_TIMBRE_BLEND.sine)
    onSetTimbreValue('saw', DEFAULT_TIMBRE_BLEND.saw)
    onSetTimbreValue('square', DEFAULT_TIMBRE_BLEND.square)
    onTimbreChangeEnd?.()
  }

  const restoreToSineOnly = () => {
    onTimbreChangeStart?.()
    onSetTimbreValue('sine', 1)
    onSetTimbreValue('saw', 0)
    onSetTimbreValue('square', 0)
    onTimbreChangeEnd?.()
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
    onReset: restoreToDefault,
    onTripleReset: restoreToSineOnly,
    'aria-label':
      'Timbre morph from saw to sine to square. Double-click or double-tap to reset to default. Triple-click or triple-tap for sine only.',
  }

  if (orientation === 'vertical') {
    if (variant === 'mixer') {
      const fader = (
        <div
          className={clsx(
            'tone-mixer-fader-vertical tone-mixer-fader-vertical--aux',
            compact && 'tone-mixer-fader-vertical--aux-compact',
          )}
        >
          <ResettableRangeInput
            {...sharedRangeProps}
            className={clsx(
              'tone-mixer-fader-vertical-input tone-mixer-fader-vertical-input--aux',
              compact && 'tone-mixer-fader-vertical-input--aux-compact',
              accentClassName,
            )}
          />
        </div>
      )

      if (faderOnly) {
        return fader
      }

      return (
        <div className={`flex flex-col items-center gap-0.5 ${className}`}>
          {compact ? (
            <span
              className="flex h-3.5 w-3.5 items-center justify-center text-white/60"
              title="Waveform"
              aria-hidden
            >
              <AudioWaveform size={12} strokeWidth={2} />
            </span>
          ) : (
            <span className="text-[9px] leading-none text-white/60">Sine</span>
          )}
          {fader}
          {!compact ? (
            <span className="flex items-center justify-between gap-2 text-[9px] text-white/45">
              <span>Saw</span>
              <span>Sq</span>
            </span>
          ) : null}
        </div>
      )
    }

    return (
      <div
        className={`flex flex-col gap-1 rounded-xl border border-white/10 bg-[#111019]/90 p-2 shadow-lg backdrop-blur-sm ${className}`}
      >
        <div className="flex h-44 w-10 flex-col">
          <span className="flex h-5 shrink-0 items-center justify-center text-[10px] font-semibold tracking-[0.12em] text-white/60">
            Square
          </span>
          <div className="relative flex min-h-0 flex-1 items-center justify-center">
            <ResettableRangeInput
              {...sharedRangeProps}
              className={`absolute left-1/2 top-1/2 h-2 w-[calc(11rem-1.25rem)] -translate-x-1/2 -translate-y-1/2 -rotate-90 ${accentClassName}`}
            />
          </div>
        </div>
        <span className="flex h-7 shrink-0 items-center justify-center text-[10px] font-semibold tracking-[0.12em] text-white/60">
          Saw
        </span>
      </div>
    )
  }

  if (variant === 'mixer') {
    return (
      <div className={`grid grid-cols-[1fr_auto] items-center gap-2 text-sm ${className}`}>
        <span className="col-span-2 flex items-center justify-between text-white/60">
          <span>Saw</span>
          <span>Sine</span>
          <span>Square</span>
        </span>
        <ResettableRangeInput {...sharedRangeProps} className={`col-span-2 h-2 w-full ${accentClassName}`} />
      </div>
    )
  }

  return (
    <div className={`space-y-2 rounded-xl border border-white/10 bg-white/5 p-3 ${className}`}>
      <div className="flex items-center justify-between text-sm text-white/60">
        <span>Saw</span>
        <span>Sine</span>
        <span>Square</span>
      </div>
      <ResettableRangeInput {...sharedRangeProps} className={`h-2 w-full ${accentClassName}`} />
    </div>
  )
}
