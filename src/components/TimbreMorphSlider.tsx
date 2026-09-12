import type { ChangeEvent, KeyboardEvent } from 'react'
import clsx from 'clsx'
import { AudioWaveform } from 'lucide-react'
import type { TimbreBlend } from '../audio/types'
import { blendFromMorph, morphFromBlend } from '../audio/audioMath'
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

function timbreFeel(morph: number): 'Pehme' | 'Keskmine' | 'Terav' {
  if (morph < 0.33) {
    return 'Pehme'
  }
  if (morph > 0.66) {
    return 'Terav'
  }
  return 'Keskmine'
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
      'Timbre. Double-click or double-tap to reset to default. Triple-click or triple-tap for sine only.',
    'aria-valuetext': timbreFeel(timbreMorph),
  }

  const justKeysRange = (
    <label className={clsx('timbre-slider', className)}>
      <span className="timbre-slider__label">Timbre</span>
      <ResettableRangeInput
        {...sharedRangeProps}
        className={clsx('timbre-slider__range', accentClassName)}
      />
    </label>
  )

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

    return justKeysRange
  }

  return justKeysRange
}
