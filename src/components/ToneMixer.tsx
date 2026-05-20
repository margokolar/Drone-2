import clsx from 'clsx'
import { AudioWaveform } from 'lucide-react'
import type { ToneConfig } from '../audio/types'
import { getTonePageLabel, type NoteId } from '../music/notes'
import { ToneLabel } from './ToneLabel'

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
  onToneGain: (noteId: NoteId, gainDb: number) => void
  onTonePan: (noteId: NoteId, pan: number) => void
  onToggleToneSolo: (noteId: NoteId) => void
  onEditOvertones: (noteId: NoteId) => void
}

export function ToneMixer({
  tones,
  allTones,
  onToneGain,
  onTonePan,
  onToggleToneSolo,
  onEditOvertones,
}: ToneMixerProps) {
  return (
    <div className="space-y-3">
      {tones.map((tone) => {
        const strictSolo = isToneStrictSolo(allTones, tone.noteId)
        return (
          <article
            key={tone.noteId}
            className={`rounded-xl border p-3 transition ${
              strictSolo
                ? 'border-amber-300/40 bg-amber-300/[0.08] shadow-[0_0_22px_rgba(251,191,36,0.14)]'
                : 'border-white/10 bg-white/5'
            }`}
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                  Tone
                </span>
                <button
                  type="button"
                  className={clsx(
                    'button-safe min-w-0 shrink rounded-lg border px-2.5 py-1 tracking-[0.12em] transition',
                    strictSolo
                      ? 'border-amber-300/70 bg-amber-300/30 text-amber-50 shadow-[0_0_18px_rgba(251,191,36,0.28)] hover:bg-amber-300/40'
                      : 'border-fuchsia-300/50 bg-fuchsia-300/20 text-fuchsia-50 shadow-[0_0_18px_rgba(240,171,252,0.16)] hover:bg-fuchsia-300/30',
                  )}
                  onClick={() => onToggleToneSolo(tone.noteId)}
                  aria-label={`Lülita tooni solo: ${getTonePageLabel(tone.noteId)}`}
                >
                  <ToneLabel noteId={tone.noteId} />
                </button>
              </div>
              <button
                type="button"
                className="button-safe flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-xs font-semibold text-white/80 transition hover:bg-white/10"
                onClick={() => onEditOvertones(tone.noteId)}
                aria-label={`Edit ${getTonePageLabel(tone.noteId)} overtones`}
              >
                <AudioWaveform size={14} />
                OT
              </button>
            </div>
            <div className="grid grid-cols-[1fr_auto] items-center gap-2 text-sm">
              <span className="text-white/60">Gain</span>
              <span className="tabular-nums text-white/70">{tone.gainDb.toFixed(1)} dB</span>
              <input
                type="range"
                min={-40}
                max={0}
                step={0.1}
                value={tone.gainDb}
                onChange={(event) => onToneGain(tone.noteId, Number(event.target.value))}
                className={`col-span-2 h-2 w-full ${strictSolo ? 'accent-amber-300' : 'accent-fuchsia-300'}`}
              />
            </div>
            <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-2 text-sm">
              <span className="text-white/60">Pan</span>
              <span className="tabular-nums text-white/70">{tone.pan.toFixed(2)}</span>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={tone.pan}
                onChange={(event) => onTonePan(tone.noteId, Number(event.target.value))}
                className={`col-span-2 h-2 w-full ${strictSolo ? 'accent-amber-300' : 'accent-fuchsia-300'}`}
              />
            </div>
          </article>
        )
      })}
      {tones.length === 0 && (
        <div className="rounded-xl border border-dashed border-white/15 p-3 text-sm text-white/60">
          Enable tones from the note grid to edit individual gain and pan.
        </div>
      )}
    </div>
  )
}
