import { Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { useRef, type ChangeEvent } from 'react'
import { LOOP_SLOTS, loopSlotLabel, type LoopSlot, type LoopSlotFiles } from '../audio/loopSlots'
import {
  DEFAULT_METRONOME_VOLUME_DB,
  MAX_METRONOME_VOLUME_DB,
  MIN_METRONOME_VOLUME_DB,
} from '../presets/defaultPresets'
import { ResettableRangeInput } from './ResettableRangeInput'

type LoopControlsProps = {
  enabled: boolean
  activeSlot: LoopSlot
  slots: LoopSlotFiles
  volumeDb: number
  muted: boolean
  onEnabledChange: (enabled: boolean) => void
  onSelectSlot: (slot: LoopSlot) => void
  onPickFile: (file: File) => void
  onClearFile: () => void
  onVolumeChange: (db: number) => void
  onMutedChange: (muted: boolean) => void
}

export function LoopControls({
  enabled,
  activeSlot,
  slots,
  volumeDb,
  muted,
  onEnabledChange,
  onSelectSlot,
  onPickFile,
  onClearFile,
  onVolumeChange,
  onMutedChange,
}: LoopControlsProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const fileName = slots[activeSlot - 1]
  const hasFile = Boolean(fileName)

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      onPickFile(file)
    }
    event.target.value = ''
  }

  let powerButtonClass =
    'flex h-16 w-16 shrink-0 items-center justify-center rounded-full border text-white shadow-sm'
  if (enabled) {
    powerButtonClass +=
      ' border-emerald-300/80 bg-emerald-300/30 text-emerald-50 shadow-[0_0_0_1px_rgba(110,231,183,0.35)]'
  } else {
    powerButtonClass += ' border-white/25 bg-white/10 text-white/90 transition hover:bg-white/15'
  }

  return (
    <div>
      <div className="flex justify-center pb-9">
        <button
          type="button"
          className={`${powerButtonClass} transition-[transform,background-color,box-shadow,border-color] duration-75`}
          onClick={() => onEnabledChange(!enabled)}
          disabled={!hasFile}
          aria-label={enabled ? 'Stop loop' : 'Start loop'}
        >
          {enabled ? <Pause size={30} /> : <Play size={30} />}
        </button>
      </div>

      <div className="space-y-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="mb-2 text-sm text-white/70">Loop slots</div>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {LOOP_SLOTS.map((slot) => {
              const slotFile = slots[slot - 1]
              const isActive = slot === activeSlot
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => onSelectSlot(slot)}
                  className={`button-safe flex min-h-11 flex-col items-center justify-center rounded-md border px-2 py-1.5 transition ${
                    isActive
                      ? 'border-emerald-300/70 bg-emerald-300/20 text-emerald-50'
                      : slotFile
                        ? 'border-white/20 bg-white/10 text-white/85 hover:bg-white/15'
                        : 'border-white/10 bg-white/5 text-white/45 hover:bg-white/10'
                  }`}
                  aria-pressed={isActive}
                  aria-label={`${loopSlotLabel(slot)}${slotFile ? `, ${slotFile}` : ', empty'}`}
                >
                  <span className="text-sm font-semibold leading-none">{loopSlotLabel(slot)}</span>
                  <span className="mt-1 max-w-full truncate text-[10px] leading-none text-current/80">
                    {slotFile ?? 'Empty'}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mb-3 min-h-6 truncate text-sm text-white/90">
            {fileName ?? 'No WAV loaded'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="button-safe min-h-11 rounded-md border border-white/15 bg-white/10 px-3 text-sm font-medium text-white/85 transition hover:bg-white/15"
              onClick={() => fileInputRef.current?.click()}
            >
              {hasFile ? 'Replace WAV' : 'Load WAV'}
            </button>
            {hasFile ? (
              <button
                type="button"
                className="button-safe min-h-11 rounded-md border border-red-300/40 bg-red-300/10 px-3 text-sm font-medium text-red-100 transition hover:bg-red-300/20"
                onClick={onClearFile}
              >
                Remove
              </button>
            ) : null}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".wav,audio/wav,audio/x-wav,audio/wave,audio/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-white/70">Loop volume</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition ${
                  muted
                    ? 'border-emerald-300/70 bg-emerald-300/20 text-emerald-50'
                    : 'border-white/15 bg-white/10 text-white/80 hover:bg-white/15'
                }`}
                onClick={() => onMutedChange(!muted)}
                aria-pressed={muted}
                aria-label={muted ? 'Unmute loop' : 'Mute loop'}
              >
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                {muted ? 'Muted' : 'Mute'}
              </button>
              <span className={`tabular-nums ${muted ? 'text-white/40' : 'text-white/85'}`}>
                {volumeDb.toFixed(1)} dB
              </span>
            </div>
          </div>
          <ResettableRangeInput
            min={MIN_METRONOME_VOLUME_DB}
            max={MAX_METRONOME_VOLUME_DB}
            step={0.1}
            value={volumeDb}
            disabled={muted}
            onChange={(event) => onVolumeChange(Number(event.target.value))}
            onReset={() => onVolumeChange(DEFAULT_METRONOME_VOLUME_DB)}
            aria-label="Loop volume. Double-click or double-tap to reset to default."
            className={`h-2 w-full accent-emerald-300 ${muted ? 'cursor-not-allowed opacity-40' : ''}`}
          />
        </div>
      </div>
    </div>
  )
}
