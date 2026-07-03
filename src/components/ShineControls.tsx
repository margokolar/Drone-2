import { useRef } from 'react'
import { Play, Save, Square } from 'lucide-react'
import { SectionCard } from './SectionCard'
import { ResettableRangeInput } from './ResettableRangeInput'
import { triggerSaveFlash } from '../utils/saveFlash'
import { DEFAULT_SHINE_VOLUME, SHINE_OCTAVE_LABELS, type ShineState } from '../hooks/useShine'
import { TONAL_CENTERS, type TonalCenter } from '../music/notes'

type ShineControlsProps = ShineState & {
  tonalCenter: TonalCenter
  onTonalCenterChange: (value: TonalCenter) => void
  onSavePreset: () => void
}

type HarmonicBarProps = {
  harmonicNumber: number
  level: number
  auto: boolean
  bumps: boolean
  onLevelChange: (level: number) => void
  onToggleAuto: () => void
  onToggleBumps: () => void
}

function HarmonicBar({
  harmonicNumber,
  level,
  auto,
  bumps,
  onLevelChange,
  onToggleAuto,
  onToggleBumps,
}: HarmonicBarProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)

  const setLevelFromClientY = (clientY: number) => {
    const track = trackRef.current
    if (!track) {
      return
    }
    const rect = track.getBoundingClientRect()
    const relative = (rect.bottom - clientY) / rect.height
    onLevelChange(Math.min(1, Math.max(0, relative)))
  }

  const displayLevel = Math.min(1, Math.max(0, level))

  return (
    <div className="flex min-w-0 flex-1 basis-0 flex-col items-center gap-1">
      <div
        ref={trackRef}
        className={`relative w-full flex-1 overflow-hidden rounded-md border ${
          auto ? 'border-fuchsia-500/40' : 'border-rose-900/60'
        } bg-black`}
        style={{ touchAction: 'none' }}
        onPointerDown={(event) => {
          if (auto) {
            return
          }
          event.currentTarget.setPointerCapture(event.pointerId)
          setLevelFromClientY(event.clientY)
        }}
        onPointerMove={(event) => {
          if (auto || event.buttons === 0) {
            return
          }
          setLevelFromClientY(event.clientY)
        }}
      >
        <div
          className={`absolute inset-x-0 bottom-0 ${
            auto
              ? 'bg-gradient-to-t from-fuchsia-900 to-fuchsia-400'
              : 'bg-gradient-to-t from-emerald-900 to-emerald-400'
          }`}
          style={{ height: `${displayLevel * 100}%` }}
        />
      </div>
      <span className="text-[10px] tabular-nums text-white/60">{harmonicNumber}</span>
      <button
        type="button"
        className={`text-[11px] font-bold leading-none transition ${
          auto ? 'text-cyan-300' : 'text-white/50 hover:text-white/80'
        }`}
        onClick={onToggleAuto}
        aria-pressed={auto}
        aria-label={`Harmonic ${harmonicNumber} auto`}
      >
        A
      </button>
      <button
        type="button"
        disabled={!auto}
        className={`text-[11px] font-bold leading-none transition ${
          !auto
            ? 'text-white/20'
            : bumps
              ? 'text-cyan-300'
              : 'text-white/50 hover:text-white/80'
        }`}
        onClick={onToggleBumps}
        aria-pressed={bumps}
        aria-label={`Harmonic ${harmonicNumber} bumps`}
      >
        B
      </button>
    </div>
  )
}

export function ShineControls({
  enabled,
  levels,
  autos,
  bumps,
  displayLevels,
  volume,
  octaveIndex,
  toggleRunning,
  setLevel,
  setAuto,
  setBumps,
  allOn,
  allOff,
  setAllAuto,
  setAllBumps,
  setVolume,
  setOctaveIndex,
  tonalCenter,
  onTonalCenterChange,
  onSavePreset,
}: ShineControlsProps) {
  const allAuto = autos.every(Boolean)
  const allBumps = autos.some(Boolean) && autos.every((autoOn, index) => (autoOn ? bumps[index] : true))

  return (
    <SectionCard
      title="Shine"
      titleAddon={
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`button-safe flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.12em] transition ${
              enabled
                ? 'border-amber-300/80 bg-amber-300/25 text-amber-50 shadow-[0_0_18px_rgba(251,191,36,0.28)] hover:bg-amber-300/35'
                : 'border-white/15 bg-white/5 text-white/70 hover:bg-white/10'
            }`}
            onClick={toggleRunning}
            aria-pressed={enabled}
          >
            {enabled ? <Square size={18} /> : <Play size={18} />}
            {enabled ? 'On' : 'Off'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs uppercase tracking-[0.14em] text-white/50">All</span>
            <button
              type="button"
              className="button-safe min-w-[3.5rem] rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-center text-xs font-medium text-white/80 transition hover:bg-white/10"
              onClick={allOn}
            >
              On
            </button>
            <button
              type="button"
              className="button-safe min-w-[3.5rem] rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-center text-xs font-medium text-white/80 transition hover:bg-white/10"
              onClick={allOff}
            >
              Off
            </button>
            <button
              type="button"
              className={`button-safe min-w-[3.5rem] rounded-lg border px-2.5 py-1.5 text-center text-xs font-medium transition ${
                allAuto
                  ? 'border-cyan-300/60 bg-cyan-300/20 text-cyan-50'
                  : 'border-white/15 bg-white/5 text-white/80 hover:bg-white/10'
              }`}
              onClick={() => setAllAuto(!allAuto)}
              aria-pressed={allAuto}
            >
              Auto
            </button>
            <button
              type="button"
              className={`button-safe min-w-[3.5rem] rounded-lg border px-2.5 py-1.5 text-center text-xs font-medium transition ${
                allBumps
                  ? 'border-cyan-300/60 bg-cyan-300/20 text-cyan-50'
                  : 'border-white/15 bg-white/5 text-white/80 hover:bg-white/10'
              }`}
              onClick={() => setAllBumps(!allBumps)}
              aria-pressed={allBumps}
            >
              Bumps
            </button>
            <button
              type="button"
              className="button-safe flex min-w-[3.5rem] items-center justify-center rounded-lg border border-white/15 bg-[#2a2238] px-2.5 py-1.5 text-xs text-white/80 transition hover:bg-[#352a48]"
              onClick={(event) => {
                triggerSaveFlash(event.currentTarget)
                onSavePreset()
              }}
              aria-label="Save current preset"
              title="Save preset"
            >
              <Save size={16} />
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#292a36] p-2">
          <div className="flex h-52 items-stretch gap-0.5">
            {levels.map((level, index) => (
              <HarmonicBar
                key={index}
                harmonicNumber={index + 1}
                level={autos[index] ? displayLevels[index] : level}
                auto={autos[index]}
                bumps={bumps[index]}
                onLevelChange={(value) => setLevel(index, value)}
                onToggleAuto={() => setAuto(index, !autos[index])}
                onToggleBumps={() => setBumps(index, !bumps[index])}
              />
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs uppercase tracking-[0.16em] text-white/60">Volume</span>
            <span className="text-xs tabular-nums text-white/70">{Math.round(volume * 100)}%</span>
          </div>
          <ResettableRangeInput
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            onReset={() => setVolume(DEFAULT_SHINE_VOLUME)}
            aria-label="Shine volume (obeys the global master gain). Double-click or double-tap to reset to 60%."
            className="h-1.5 w-full accent-cyan-300"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.16em] text-white/60">
            Tonal center
            <select
              value={tonalCenter}
              onChange={(event) => onTonalCenterChange(event.target.value as TonalCenter)}
              className="rounded-lg border border-white/15 bg-[#252332] px-2 py-2 text-sm uppercase text-white/90"
            >
              {TONAL_CENTERS.map((center) => (
                <option key={center} value={center}>
                  {center}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.16em] text-white/60">
            Octave
            <select
              value={octaveIndex}
              onChange={(event) => setOctaveIndex(Number(event.target.value))}
              className="rounded-lg border border-white/15 bg-[#252332] px-2 py-2 text-sm text-white/90"
            >
              {SHINE_OCTAVE_LABELS.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </SectionCard>
  )
}
