import clsx from 'clsx'
import { useRef } from 'react'
import { ToneLabel } from './ToneLabel'
import {
  TONE_SELECTION_GRID_IDS,
  TONE_SELECTION_SUB_OCTAVE_IDS,
  getTonePageLabel,
  type NoteId,
} from '../music/notes'
import type { ToneConfig } from '../audio/types'

type NoteSelectorProps = {
  tones: ToneConfig[]
  soloModeActive: boolean
  onTonePress: (noteId: NoteId) => void
  onToneLongPress: (noteId: NoteId) => void
}

const TONE_BUTTON_CLASS =
  'flex min-h-[36px] min-w-0 items-center justify-center rounded-md border px-1 py-1.5 transition'
const SOLO_LONG_PRESS_MS = 800

function ToneButton({
  noteId,
  enabled,
  soloModeActive,
  onTonePress,
  onToneLongPress,
}: {
  noteId: NoteId
  enabled: boolean
  soloModeActive: boolean
  onTonePress: (noteId: NoteId) => void
  onToneLongPress: (noteId: NoteId) => void
}) {
  const longPressTimerRef = useRef<number | null>(null)
  const longPressTriggeredRef = useRef(false)

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  return (
    <button
      type="button"
      onPointerDown={() => {
        longPressTriggeredRef.current = false
        clearLongPressTimer()
        longPressTimerRef.current = window.setTimeout(() => {
          longPressTriggeredRef.current = true
          onToneLongPress(noteId)
        }, SOLO_LONG_PRESS_MS)
      }}
      onPointerUp={clearLongPressTimer}
      onPointerLeave={clearLongPressTimer}
      onPointerCancel={clearLongPressTimer}
      onClick={() => {
        if (longPressTriggeredRef.current) {
          longPressTriggeredRef.current = false
          return
        }
        onTonePress(noteId)
      }}
      className={clsx(
        TONE_BUTTON_CLASS,
        enabled &&
          (soloModeActive
            ? 'border-amber-300/70 bg-amber-300/25 text-amber-50'
            : 'border-fuchsia-300/70 bg-fuchsia-300/20 text-fuchsia-100'),
        !enabled && 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10',
      )}
      aria-label={`Toggle ${getTonePageLabel(noteId)}. Long-press for solo mode.`}
    >
      <ToneLabel noteId={noteId} />
    </button>
  )
}

export function NoteSelector({ tones, soloModeActive, onTonePress, onToneLongPress }: NoteSelectorProps) {
  const toneState = new Map(tones.map((tone) => [tone.noteId, tone.enabled]))
  const firstGridRowIds = TONE_SELECTION_GRID_IDS.slice(0, 8)
  const secondGridRowIds = TONE_SELECTION_GRID_IDS.slice(8)

  return (
    <div className="grid grid-cols-8 gap-1.5">
      <div className="col-span-5 flex min-h-[36px] items-center text-xs uppercase tracking-[0.16em] text-white/60">
        Tone selection {soloModeActive ? '· Solo' : ''}
      </div>
      {TONE_SELECTION_SUB_OCTAVE_IDS.map((noteId) => (
        <ToneButton
          key={noteId}
          noteId={noteId}
          enabled={Boolean(toneState.get(noteId))}
          soloModeActive={soloModeActive}
          onTonePress={onTonePress}
          onToneLongPress={onToneLongPress}
        />
      ))}
      <div aria-hidden className="min-h-[36px]" />
      {firstGridRowIds.map((noteId) => (
        <ToneButton
          key={noteId}
          noteId={noteId}
          enabled={Boolean(toneState.get(noteId))}
          soloModeActive={soloModeActive}
          onTonePress={onTonePress}
          onToneLongPress={onToneLongPress}
        />
      ))}
      {secondGridRowIds.map((noteId) => (
        <ToneButton
          key={noteId}
          noteId={noteId}
          enabled={Boolean(toneState.get(noteId))}
          soloModeActive={soloModeActive}
          onTonePress={onTonePress}
          onToneLongPress={onToneLongPress}
        />
      ))}
    </div>
  )
}
