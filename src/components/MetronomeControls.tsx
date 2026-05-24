import { Pause, Play } from 'lucide-react'
import { DEFAULT_METRONOME_BPM, DEFAULT_METRONOME_VOLUME_DB } from '../presets/defaultPresets'
import { NumericValueField } from './NumericValueField'
import { ResettableRangeInput } from './ResettableRangeInput'

const TEMPO_PRESETS = Array.from({ length: 12 }, (_, index) => 40 + index * 10)

type MetronomeControlsProps = {
  enabled: boolean
  bpm: number
  volumeDb: number
  onEnabledChange: (enabled: boolean) => void
  onBpmChange: (bpm: number) => void
  onVolumeChange: (db: number) => void
}

export function MetronomeControls({
  enabled,
  bpm,
  volumeDb,
  onEnabledChange,
  onBpmChange,
  onVolumeChange,
}: MetronomeControlsProps) {
  let powerButtonClass =
    'flex h-16 w-16 shrink-0 items-center justify-center rounded-full border text-white shadow-sm transition'
  let ToneIcon = Play
  if (enabled) {
    powerButtonClass +=
      ' border-fuchsia-300/80 bg-fuchsia-300/30 text-fuchsia-50 shadow-[0_0_0_1px_rgba(245,158,255,0.35)]'
    ToneIcon = Pause
  }
  if (!enabled) {
    powerButtonClass += ' border-white/25 bg-white/10 text-white/90 hover:bg-white/15'
    ToneIcon = Play
  }

  return (
    <div>
      {/* pb-9 matches SectionCard pt-4 + title row so play sits midway between card top and tempo box top */}
      <div className="flex justify-center pb-9">
        <button
          type="button"
          className={powerButtonClass}
          onClick={() => onEnabledChange(!enabled)}
          aria-label={enabled ? 'Stop metronome' : 'Start metronome'}
        >
          <ToneIcon size={30} />
        </button>
      </div>

      <div className="space-y-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-white/70">Tempo</span>
            <div className="flex flex-wrap items-center gap-2 text-white/85">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-white/10 text-sm text-white/90 transition hover:bg-white/15"
                onClick={() => onBpmChange(Math.round(bpm) - 1)}
                aria-label="Decrease tempo by 1 BPM"
              >
                -
              </button>
              <NumericValueField
                value={bpm}
                onCommit={onBpmChange}
                min={30}
                max={220}
                decimals={0}
                className="w-28 max-w-full rounded-md border border-white/15 bg-white/10 px-2 py-1 text-right tabular-nums text-3xl text-white/90 outline-none transition focus:border-fuchsia-300/60"
                ariaLabel="Tempo BPM"
              />
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-white/10 text-sm text-white/90 transition hover:bg-white/15"
                onClick={() => onBpmChange(Math.round(bpm) + 1)}
                aria-label="Increase tempo by 1 BPM"
              >
                +
              </button>
              <span>BPM</span>
            </div>
          </div>
          <ResettableRangeInput
            min={30}
            max={220}
            step={1}
            value={bpm}
            onChange={(event) => onBpmChange(Number(event.target.value))}
            onReset={() => onBpmChange(DEFAULT_METRONOME_BPM)}
            aria-label="Tempo BPM. Double-click or double-tap to reset to default."
            className="h-2 w-full accent-fuchsia-300"
          />
          <div className="mt-3">
            <div className="grid grid-cols-4 gap-2">
              {TEMPO_PRESETS.map((presetBpm) => {
                const isActive = Math.round(bpm) === presetBpm
                let presetClassName =
                  'min-h-[40px] rounded-md border px-2 py-2 text-sm tabular-nums transition'
                if (isActive) {
                  presetClassName +=
                    ' border-fuchsia-300/70 bg-fuchsia-300/25 text-fuchsia-50 shadow-[0_0_0_1px_rgba(245,158,255,0.25)]'
                }
                if (!isActive) {
                  presetClassName +=
                    ' border-white/15 bg-white/10 text-white/80 hover:border-white/25 hover:bg-white/15'
                }
                return (
                  <button
                    key={presetBpm}
                    type="button"
                    className={presetClassName}
                    onClick={() => onBpmChange(presetBpm)}
                    aria-label={`Set tempo to ${presetBpm} BPM`}
                  >
                    {presetBpm}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-white/70">Click volume</span>
            <span className="tabular-nums text-white/85">{volumeDb.toFixed(1)} dB</span>
          </div>
          <ResettableRangeInput
            min={-40}
            max={0}
            step={0.1}
            value={volumeDb}
            onChange={(event) => onVolumeChange(Number(event.target.value))}
            onReset={() => onVolumeChange(DEFAULT_METRONOME_VOLUME_DB)}
            aria-label="Click volume. Double-click or double-tap to reset to default."
            className="h-2 w-full accent-fuchsia-300"
          />
        </div>
      </div>
    </div>
  )
}
