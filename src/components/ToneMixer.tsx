import clsx from 'clsx'
import { ArrowDownUp, AudioWaveform } from 'lucide-react'
import type { ChangeEvent } from 'react'
import type { ToneConfig, TimbreBlend } from '../audio/types'
import { getTonePageLabel, type NoteId, type TonalCenter } from '../music/notes'
import { getFrequency, type TuningSystemId } from '../music/tuning'
import { SHINE_OCTAVE_LABELS } from '../hooks/useShine'
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
  shineAutos: boolean[]
  shineBumps: boolean[]
  shineOctaveIndex: number
  onShineToggle: () => void
  onShineVolume: (volume: number) => void
  onShineAllAuto: (on: boolean) => void
  onShineAllBumps: (on: boolean) => void
  onShineOctaveIndex: (index: number) => void
  onToneGain: (noteId: NoteId, gainDb: number) => void
  onTonePan: (noteId: NoteId, pan: number) => void
  onToneDetune: (noteId: NoteId, detuneCents: number) => void
  onToneTimbreValue: (noteId: NoteId, key: 'sine' | 'saw' | 'square', value: number) => void
  onToggleToneSolo: (noteId: NoteId) => void
  onEditOvertones: (noteId: NoteId) => void
}

function ShineMixerChannel({
  enabled,
  volume,
  autos,
  bumps,
  octaveIndex,
  spatialExpanded,
  onToggle,
  onVolume,
  onAllAuto,
  onAllBumps,
  onOctaveIndex,
}: {
  enabled: boolean
  volume: number
  autos: boolean[]
  bumps: boolean[]
  octaveIndex: number
  spatialExpanded: boolean
  onToggle: () => void
  onVolume: (volume: number) => void
  onAllAuto: (on: boolean) => void
  onAllBumps: (on: boolean) => void
  onOctaveIndex: (index: number) => void
}) {
  const allAuto = autos.every(Boolean)
  const allBumps = autos.some(Boolean) && autos.every((autoOn, index) => (autoOn ? bumps[index] : true))

  return (
    <article
      className={clsx(
        'tone-mixer-channel flex shrink-0 flex-col items-center gap-0 rounded-xl border px-2 py-2 transition',
        spatialExpanded && 'tone-mixer-channel--expanded',
        enabled
          ? 'border-cyan-300/25 bg-cyan-300/[0.05]'
          : 'border-white/10 bg-white/[0.03]',
      )}
    >
      <button
        type="button"
        className={clsx(
          'button-safe flex h-9 w-full items-center justify-center rounded-lg border px-1 text-center text-[10px] font-semibold uppercase tracking-[0.1em] transition',
          enabled
            ? 'border-cyan-300/60 bg-cyan-300/25 text-cyan-50 shadow-[0_0_14px_rgba(103,232,249,0.22)] hover:bg-cyan-300/35'
            : 'border-white/15 bg-white/5 text-white/55 hover:bg-white/10 hover:text-white/80',
        )}
        onClick={onToggle}
        aria-pressed={enabled}
        aria-label={enabled ? 'Turn Shine off' : 'Turn Shine on'}
        title={enabled ? 'Shine on' : 'Shine off'}
      >
        Shine
      </button>
      <div className="tone-mixer-value-row">
        <span className="tabular-nums text-[11px] leading-none text-white/75">{Math.round(volume * 100)}%</span>
      </div>
      <div className="tone-mixer-fader-slot">
        <div className="tone-mixer-fader-vertical tone-mixer-fader-vertical--gain">
          <ResettableRangeInput
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onVolume(Number(event.target.value))}
            onReset={() => onVolume(DEFAULT_SHINE_VOLUME)}
            aria-label="Shine volume (obeys the global master gain). Double-click or double-tap to reset to 60%."
            className="tone-mixer-fader-vertical-input tone-mixer-fader-vertical-input--gain accent-cyan-300"
          />
        </div>
      </div>
      {/* Same footer rhythm as tone channels: pan row → Hz row → OT button row. */}
      <div className="tone-mixer-pan grid w-full grid-cols-[1fr_auto] items-center gap-1.5 border-t border-white/10 pt-2 text-xs">
        <span className="invisible text-white/60">Pan</span>
        <span className="invisible tabular-nums text-white/70">0.00</span>
        <div className="relative col-span-2 flex h-2 w-full items-center">
          <div className="absolute inset-x-0 flex items-center gap-1">
            <button
              type="button"
              className={clsx(
                'button-safe flex h-8 flex-1 items-center justify-center rounded-lg border text-[11px] font-bold transition',
                allAuto
                  ? 'border-cyan-300/60 bg-cyan-300/20 text-cyan-50'
                  : 'border-white/15 bg-white/5 text-white/55 hover:bg-white/10 hover:text-white/80',
              )}
              onClick={() => onAllAuto(!allAuto)}
              aria-pressed={allAuto}
              aria-label="Shine auto for all harmonics"
              title="Auto"
            >
              A
            </button>
            <button
              type="button"
              className={clsx(
                'button-safe flex h-8 flex-1 items-center justify-center rounded-lg border text-[11px] font-bold transition',
                allBumps
                  ? 'border-cyan-300/60 bg-cyan-300/20 text-cyan-50'
                  : 'border-white/15 bg-white/5 text-white/55 hover:bg-white/10 hover:text-white/80',
              )}
              onClick={() => onAllBumps(!allBumps)}
              aria-pressed={allBumps}
              aria-label="Shine bumps for all harmonics"
              title="Bumps"
            >
              B
            </button>
          </div>
        </div>
      </div>
      <div className="tone-mixer-value-row" aria-hidden>
        <span className="tone-mixer-hz invisible tabular-nums text-[10px] leading-tight text-white/55">
          000.0 Hz
        </span>
      </div>
      <select
        value={octaveIndex}
        onChange={(event) => onOctaveIndex(Number(event.target.value))}
        aria-label="Shine octave"
        title="Octave"
        className="shine-octave-select button-safe h-8 w-8 shrink-0 appearance-none rounded-lg border border-white/15 bg-white/5 text-center text-xs font-semibold text-white/80 transition hover:bg-white/10"
      >
        {SHINE_OCTAVE_LABELS.map((label, index) => (
          <option key={label} value={index}>
            {label}
          </option>
        ))}
      </select>
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
  shineAutos,
  shineBumps,
  shineOctaveIndex,
  onShineToggle,
  onShineVolume,
  onShineAllAuto,
  onShineAllBumps,
  onShineOctaveIndex,
  onToneGain,
  onTonePan,
  onToneDetune,
  onToneTimbreValue,
  onToggleToneSolo,
  onEditOvertones,
}: ToneMixerProps) {
  const shineChannel = (
    <ShineMixerChannel
      enabled={shineEnabled}
      volume={shineVolume}
      autos={shineAutos}
      bumps={shineBumps}
      octaveIndex={shineOctaveIndex}
      spatialExpanded={spatialExpanded}
      onToggle={onShineToggle}
      onVolume={onShineVolume}
      onAllAuto={onShineAllAuto}
      onAllBumps={onShineAllBumps}
      onOctaveIndex={onShineOctaveIndex}
    />
  )

  if (tones.length === 0) {
    return (
      <div className="space-y-2">
        <div className="rounded-xl border border-dashed border-white/15 p-3 text-sm text-white/60">
          Enable tones from the note grid to edit individual gain, detune, and pan.
        </div>
        <div className="hide-scrollbar flex items-start justify-end gap-2 overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-3">
          {shineChannel}
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
      {shineChannel}
    </div>
  )
}
