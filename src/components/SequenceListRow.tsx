import clsx from 'clsx'
import { Sparkles } from 'lucide-react'
import { ClickSyncButton } from './ClickSyncButton'
import { PlayPauseIcon } from './PlayPauseIcon'
import { PLAY_PAUSE_SEQUENCE_LABEL } from '../utils/nowPlayingLabels'

/** Preset-list BPM column width: three tabular digits, measured as 444. */
const LIST_BPM_WIDTH_SAMPLE = '444'

type SequenceListRowProps = {
  number: number
  name: string
  isActive: boolean
  isTransport?: boolean
  metronomeSyncEnabled?: boolean
  metronomeLit?: boolean
  metronomeBpm?: number
  shineEnabled?: boolean
  accent?: 'amber' | 'cyan'
  onSelect?: () => void
  onToggleMetronomeSync?: () => void
  onLongPressMetronome?: () => void
}

export function SequenceListRow({
  number,
  name,
  isActive,
  isTransport = false,
  metronomeSyncEnabled = false,
  metronomeLit,
  metronomeBpm,
  shineEnabled = false,
  accent = 'amber',
  onSelect,
  onToggleMetronomeSync,
  onLongPressMetronome,
}: SequenceListRowProps) {
  const showTransport = isTransport || name === PLAY_PAUSE_SEQUENCE_LABEL
  const metroLit = metronomeLit ?? metronomeSyncEnabled
  const rowClass = clsx(
    'home-screen-row flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5',
    isActive
      ? accent === 'cyan'
        ? 'border-cyan-300/70 bg-cyan-300/15'
        : 'border-amber-300/70 bg-amber-300/15'
      : 'border-white/10 bg-white/5',
  )
  const content = (
    <>
      <span
        className={clsx(
          'home-screen-row-label w-8 shrink-0 text-center text-[1.65rem] font-bold tabular-nums leading-none',
          isActive ? (accent === 'cyan' ? 'text-cyan-200' : 'text-amber-200') : 'text-white/40',
        )}
      >
        {number}
      </span>
      {showTransport ? (
        <span
          className={clsx(
            'home-screen-row-label flex min-w-0 items-center text-[1.65rem]',
            isActive ? (accent === 'cyan' ? 'text-cyan-100' : 'text-amber-100') : 'text-white/75',
          )}
        >
          <PlayPauseIcon matchCap className="shrink-0" />
        </span>
      ) : (
        <span
          className={clsx(
            'home-screen-row-label min-w-0 truncate text-[1.65rem] font-semibold leading-[1.2]',
            isActive ? 'text-white' : 'text-white/75',
          )}
        >
          {name}
        </span>
      )}
    </>
  )
  const shineMark =
    shineEnabled && !showTransport ? (
      <span
        className={clsx(
          'flex h-[22px] w-[22px] shrink-0 items-center justify-center',
          isActive ? 'text-cyan-200' : 'text-cyan-200/75',
        )}
        title="Shine"
        aria-label="Shine on"
      >
        <Sparkles size={22} strokeWidth={2} aria-hidden />
      </span>
    ) : null
  const bpmSlot =
    !showTransport && (onToggleMetronomeSync || shineMark) ? (
      <span
        className={clsx(
          'relative flex h-[22px] shrink-0 items-center justify-end text-[22px] font-semibold tabular-nums leading-none',
          onToggleMetronomeSync && metronomeBpm != null
            ? metronomeSyncEnabled
              ? isActive
                ? 'text-fuchsia-100'
                : 'text-fuchsia-100/75'
              : 'text-white/40'
            : 'text-transparent',
        )}
      >
        <span className="invisible select-none" aria-hidden>
          {LIST_BPM_WIDTH_SAMPLE}
        </span>
        {onToggleMetronomeSync && metronomeBpm != null ? (
          <span className="absolute inset-0 flex items-center justify-end">{Math.round(metronomeBpm)}</span>
        ) : null}
      </span>
    ) : null
  const trailingCluster =
    shineMark || onToggleMetronomeSync ? (
      <div className="ml-auto flex h-9 shrink-0 items-center gap-1.5">
        {shineMark}
        {bpmSlot}
        {onToggleMetronomeSync ? (
          <ClickSyncButton
            enabled={metroLit}
            onClick={(event) => {
              event.stopPropagation()
              onToggleMetronomeSync()
            }}
            onLongPress={onLongPressMetronome}
            inactiveClassName={
              isActive
                ? 'border-white/20 bg-white/10 text-white/70'
                : 'border-white/10 bg-white/5 text-white/55'
            }
            ariaLabel={
              `${
                metronomeSyncEnabled
                  ? showTransport
                    ? 'Disable click sync for this play/pause marker'
                    : 'Disable click sync for this preset'
                  : showTransport
                    ? 'Sync click start and stop with this play/pause marker'
                    : 'Sync click start and stop with this preset'
              }${onLongPressMetronome ? '. Long-press to open Click.' : ''}`
            }
          />
        ) : (
          <span className="size-9 shrink-0" aria-hidden />
        )}
      </div>
    ) : null

  if (onSelect) {
    if (onToggleMetronomeSync) {
      return (
        <div className={rowClass}>
          <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={onSelect}>
            {content}
          </button>
          {trailingCluster}
        </div>
      )
    }
    return (
      <button type="button" className={clsx(rowClass, 'w-full text-left')} onClick={onSelect}>
        {content}
        {trailingCluster}
      </button>
    )
  }
  return (
    <div className={rowClass}>
      {content}
      {trailingCluster}
    </div>
  )
}
