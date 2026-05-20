import { ChevronDown } from 'lucide-react'
import { TONAL_CENTERS, type TonalCenter } from '../music/notes'
import { TUNING_SYSTEMS, type TuningSystemId } from '../music/tuning'

type TopControlsProps = {
  referenceA4Hz: number
  baseOctave: number
  tuningSystemId: TuningSystemId
  tonalCenter: TonalCenter
  onReferenceNudge: (delta: number) => void
  onBaseOctaveNudge: (delta: number) => void
  onTuningSystemChange: (value: TuningSystemId) => void
  onTonalCenterChange: (value: TonalCenter) => void
}

export function TopControls({
  referenceA4Hz,
  baseOctave,
  tuningSystemId,
  tonalCenter,
  onReferenceNudge,
  onBaseOctaveNudge,
  onTuningSystemChange,
  onTonalCenterChange,
}: TopControlsProps) {
  const selectBaseClass =
    'min-h-[50px] w-full appearance-none rounded-xl border border-white/15 bg-white/5 px-3 py-2 pr-10 text-sm leading-tight text-white outline-none transition focus:border-fuchsia-300/60'

  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block space-y-2">
        <span className="text-xs uppercase tracking-[0.16em] text-white/60">Tuning system</span>
        <div className="relative">
          <select
            value={tuningSystemId}
            onChange={(event) => onTuningSystemChange(event.target.value as TuningSystemId)}
            className={selectBaseClass}
          >
            {TUNING_SYSTEMS.map((option) => (
              <option key={option.id} value={option.id} className="bg-[#1d1b2a]">
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={18}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/70"
          />
        </div>
      </label>
      <label className="block space-y-2">
        <span className="text-xs uppercase tracking-[0.16em] text-white/60">Tonal center</span>
        <div className="relative">
          <select
            value={tonalCenter}
            onChange={(event) => onTonalCenterChange(event.target.value as TonalCenter)}
            className={`${selectBaseClass} uppercase`}
          >
            {TONAL_CENTERS.map((center) => (
              <option key={center} value={center} className="bg-[#1d1b2a]">
                {center}
              </option>
            ))}
          </select>
          <ChevronDown
            size={18}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/70"
          />
        </div>
      </label>
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="mb-2 text-xs uppercase tracking-[0.16em] text-white/60">A4 reference</div>
        <div className="flex items-center gap-1.5">
          <button
            className="flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-base text-white transition hover:bg-white/10"
            onClick={() => onReferenceNudge(-1)}
            type="button"
            aria-label="Decrease A4"
          >
            -
          </button>
          <div className="flex-1 min-w-0 text-center text-base font-semibold tabular-nums">
            {Math.round(referenceA4Hz)}
          </div>
          <button
            className="flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-base text-white transition hover:bg-white/10"
            onClick={() => onReferenceNudge(1)}
            type="button"
            aria-label="Increase A4"
          >
            +
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="mb-2 text-xs uppercase tracking-[0.16em] text-white/60">Base octave</div>
        <div className="flex items-center gap-1.5">
          <button
            className="flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-base text-white transition hover:bg-white/10"
            onClick={() => onBaseOctaveNudge(-1)}
            type="button"
            aria-label="Lower base octave"
          >
            -
          </button>
          <div className="flex-1 text-center text-base font-semibold">{baseOctave}</div>
          <button
            className="flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-base text-white transition hover:bg-white/10"
            onClick={() => onBaseOctaveNudge(1)}
            type="button"
            aria-label="Raise base octave"
          >
            +
          </button>
        </div>
      </div>
    </div>
  )
}
