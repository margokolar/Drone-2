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
  onSaveDroneState: () => void
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
    <div className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col items-center gap-1 landscape:h-full max-h-[500px]:h-full">
      <div
        ref={trackRef}
        className={`relative min-h-0 w-full flex-1 overflow-hidden rounded-md border ${
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
      <span className="shrink-0 text-[10px] tabular-nums text-white/60">{harmonicNumber}</span>
      <button
        type="button"
        className={`shrink-0 text-[11px] font-bold leading-none transition ${
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
        className={`shrink-0 text-[11px] font-bold leading-none transition ${
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
  onSaveDroneState,
}: ShineControlsProps) {
  const allAuto = autos.every(Boolean)
  const allBumps = autos.some(Boolean) && autos.every((autoOn, index) => (autoOn ? bumps[index] : true))

  const shineActionButtonClass =
    'button-safe flex min-h-[44px] shrink-0 items-center justify-center rounded-xl border px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.12em] transition landscape:min-h-10 landscape:px-4 landscape:py-2 landscape:text-xs max-h-[500px]:min-h-10 max-h-[500px]:px-4 max-h-[500px]:py-2 max-h-[500px]:text-xs'

  const allControlsRow = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-white/50 landscape:tracking-[0.12em] max-h-[500px]:tracking-[0.12em]">
        All
      </span>
      <button
        type="button"
        className={`${shineActionButtonClass} border-white/15 bg-white/5 text-white/80 hover:bg-white/10`}
        onClick={allOn}
      >
        On
      </button>
      <button
        type="button"
        className={`${shineActionButtonClass} border-white/15 bg-white/5 text-white/80 hover:bg-white/10`}
        onClick={allOff}
      >
        Off
      </button>
      <button
        type="button"
        className={`${shineActionButtonClass} ${
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
        className={`${shineActionButtonClass} ${
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
        className={`${shineActionButtonClass} border-white/15 bg-[#2a2238] px-4 text-white/80 hover:bg-[#352a48] landscape:px-3 max-h-[500px]:px-3`}
        onClick={(event) => {
          triggerSaveFlash(event.currentTarget)
          onSaveDroneState()
        }}
        aria-label="Save drone state"
        title="Save drone state"
      >
        <Save size={18} />
      </button>
    </div>
  )

  return (
    <SectionCard
      title="Shine"
      titleAddon={
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`${shineActionButtonClass} gap-2 ${
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
      rightSlot={
        <div className="hidden min-w-0 flex-1 justify-end landscape:flex max-h-[500px]:flex">
          {allControlsRow}
        </div>
      }
      className="landscape:flex landscape:min-h-0 landscape:flex-1 landscape:flex-col landscape:overflow-hidden landscape:[&>header]:mb-2 landscape:[&>header]:shrink-0 max-h-[500px]:flex max-h-[500px]:min-h-0 max-h-[500px]:flex-1 max-h-[500px]:flex-col max-h-[500px]:overflow-hidden max-h-[500px]:[&>header]:mb-2 max-h-[500px]:[&>header]:shrink-0"
    >
      <div className="space-y-4 landscape:flex landscape:min-h-0 landscape:flex-1 landscape:flex-col landscape:space-y-0 max-h-[500px]:flex max-h-[500px]:min-h-0 max-h-[500px]:flex-1 max-h-[500px]:flex-col max-h-[500px]:space-y-0">
        <div className="flex flex-wrap items-center gap-2 landscape:hidden max-h-[500px]:hidden">
          {allControlsRow}
        </div>

        <div className="min-h-0 landscape:flex landscape:flex-1 landscape:flex-col max-h-[500px]:flex max-h-[500px]:flex-1 max-h-[500px]:flex-col">
          <div
            className="flex h-52 min-h-0 items-stretch gap-0.5 landscape:h-full landscape:min-h-0 landscape:flex-1 max-h-[500px]:h-full max-h-[500px]:min-h-0 max-h-[500px]:flex-1"
            data-swipe-ignore
          >
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

        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 landscape:hidden max-h-[500px]:hidden">
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

        <div className="grid grid-cols-2 gap-3 landscape:hidden max-h-[500px]:hidden">
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
