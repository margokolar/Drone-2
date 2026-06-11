import clsx from 'clsx'
import { ChevronDown } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ToneConfig } from '../audio/types'
import { getTonePageLabel, type NoteId, type TonalCenter } from '../music/notes'
import { getFrequency, type TuningSystemId } from '../music/tuning'
import {
  DEFAULT_TONE_DETUNE_CENTS,
  DEFAULT_TONE_PAN,
  MAX_TONE_DETUNE_CENTS,
  MIN_TONE_DETUNE_CENTS,
  defaultToneGainDb,
} from '../presets/defaultPresets'
import { PanFluteIcon } from './PanFluteIcon'
import { ResettableRangeInput } from './ResettableRangeInput'
import { ToneLabel } from './ToneLabel'

const SPATIAL_LONG_PRESS_MS = 800

function formatToneFrequencyHz(hz: number): string {
  if (hz >= 100) {
    return `${hz.toFixed(1)} Hz`
  }
  return `${hz.toFixed(2)} Hz`
}

function getToneFrequencyHz(
  noteId: NoteId,
  detuneCents: number,
  tuningSystemId: TuningSystemId,
  tonalCenter: TonalCenter,
  referenceA4Hz: number,
  baseOctave: number,
): number {
  const baseHz = getFrequency(noteId, tuningSystemId, tonalCenter, referenceA4Hz, baseOctave)
  return baseHz * 2 ** (detuneCents / 1200)
}

function isToneStrictSolo(tones: ToneConfig[], noteId: NoteId): boolean {
  const selected = tones.find((tone) => tone.noteId === noteId)
  if (!selected?.enabled) {
    return false
  }
  return tones.every((tone) => (tone.noteId === noteId ? tone.enabled : !tone.enabled))
}

type ToneMixerProps = {
  tones: ToneConfig[]
  allTones: ToneConfig[]
  referenceA4Hz: number
  baseOctave: number
  tuningSystemId: TuningSystemId
  tonalCenter: TonalCenter
  onToneGain: (noteId: NoteId, gainDb: number) => void
  onTonePan: (noteId: NoteId, pan: number) => void
  onToneDetune: (noteId: NoteId, detuneCents: number) => void
  onToggleToneSolo: (noteId: NoteId) => void
  onEditOvertones: (noteId: NoteId) => void
}

export function ToneMixer({
  tones,
  allTones,
  referenceA4Hz,
  baseOctave,
  tuningSystemId,
  tonalCenter,
  onToneGain,
  onTonePan,
  onToneDetune,
  onToggleToneSolo,
  onEditOvertones,
}: ToneMixerProps) {
  const [spatialExpandedByNote, setSpatialExpandedByNote] = useState<Partial<Record<NoteId, boolean>>>({})
  const spatialLongPressTimerRef = useRef<number | null>(null)
  const spatialLongPressTriggeredRef = useRef(false)

  const isSpatialExpanded = (noteId: NoteId): boolean => spatialExpandedByNote[noteId] ?? false

  const clearSpatialLongPressTimer = () => {
    if (spatialLongPressTimerRef.current !== null) {
      window.clearTimeout(spatialLongPressTimerRef.current)
      spatialLongPressTimerRef.current = null
    }
  }

  const toggleAllSpatialOnLongPress = () => {
    if (tones.length === 0) {
      return
    }
    setSpatialExpandedByNote((current) => {
      const allExpanded = tones.every((tone) => current[tone.noteId] ?? false)
      const next = { ...current }
      for (const tone of tones) {
        next[tone.noteId] = !allExpanded
      }
      return next
    })
  }

  const toggleSpatialExpanded = (noteId: NoteId) => {
    setSpatialExpandedByNote((current) => ({
      ...current,
      [noteId]: !isSpatialExpanded(noteId),
    }))
  }

  return (
    <div className="space-y-3">
      {tones.map((tone) => {
        const strictSolo = isToneStrictSolo(allTones, tone.noteId)
        const spatialExpanded = isSpatialExpanded(tone.noteId)
        const detuneLabel = `${tone.detuneCents > 0 ? '+' : ''}${tone.detuneCents.toFixed(1)} c`
        const toneFrequencyHz = getToneFrequencyHz(
          tone.noteId,
          tone.detuneCents,
          tuningSystemId,
          tonalCenter,
          referenceA4Hz,
          baseOctave,
        )
        return (
          <article
            key={tone.noteId}
            className={`rounded-xl border p-3 transition ${
              strictSolo
                ? 'border-amber-300/40 bg-amber-300/[0.08] shadow-[0_0_22px_rgba(251,191,36,0.14)]'
                : 'border-white/10 bg-white/5'
            }`}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <button
                  type="button"
                  className={clsx(
                    'button-safe flex shrink-0 items-center gap-0.5 rounded-lg border px-1.5 py-1 transition',
                    spatialExpanded
                      ? 'border-white/20 bg-white/10 text-white/85 hover:bg-white/15'
                      : 'border-transparent bg-transparent text-white/60 hover:bg-white/5 hover:text-white/75',
                  )}
                  onPointerDown={() => {
                    spatialLongPressTriggeredRef.current = false
                    clearSpatialLongPressTimer()
                    spatialLongPressTimerRef.current = window.setTimeout(() => {
                      spatialLongPressTriggeredRef.current = true
                      toggleAllSpatialOnLongPress()
                    }, SPATIAL_LONG_PRESS_MS)
                  }}
                  onPointerUp={clearSpatialLongPressTimer}
                  onPointerLeave={clearSpatialLongPressTimer}
                  onPointerCancel={clearSpatialLongPressTimer}
                  onClick={() => {
                    if (spatialLongPressTriggeredRef.current) {
                      spatialLongPressTriggeredRef.current = false
                      return
                    }
                    toggleSpatialExpanded(tone.noteId)
                  }}
                  aria-expanded={spatialExpanded}
                  aria-controls={`tone-spatial-${tone.noteId}`}
                  aria-label={`${spatialExpanded ? 'Peida' : 'Näita'} detune ja pan: ${getTonePageLabel(tone.noteId)}. Pikalt vajuta, et avada või sulgeda kõigi toonide detune ja pan.`}
                  title="Detune & Pan. Long-press to expand or collapse all tones."
                >
                  <span className="text-xs uppercase tracking-[0.16em]">Tone</span>
                  <ChevronDown
                    size={14}
                    className={clsx('shrink-0 transition-transform', spatialExpanded && 'rotate-180')}
                    aria-hidden
                  />
                </button>
                <button
                  type="button"
                  className={clsx(
                    'button-safe flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg border px-2.5 tracking-[0.12em] transition',
                    strictSolo
                      ? 'border-amber-300/70 bg-amber-300/30 text-amber-50 shadow-[0_0_18px_rgba(251,191,36,0.28)] hover:bg-amber-300/40'
                      : 'border-fuchsia-300/50 bg-fuchsia-300/20 text-fuchsia-50 shadow-[0_0_18px_rgba(240,171,252,0.16)] hover:bg-fuchsia-300/30',
                  )}
                  onClick={() => onToggleToneSolo(tone.noteId)}
                  aria-label={`Lülita tooni solo: ${getTonePageLabel(tone.noteId)}`}
                >
                  <ToneLabel noteId={tone.noteId} />
                </button>
                {spatialExpanded ? (
                  <span className="shrink-0 tabular-nums text-xs text-white/70">
                    {formatToneFrequencyHz(toneFrequencyHz)}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                className="button-safe flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/10"
                onClick={() => onEditOvertones(tone.noteId)}
                aria-label={`Edit ${getTonePageLabel(tone.noteId)} timbre`}
                title="Timbre"
              >
                <PanFluteIcon size={18} />
              </button>
            </div>
            <div className="grid grid-cols-[1fr_auto] items-center gap-2 text-sm">
              <span className="text-white/60">Gain</span>
              <span className="tabular-nums text-white/70">{tone.gainDb.toFixed(1)} dB</span>
              <ResettableRangeInput
                min={-40}
                max={0}
                step={0.1}
                value={tone.gainDb}
                onChange={(event) => onToneGain(tone.noteId, Number(event.target.value))}
                onReset={() => onToneGain(tone.noteId, defaultToneGainDb(tone.noteId))}
                aria-label={`${getTonePageLabel(tone.noteId)} gain. Double-click or double-tap to reset to default.`}
                className={`col-span-2 h-2 w-full ${strictSolo ? 'accent-amber-300' : 'accent-fuchsia-300'}`}
              />
            </div>
            {spatialExpanded ? (
              <div id={`tone-spatial-${tone.noteId}`} className="mt-3 space-y-3">
                <div className="grid grid-cols-[1fr_auto] items-center gap-2 text-sm">
                  <span className="text-white/60">Detune</span>
                  <span className="tabular-nums text-white/70">{detuneLabel}</span>
                  <ResettableRangeInput
                    min={MIN_TONE_DETUNE_CENTS}
                    max={MAX_TONE_DETUNE_CENTS}
                    step={0.1}
                    value={tone.detuneCents}
                    onChange={(event) => onToneDetune(tone.noteId, Number(event.target.value))}
                    onReset={() => onToneDetune(tone.noteId, DEFAULT_TONE_DETUNE_CENTS)}
                    aria-label={`${getTonePageLabel(tone.noteId)} detune. Double-click or double-tap to reset to default.`}
                    className={`col-span-2 h-2 w-full ${strictSolo ? 'accent-amber-300' : 'accent-fuchsia-300'}`}
                  />
                </div>
                <div className="grid grid-cols-[1fr_auto] items-center gap-2 text-sm">
                  <span className="text-white/60">Pan</span>
                  <span className="tabular-nums text-white/70">{tone.pan.toFixed(2)}</span>
                  <ResettableRangeInput
                    min={-1}
                    max={1}
                    step={0.01}
                    value={tone.pan}
                    onChange={(event) => onTonePan(tone.noteId, Number(event.target.value))}
                    onReset={() => onTonePan(tone.noteId, DEFAULT_TONE_PAN)}
                    aria-label={`${getTonePageLabel(tone.noteId)} pan. Double-click or double-tap to reset to default.`}
                    className={`col-span-2 h-2 w-full ${strictSolo ? 'accent-amber-300' : 'accent-fuchsia-300'}`}
                  />
                </div>
              </div>
            ) : null}
          </article>
        )
      })}
      {tones.length === 0 && (
        <div className="rounded-xl border border-dashed border-white/15 p-3 text-sm text-white/60">
          Enable tones from the note grid to edit individual gain, detune, and pan.
        </div>
      )}
    </div>
  )
}
