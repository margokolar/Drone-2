import clsx from 'clsx'
import { ArrowDownUp, AudioWaveform } from 'lucide-react'
import type { ChangeEvent } from 'react'
import type { ToneConfig, TimbreBlend } from '../audio/types'
import { getTonePageLabel, type NoteId, type TonalCenter } from '../music/notes'
import { getFrequency, type TuningSystemId } from '../music/tuning'
import {
  DEFAULT_SHINE_VOLUME,
  DEFAULT_TONE_DETUNE_CENTS,
  DEFAULT_TONE_PAN,
  MAX_TONE_DETUNE_CENTS,
  MIN_TONE_DETUNE_CENTS,
  defaultToneGainDb,
} from '../presets/defaultPresets'
import { PanFluteIcon } from './PanFluteIcon'
import { ResettableRangeInput } from './ResettableRangeInput'
import { TimbreMorphSlider } from './TimbreMorphSlider'
import { ToneLabel } from './ToneLabel'

export function toneMixerCardElementId(noteId: NoteId): string {
  return `tone-mixer-${noteId}`
}

export const TONE_MIXER_SECTION_ID = 'tone-mixer-section'

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

function toneGainAccentClass(strictSolo: boolean): string {
  return strictSolo ? 'accent-amber-300' : 'accent-fuchsia-300'
}

type ToneGainFaderProps = {
  tone: ToneConfig
  strictSolo: boolean
  onToneGain: (noteId: NoteId, gainDb: number) => void
}

function ToneGainFader({ tone, strictSolo, onToneGain, compact = false }: ToneGainFaderProps & { compact?: boolean }) {
  return (
    <div
      className={clsx(
        'tone-mixer-fader-vertical tone-mixer-fader-vertical--gain',
        compact && 'tone-mixer-fader-vertical--gain-compact',
      )}
    >
      <ResettableRangeInput
        min={-40}
        max={0}
        step={0.1}
        value={tone.gainDb}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onToneGain(tone.noteId, Number(event.target.value))
        }
        onReset={() => onToneGain(tone.noteId, defaultToneGainDb(tone.noteId))}
        aria-label={`${getTonePageLabel(tone.noteId)} gain. Double-click or double-tap to reset to default.`}
        className={`tone-mixer-fader-vertical-input tone-mixer-fader-vertical-input--gain ${toneGainAccentClass(strictSolo)}`}
      />
    </div>
  )
}

type ToneDetuneFaderProps = {
  tone: ToneConfig
  strictSolo: boolean
  onToneDetune: (noteId: NoteId, detuneCents: number) => void
}

function ToneDetuneFader({
  tone,
  strictSolo,
  onToneDetune,
  compact = false,
}: ToneDetuneFaderProps & { compact?: boolean }) {
  return (
    <div
      className={clsx(
        'tone-mixer-fader-vertical tone-mixer-fader-vertical--aux',
        compact && 'tone-mixer-fader-vertical--aux-compact',
      )}
    >
      <ResettableRangeInput
        min={MIN_TONE_DETUNE_CENTS}
        max={MAX_TONE_DETUNE_CENTS}
        step={1}
        value={tone.detuneCents}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onToneDetune(tone.noteId, Math.round(Number(event.target.value)))
        }
        onReset={() => onToneDetune(tone.noteId, DEFAULT_TONE_DETUNE_CENTS)}
        aria-label={`${getTonePageLabel(tone.noteId)} detune. Double-click or double-tap to reset to default.`}
        className={clsx(
          'tone-mixer-fader-vertical-input tone-mixer-fader-vertical-input--aux',
          compact && 'tone-mixer-fader-vertical-input--aux-compact',
          toneGainAccentClass(strictSolo),
        )}
      />
    </div>
  )
}

type ToneMixerProps = {
  tones: ToneConfig[]
  allTones: ToneConfig[]
  spatialExpanded: boolean
  referenceA4Hz: number
  baseOctave: number
  tuningSystemId: TuningSystemId
  tonalCenter: TonalCenter
  fallbackTimbreBlend: TimbreBlend
  shineEnabled: boolean
  shineVolume: number
  onShineVolume: (volume: number) => void
  onToneGain: (noteId: NoteId, gainDb: number) => void

  onTonePan: (noteId: NoteId, pan: number) => void
  onToneDetune: (noteId: NoteId, detuneCents: number) => void
  onToneTimbreValue: (noteId: NoteId, key: 'sine' | 'saw' | 'square', value: number) => void
  onToggleToneSolo: (noteId: NoteId) => void
  onEditOvertones: (noteId: NoteId) => void
}

function BusGainChannel({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
  onReset,
  ariaLabel,
  accentClassName,
  spatialExpanded,
}: {
  label: string
  valueLabel: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
  onReset: () => void
  ariaLabel: string
  accentClassName: string
  spatialExpanded: boolean
}) {
  return (
    <article
      className={clsx(
        'tone-mixer-channel flex shrink-0 flex-col items-center gap-0 rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2',
        spatialExpanded && 'tone-mixer-channel--expanded',
      )}
    >
      <div className="flex h-9 w-full items-center justify-center rounded-lg border border-white/15 bg-white/5 px-1 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-white/75">
        {label}
      </div>
      <div className="tone-mixer-value-row">
        <span className="tabular-nums text-[11px] leading-none text-white/75">{valueLabel}</span>
      </div>
      <div className="tone-mixer-fader-slot">
        <div className="tone-mixer-fader-vertical tone-mixer-fader-vertical--gain">
          <ResettableRangeInput
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(Number(event.target.value))}
            onReset={onReset}
            aria-label={ariaLabel}
            className={`tone-mixer-fader-vertical-input tone-mixer-fader-vertical-input--gain ${accentClassName}`}
          />
        </div>
      </div>
      <div className="tone-mixer-pan min-h-[3.25rem] w-full border-t border-white/10 pt-2" aria-hidden />
      <div className="tone-mixer-value-row" aria-hidden />
      <div className="h-8 w-8" aria-hidden />
    </article>
  )
}

export function ToneMixer({
  tones,
  allTones,
  spatialExpanded,
  referenceA4Hz,
  baseOctave,
  tuningSystemId,
  tonalCenter,
  fallbackTimbreBlend,
  shineEnabled,
  shineVolume,
  onShineVolume,
  onToneGain,
  onTonePan,
  onToneDetune,
  onToneTimbreValue,
  onToggleToneSolo,
  onEditOvertones,
}: ToneMixerProps) {
  if (tones.length === 0) {
    if (!shineEnabled) {
      return (
        <div className="rounded-xl border border-dashed border-white/15 p-3 text-sm text-white/60">
          Enable tones from the note grid to edit individual gain, detune, and pan.
        </div>
      )
    }
    return (
      <div className="space-y-2">
        <div className="rounded-xl border border-dashed border-white/15 p-3 text-sm text-white/60">
          Enable tones from the note grid to edit individual gain, detune, and pan.
        </div>
        <div className="hide-scrollbar flex items-start justify-end gap-2 overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-3">
          <BusGainChannel
            label="Shine"
            valueLabel={`${Math.round(shineVolume * 100)}%`}
            min={0}
            max={1}
            step={0.01}
            value={shineVolume}
            onChange={onShineVolume}
            onReset={() => onShineVolume(DEFAULT_SHINE_VOLUME)}
            ariaLabel="Shine volume (obeys the global master gain). Double-click or double-tap to reset to 60%."
            accentClassName="accent-cyan-300"
            spatialExpanded={spatialExpanded}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="hide-scrollbar flex items-start gap-2 overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-3">
      {tones.map((tone) => {
        const strictSolo = isToneStrictSolo(allTones, tone.noteId)
        const accentClassName = toneGainAccentClass(strictSolo)
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
            id={toneMixerCardElementId(tone.noteId)}
            className={clsx(
              'tone-mixer-channel flex shrink-0 flex-col items-center gap-0 rounded-xl border px-2 py-2 transition',
              spatialExpanded && 'tone-mixer-channel--expanded',
              strictSolo
                ? 'border-amber-300/40 bg-amber-300/[0.08] shadow-[0_0_22px_rgba(251,191,36,0.14)]'
                : 'border-white/10 bg-white/[0.03]',
            )}
          >
            <button
              type="button"
              className={clsx(
                'button-safe flex h-9 w-full items-center justify-center rounded-lg border px-2 tracking-[0.12em] transition',
                strictSolo
                  ? 'border-amber-300/70 bg-amber-300/30 text-amber-50 shadow-[0_0_18px_rgba(251,191,36,0.28)] hover:bg-amber-300/40'
                  : 'border-fuchsia-300/50 bg-fuchsia-300/20 text-fuchsia-50 shadow-[0_0_18px_rgba(240,171,252,0.16)] hover:bg-fuchsia-300/30',
              )}
              onClick={() => onToggleToneSolo(tone.noteId)}
              aria-label={`Lülita tooni solo: ${getTonePageLabel(tone.noteId)}`}
            >
              <ToneLabel noteId={tone.noteId} />
            </button>
            <div className="tone-mixer-value-row">
              {!spatialExpanded ? (
                <span className="tabular-nums text-[11px] leading-none text-white/75">{tone.gainDb.toFixed(1)} dB</span>
              ) : (
                <div className="flex w-full items-center justify-center gap-1">
                  <span
                    className="flex h-3.5 w-[1.625rem] items-center justify-center text-white/60"
                    title="Waveform"
                    aria-hidden
                  >
                    <AudioWaveform size={12} strokeWidth={2} />
                  </span>
                  <span
                    className="flex h-3.5 w-[1.625rem] items-center justify-center text-white/60"
                    title="Detune"
                    aria-hidden
                  >
                    <ArrowDownUp size={12} strokeWidth={2} />
                  </span>
                </div>
              )}
            </div>
            <div id={`tone-spatial-${tone.noteId}`} className="tone-mixer-fader-slot">
              {spatialExpanded ? (
                <div className="flex h-full items-stretch justify-center gap-1">
                  <TimbreMorphSlider
                    variant="mixer"
                    orientation="vertical"
                    compact
                    faderOnly
                    timbreBlend={tone.timbreBlend ?? fallbackTimbreBlend}
                    onSetTimbreValue={(key, value) => onToneTimbreValue(tone.noteId, key, value)}
                    accentClassName={accentClassName}
                  />
                  <ToneDetuneFader
                    tone={tone}
                    strictSolo={strictSolo}
                    onToneDetune={onToneDetune}
                    compact
                  />
                </div>
              ) : (
                <ToneGainFader tone={tone} strictSolo={strictSolo} onToneGain={onToneGain} />
              )}
            </div>
            <div className="tone-mixer-pan grid w-full grid-cols-[1fr_auto] items-center gap-1.5 border-t border-white/10 pt-2 text-xs">
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
                className={`col-span-2 h-2 w-full ${accentClassName}`}
              />
            </div>
            <div className="tone-mixer-value-row">
              <span className="tone-mixer-hz tabular-nums text-[10px] leading-tight text-white/55">
                {formatToneFrequencyHz(toneFrequencyHz)}
              </span>
            </div>
            <button
              type="button"
              className="button-safe flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/10"
              onClick={() => onEditOvertones(tone.noteId)}
              aria-label={`Edit ${getTonePageLabel(tone.noteId)} timbre`}
              title="Timbre"
            >
              <PanFluteIcon size={16} />
            </button>
          </article>
        )
      })}
      {shineEnabled && (
        <BusGainChannel
          label="Shine"
          valueLabel={`${Math.round(shineVolume * 100)}%`}
          min={0}
          max={1}
          step={0.01}
          value={shineVolume}
          onChange={onShineVolume}
          onReset={() => onShineVolume(DEFAULT_SHINE_VOLUME)}
          ariaLabel="Shine volume (obeys the global master gain). Double-click or double-tap to reset to 60%."
          accentClassName="accent-cyan-300"
          spatialExpanded={spatialExpanded}
        />
      )}
    </div>
  )
}
