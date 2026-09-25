import { ResettableRangeInput } from './ResettableRangeInput'
import { DEFAULT_SHINE_MOTION } from '../presets/defaultPresets'

type ShineMotionSliderProps = {
  value: number
  onChange: (value: number) => void
  className?: string
}

function motionFeel(value: number): 'Auto' | 'Mix' | 'Bumps' {
  if (value < 0.33) {
    return 'Auto'
  }
  if (value > 0.66) {
    return 'Bumps'
  }
  return 'Mix'
}

export function ShineMotionSlider({
  value,
  onChange,
  className = '',
}: ShineMotionSliderProps) {
  return (
    <div className={`flex min-w-[8rem] flex-1 items-center gap-2 ${className}`}>
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/50">
        Auto
      </span>
      <ResettableRangeInput
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        onReset={() => onChange(DEFAULT_SHINE_MOTION)}
        aria-label="Shine motion, auto to bumps. Double-click or double-tap to reset to auto."
        aria-valuetext={motionFeel(value)}
        className="h-1.5 min-w-0 w-full flex-1 accent-cyan-300"
      />
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/50">
        Bumps
      </span>
    </div>
  )
}
