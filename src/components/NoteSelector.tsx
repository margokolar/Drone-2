import clsx from 'clsx'
import { useRef } from 'react'
import { ToneLabel } from './ToneLabel'
import {
  getTonePageLabel,
  type NoteId,
} from '../music/notes'
import type { ToneConfig } from '../audio/types'

type NoteSelectorProps = {
  tones: ToneConfig[]
  toneSetName: string
  subOctaveIds: NoteId[]
  gridIds: NoteId[]
  toneLabelOverrides?: Partial<Record<NoteId, string>>
  soloModeActive: boolean
  onTonePress: (noteId: NoteId) => void
  onToneLongPress: (noteId: NoteId) => void
  shineActive?: boolean
  onShineToggle?: () => void
  onShineLongPress?: () => void
}

const TONE_BUTTON_CLASS =
  'flex min-h-[36px] min-w-0 items-center justify-center rounded-md border px-1 py-1.5 transition'
const SOLO_LONG_PRESS_MS = 800

function ToneButton({
  noteId,
  enabled,
  toneLabelOverride,
  soloModeActive,
  onTonePress,
  onToneLongPress,
}: {
  noteId: NoteId
  enabled: boolean
  toneLabelOverride?: string
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
      <ToneLabel noteId={noteId} labelOverride={toneLabelOverride} />
    </button>
  )
}

export function NoteSelector({
  tones,
  toneSetName,
  subOctaveIds,
  gridIds,
  toneLabelOverrides,
  soloModeActive,
  onTonePress,
  onToneLongPress,
  shineActive = false,
  onShineToggle,
  onShineLongPress,
}: NoteSelectorProps) {
  const shineLongPressTimerRef = useRef<number | null>(null)
  const shineLongPressTriggeredRef = useRef(false)

  const clearShineLongPressTimer = () => {
    if (shineLongPressTimerRef.current !== null) {
      window.clearTimeout(shineLongPressTimerRef.current)
      shineLongPressTimerRef.current = null
    }
  }

  const toneState = new Map(tones.map((tone) => [tone.noteId, tone.enabled]))
  const firstGridRowIds = gridIds.slice(0, 8)
  const remainingGridRows: NoteId[][] = []
  for (let index = 8; index < gridIds.length; index += 8) {
    remainingGridRows.push(gridIds.slice(index, index + 8))
  }

  const firstRowPitchClasses = firstGridRowIds.map((noteId) => noteId.replace(/[0-9]+$/, ''))
  const subOctaveAlignedSlots: Array<NoteId | null> = Array.from({ length: 8 }, () => null)

  subOctaveIds.forEach((noteId) => {
    const pitchClass = noteId.replace(/[0-9]+$/, '')
    const column = firstRowPitchClasses.findIndex((gridPitchClass) => gridPitchClass === pitchClass)
    if (column >= 0 && subOctaveAlignedSlots[column] === null) {
      subOctaveAlignedSlots[column] = noteId
      return
    }
    const fallback = subOctaveAlignedSlots.findIndex((slot) => slot === null)
    if (fallback >= 0) {
      subOctaveAlignedSlots[fallback] = noteId
    }
  })

  return (
    <div className="space-y-1.5">
      <div className="min-h-[18px] text-xs uppercase tracking-[0.16em] text-white/60">
        Tone selection · {toneSetName} {soloModeActive ? '· Solo' : ''}
      </div>
      <div className="grid grid-cols-8 gap-1.5">
        {(() => {
          const showShineButton =
            Boolean(onShineToggle) &&
            subOctaveAlignedSlots[0] === null &&
            subOctaveAlignedSlots[1] === null
          const renderableSlots = showShineButton
            ? subOctaveAlignedSlots.slice(2)
            : subOctaveAlignedSlots
          const slotIndexOffset = showShineButton ? 2 : 0
          return (
            <>
              {showShineButton ? (
                <button
                  key="shine-toggle"
                  type="button"
                  onPointerDown={() => {
                    shineLongPressTriggeredRef.current = false
                    clearShineLongPressTimer()
                    if (!onShineLongPress) {
                      return
                    }
                    shineLongPressTimerRef.current = window.setTimeout(() => {
                      shineLongPressTriggeredRef.current = true
                      onShineLongPress()
                    }, SOLO_LONG_PRESS_MS)
                  }}
                  onPointerUp={clearShineLongPressTimer}
                  onPointerLeave={clearShineLongPressTimer}
                  onPointerCancel={clearShineLongPressTimer}
                  onClick={() => {
                    if (shineLongPressTriggeredRef.current) {
                      shineLongPressTriggeredRef.current = false
                      return
                    }
                    onShineToggle?.()
                  }}
                  aria-pressed={shineActive}
                  aria-label={
                    shineActive ? 'Stop Shine. Long-press to open Shine card.' : 'Start Shine. Long-press to open Shine card.'
                  }
                  className={clsx(
                    'col-span-2 flex min-h-[36px] min-w-0 items-center justify-center rounded-md border px-1 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition',
                    shineActive
                      ? 'border-fuchsia-300/70 bg-fuchsia-300/20 text-fuchsia-100'
                      : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10',
                  )}
                >
                  Shine
                </button>
              ) : null}
              {renderableSlots.map((noteId, index) =>
                noteId ? (
                  <ToneButton
                    key={noteId}
                    noteId={noteId}
                    enabled={Boolean(toneState.get(noteId))}
                    toneLabelOverride={toneLabelOverrides?.[noteId]}
                    soloModeActive={soloModeActive}
                    onTonePress={onTonePress}
                    onToneLongPress={onToneLongPress}
                  />
                ) : (
                  <div
                    key={`sub-slot-${index + slotIndexOffset}`}
                    aria-hidden
                    className="min-h-[36px]"
                  />
                ),
              )}
            </>
          )
        })()}
        {firstGridRowIds.map((noteId, index) =>
        noteId ? (
          <ToneButton
            key={noteId}
            noteId={noteId}
            enabled={Boolean(toneState.get(noteId))}
            toneLabelOverride={toneLabelOverrides?.[noteId]}
            soloModeActive={soloModeActive}
            onTonePress={onTonePress}
            onToneLongPress={onToneLongPress}
          />
        ) : (
          <div key={`grid-slot-top-${index}`} aria-hidden className="min-h-[36px]" />
        ),
        )}
        {remainingGridRows.flatMap((row, rowIndex) =>
          Array.from({ length: 8 }, (_, columnIndex) => {
            const noteId = row[columnIndex]
            if (noteId) {
              return (
                <ToneButton
                  key={`${rowIndex}-${noteId}`}
                  noteId={noteId}
                  enabled={Boolean(toneState.get(noteId))}
                  toneLabelOverride={toneLabelOverrides?.[noteId]}
                  soloModeActive={soloModeActive}
                  onTonePress={onTonePress}
                  onToneLongPress={onToneLongPress}
                />
              )
            }
            return <div key={`grid-slot-${rowIndex}-${columnIndex}`} aria-hidden className="min-h-[36px]" />
          }),
        )}
      </div>
    </div>
  )
}
