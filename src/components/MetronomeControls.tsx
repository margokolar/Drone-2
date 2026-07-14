import { Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { metronomeEngine } from '../audio/MetronomeEngine'
import { DEFAULT_METRONOME_BPM, DEFAULT_METRONOME_VOLUME_DB } from '../presets/defaultPresets'
import { NumericValueField } from './NumericValueField'
import { ResettableRangeInput } from './ResettableRangeInput'

const TEMPO_PRESETS = Array.from({ length: 12 }, (_, index) => 40 + index * 10)
const TAP_TEMPO_RESET_MS = 2000
const TAP_TEMPO_MIN_BPM = 30
const TAP_TEMPO_MAX_BPM = 220
const TAP_TEMPO_HISTORY_LIMIT = 8

type MetronomeControlsProps = {
  enabled: boolean
  bpm: number
  volumeDb: number
  muted: boolean
  onEnabledChange: (enabled: boolean) => void
  onBpmChange: (bpm: number) => void
  onVolumeChange: (db: number) => void
  onMutedChange: (muted: boolean) => void
}

export function MetronomeControls({
  enabled,
  bpm,
  volumeDb,
  muted,
  onEnabledChange,
  onBpmChange,
  onVolumeChange,
  onMutedChange,
}: MetronomeControlsProps) {
  const [beatFlash, setBeatFlash] = useState(false)
  const beatFlashTimeoutRef = useRef<number | null>(null)
  const tapTimesRef = useRef<number[]>([])

  const handleTapTempo = () => {
    const now = performance.now()
    const previousTaps = tapTimesRef.current
    const recentTaps =
      previousTaps.length > 0 && now - previousTaps[previousTaps.length - 1] > TAP_TEMPO_RESET_MS
        ? []
        : previousTaps
    const nextTaps = [...recentTaps, now].slice(-TAP_TEMPO_HISTORY_LIMIT)
    tapTimesRef.current = nextTaps
    if (nextTaps.length < 2) {
      return
    }
    const intervals: number[] = []
    for (let index = 1; index < nextTaps.length; index += 1) {
      intervals.push(nextTaps[index] - nextTaps[index - 1])
    }
    const averageMs = intervals.reduce((sum, value) => sum + value, 0) / intervals.length
    if (averageMs <= 0) {
      return
    }
    const nextBpm = Math.round(60_000 / averageMs)
    onBpmChange(Math.min(TAP_TEMPO_MAX_BPM, Math.max(TAP_TEMPO_MIN_BPM, nextBpm)))
  }

  useEffect(() => {
    if (!enabled) {
      setBeatFlash(false)
      if (beatFlashTimeoutRef.current !== null) {
        window.clearTimeout(beatFlashTimeoutRef.current)
        beatFlashTimeoutRef.current = null
      }
      return
    }
    return metronomeEngine.onBeat(() => {
      setBeatFlash(true)
      if (beatFlashTimeoutRef.current !== null) {
        window.clearTimeout(beatFlashTimeoutRef.current)
      }
      beatFlashTimeoutRef.current = window.setTimeout(() => {
        beatFlashTimeoutRef.current = null
        setBeatFlash(false)
      }, 90)
    })
  }, [enabled])

  let powerButtonClass =
    'flex h-16 w-16 shrink-0 items-center justify-center rounded-full border text-white shadow-sm'
  let ToneIcon = Play
  if (enabled) {
    powerButtonClass +=
      ' border-fuchsia-300/80 bg-fuchsia-300/30 text-fuchsia-50 shadow-[0_0_0_1px_rgba(245,158,255,0.35)]'
    if (beatFlash) {
      powerButtonClass +=
        ' scale-110 border-fuchsia-100 bg-fuchsia-300/55 shadow-[0_0_22px_rgba(245,158,255,0.55)]'
    }
    ToneIcon = Pause
  }
  if (!enabled) {
    powerButtonClass += ' border-white/25 bg-white/10 text-white/90 transition hover:bg-white/15'
    ToneIcon = Play
  }

  return (
    <div>
      {/* pb-9 matches SectionCard pt-4 + title row so play sits midway between card top and tempo box top */}
      <div className="flex justify-center pb-9">
        <button
          type="button"
          className={`${powerButtonClass} transition-[transform,background-color,box-shadow,border-color] duration-75`}
          onClick={() => onEnabledChange(!enabled)}
          aria-label={enabled ? 'Stop metronome' : 'Start metronome'}
        >
          <ToneIcon size={30} />
        </button>
      </div>

      <div className="space-y-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="mb-2 grid grid-cols-4 items-center gap-2 text-sm">
            <div className="col-span-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
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
                  className="box-border flex min-h-11 w-[4.75rem] max-w-full items-center justify-center rounded-md border border-white/15 bg-white/10 px-1 py-1 text-center tabular-nums text-3xl leading-none text-white/90 outline-none transition focus:border-fuchsia-300/60"
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
            <button
              type="button"
              className="flex min-h-11 w-full items-center justify-center rounded-md border border-white/15 bg-white/10 px-2 text-sm font-medium text-white/85 transition hover:bg-white/15"
              onClick={handleTapTempo}
              aria-label="Tap tempo"
            >
              Tap
            </button>
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
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition ${
                  muted
                    ? 'border-fuchsia-300/70 bg-fuchsia-300/20 text-fuchsia-50'
                    : 'border-white/15 bg-white/10 text-white/80 hover:bg-white/15'
                }`}
                onClick={() => onMutedChange(!muted)}
                aria-pressed={muted}
                aria-label={muted ? 'Unmute click sound' : 'Mute click sound (visual metronome only)'}
              >
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                {muted ? 'Muted' : 'Mute'}
              </button>
              <span className={`tabular-nums ${muted ? 'text-white/40' : 'text-white/85'}`}>
                {volumeDb.toFixed(1)} dB
              </span>
            </div>
          </div>
          {muted ? (
            <p className="mb-2 text-[11px] leading-relaxed text-white/45">
              Visual metronome only — play button flashes to tempo with no click sound.
            </p>
          ) : null}
          <ResettableRangeInput
            min={-40}
            max={0}
            step={0.1}
            value={volumeDb}
            disabled={muted}
            onChange={(event) => onVolumeChange(Number(event.target.value))}
            onReset={() => onVolumeChange(DEFAULT_METRONOME_VOLUME_DB)}
            aria-label="Click volume. Double-click or double-tap to reset to default."
            className={`h-2 w-full accent-fuchsia-300 ${muted ? 'cursor-not-allowed opacity-40' : ''}`}
          />
        </div>
      </div>
    </div>
  )
}
