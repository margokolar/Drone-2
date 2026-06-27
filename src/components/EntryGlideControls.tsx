import { ArrowDownUp } from 'lucide-react'
import {
  DEFAULT_ENTRY_GLIDE_HIGHEST_CENTS,
  DEFAULT_ENTRY_GLIDE_HIGHEST_SECONDS,
  DEFAULT_ENTRY_GLIDE_LOWEST_CENTS,
  DEFAULT_ENTRY_GLIDE_LOWEST_SECONDS,
} from '../presets/defaultPresets'
import { ResettableRangeInput } from './ResettableRangeInput'
import { SectionCard } from './SectionCard'

function formatEntryGlideCents(cents: number): string {
  if (cents > 0) {
    return `+${cents}c`
  }
  if (cents < 0) {
    return `${cents}c`
  }
  return '0c'
}

type EntryGlideControlsProps = {
  enabled: boolean
  lowestCents: number
  lowestSeconds: number
  highestCents: number
  highestSeconds: number
  onToggleEnabled: () => void
  onLowestCentsChange: (cents: number) => void
  onLowestSecondsChange: (seconds: number) => void
  onHighestCentsChange: (cents: number) => void
  onHighestSecondsChange: (seconds: number) => void
}

export function EntryGlideControls({
  enabled,
  lowestCents,
  lowestSeconds,
  highestCents,
  highestSeconds,
  onToggleEnabled,
  onLowestCentsChange,
  onLowestSecondsChange,
  onHighestCentsChange,
  onHighestSecondsChange,
}: EntryGlideControlsProps) {
  return (
    <SectionCard
      title="Entry glide"
      titleAddon={
        <button
          type="button"
          className={`button-safe flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition ${
            enabled
              ? 'border-fuchsia-300/60 bg-fuchsia-300/20 text-fuchsia-100 hover:bg-fuchsia-300/30'
              : 'border-white/15 bg-white/5 text-white/80 opacity-40 hover:bg-white/10'
          }`}
          onClick={onToggleEnabled}
          aria-label="Toggle entry glide for lowest and highest tones"
          aria-pressed={enabled}
          title="Entry glide"
        >
          <ArrowDownUp size={14} aria-hidden />
        </button>
      }
    >
      <div className={`space-y-3 ${enabled ? '' : 'opacity-50'}`}>
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
            Lowest tone
          </div>
          <div className="grid grid-cols-[1.25rem_1fr_3rem] items-center gap-2">
            <span className="text-xs text-white/55">C</span>
            <ResettableRangeInput
              min={-50}
              max={50}
              step={1}
              value={lowestCents}
              disabled={!enabled}
              onChange={(event) => onLowestCentsChange(Number(event.target.value))}
              onReset={() => onLowestCentsChange(DEFAULT_ENTRY_GLIDE_LOWEST_CENTS)}
              aria-label="Lowest tone entry glide cents. Positive glides down from above, negative glides up from below."
              className="h-1.5 w-full accent-fuchsia-300"
            />
            <span className="text-right text-xs tabular-nums text-white/70">
              {formatEntryGlideCents(lowestCents)}
            </span>
          </div>
          <div className="grid grid-cols-[1.25rem_1fr_2.75rem] items-center gap-2">
            <span className="text-xs text-white/55">S</span>
            <ResettableRangeInput
              min={0}
              max={4}
              step={0.1}
              value={lowestSeconds}
              disabled={!enabled}
              onChange={(event) => onLowestSecondsChange(Number(event.target.value))}
              onReset={() => onLowestSecondsChange(DEFAULT_ENTRY_GLIDE_LOWEST_SECONDS)}
              aria-label="Lowest tone entry glide seconds"
              className="h-1.5 w-full accent-fuchsia-300"
            />
            <span className="text-right text-xs tabular-nums text-white/70">
              {lowestSeconds.toFixed(1)}s
            </span>
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
            Highest tone
          </div>
          <div className="grid grid-cols-[1.25rem_1fr_3rem] items-center gap-2">
            <span className="text-xs text-white/55">C</span>
            <ResettableRangeInput
              min={-50}
              max={50}
              step={1}
              value={highestCents}
              disabled={!enabled}
              onChange={(event) => onHighestCentsChange(Number(event.target.value))}
              onReset={() => onHighestCentsChange(DEFAULT_ENTRY_GLIDE_HIGHEST_CENTS)}
              aria-label="Highest tone entry glide cents. Positive glides down from above, negative glides up from below."
              className="h-1.5 w-full accent-fuchsia-300"
            />
            <span className="text-right text-xs tabular-nums text-white/70">
              {formatEntryGlideCents(highestCents)}
            </span>
          </div>
          <div className="grid grid-cols-[1.25rem_1fr_2.75rem] items-center gap-2">
            <span className="text-xs text-white/55">S</span>
            <ResettableRangeInput
              min={0}
              max={4}
              step={0.1}
              value={highestSeconds}
              disabled={!enabled}
              onChange={(event) => onHighestSecondsChange(Number(event.target.value))}
              onReset={() => onHighestSecondsChange(DEFAULT_ENTRY_GLIDE_HIGHEST_SECONDS)}
              aria-label="Highest tone entry glide seconds"
              className="h-1.5 w-full accent-fuchsia-300"
            />
            <span className="text-right text-xs tabular-nums text-white/70">
              {highestSeconds.toFixed(1)}s
            </span>
          </div>
        </div>
      </div>
    </SectionCard>
  )
}
