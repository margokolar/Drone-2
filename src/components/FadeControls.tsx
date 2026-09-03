import { Hourglass } from 'lucide-react'
import {
  DEFAULT_PLAYBACK_FADE_IN_SECONDS,
  DEFAULT_PLAYBACK_FADE_OUT_SECONDS,
  DEFAULT_PRESET_CROSSFADE_SECONDS,
  MAX_PLAYBACK_FADE_SECONDS,
} from '../presets/defaultPresets'
import { ResettableRangeInput } from './ResettableRangeInput'
import { SectionCard } from './SectionCard'

type FadeControlsProps = {
  enabled: boolean
  fadeInSeconds: number
  fadeOutSeconds: number
  presetCrossfadeSeconds: number
  onToggleEnabled: () => void
  onFadeInSecondsChange: (seconds: number) => void
  onFadeOutSecondsChange: (seconds: number) => void
  onPresetCrossfadeSecondsChange: (seconds: number) => void
}

export function FadeControls({
  enabled,
  fadeInSeconds,
  fadeOutSeconds,
  presetCrossfadeSeconds,
  onToggleEnabled,
  onFadeInSecondsChange,
  onFadeOutSecondsChange,
  onPresetCrossfadeSecondsChange,
}: FadeControlsProps) {
  return (
    <SectionCard
      title="Fade"
      titleAddon={
        <button
          type="button"
          className={`button-safe flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition ${
            enabled
              ? 'border-fuchsia-300/60 bg-fuchsia-300/20 text-fuchsia-100 hover:bg-fuchsia-300/30'
              : 'border-white/15 bg-white/5 text-white/80 opacity-40 hover:bg-white/10'
          }`}
          onClick={onToggleEnabled}
          aria-label="Toggle play and pause fade"
          aria-pressed={enabled}
          title="Play/pause fade"
        >
          <Hourglass size={14} aria-hidden />
        </button>
      }
    >
      <div className={`space-y-3 ${enabled ? '' : 'opacity-50'}`}>
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
            Fade in
          </div>
          <div className="grid grid-cols-[1.25rem_1fr_2.75rem] items-center gap-2">
            <span className="text-xs text-white/55">S</span>
            <ResettableRangeInput
              min={0}
              max={MAX_PLAYBACK_FADE_SECONDS}
              step={0.1}
              value={fadeInSeconds}
              disabled={!enabled}
              onChange={(event) => onFadeInSecondsChange(Number(event.target.value))}
              onReset={() => onFadeInSecondsChange(DEFAULT_PLAYBACK_FADE_IN_SECONDS)}
              aria-label="Play fade in seconds"
              className="h-1.5 w-full accent-fuchsia-300"
            />
            <span className="text-right text-xs tabular-nums text-white/70">
              {fadeInSeconds.toFixed(1)}s
            </span>
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
            Fade out
          </div>
          <div className="grid grid-cols-[1.25rem_1fr_2.75rem] items-center gap-2">
            <span className="text-xs text-white/55">S</span>
            <ResettableRangeInput
              min={0}
              max={MAX_PLAYBACK_FADE_SECONDS}
              step={0.1}
              value={fadeOutSeconds}
              disabled={!enabled}
              onChange={(event) => onFadeOutSecondsChange(Number(event.target.value))}
              onReset={() => onFadeOutSecondsChange(DEFAULT_PLAYBACK_FADE_OUT_SECONDS)}
              aria-label="Pause fade out seconds"
              className="h-1.5 w-full accent-fuchsia-300"
            />
            <span className="text-right text-xs tabular-nums text-white/70">
              {fadeOutSeconds.toFixed(1)}s
            </span>
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
            Preset crossfade
          </div>
          <div className="grid grid-cols-[1.25rem_1fr_2.75rem] items-center gap-2">
            <span className="text-xs text-white/55">S</span>
            <ResettableRangeInput
              min={0}
              max={MAX_PLAYBACK_FADE_SECONDS}
              step={0.1}
              value={presetCrossfadeSeconds}
              disabled={!enabled}
              onChange={(event) => onPresetCrossfadeSecondsChange(Number(event.target.value))}
              onReset={() => onPresetCrossfadeSecondsChange(DEFAULT_PRESET_CROSSFADE_SECONDS)}
              aria-label="Preset crossfade seconds"
              className="h-1.5 w-full accent-fuchsia-300"
            />
            <span className="text-right text-xs tabular-nums text-white/70">
              {presetCrossfadeSeconds.toFixed(1)}s
            </span>
          </div>
        </div>
      </div>
    </SectionCard>
  )
}
