import clsx from 'clsx'
import { Sparkles } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { METRONOME_LONG_PRESS_MS } from './ClickSyncButton'
import { MetronomeIcon } from './MetronomeIcon'
import { PlayPauseIcon } from './PlayPauseIcon'
import { SequenceListRow } from './SequenceListRow'

export type HomeScreenItem = {
  id: string
  name: string
  number: number
  isActive: boolean
  isTransport?: boolean
  metronomeSyncEnabled?: boolean
  metronomeLit?: boolean
  showMetronomeSync?: boolean
  metronomeBpm?: number
  shineEnabled?: boolean
}

type HomeScreenOverlayProps = {
  presetTitle: string
  isTransport: boolean
  songTitle: string
  presets: HomeScreenItem[]
  songs: HomeScreenItem[]
  onSelectPreset: (id: string) => void
  onSelectSong: (id: string) => void
  onToggleTransportMetronomeSync?: (id: string, enabled: boolean) => void
  onOpenClickTab?: () => void
  onOpenShineTab?: (id: string) => void
}

const boxClass =
  'home-screen-box flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#1a1825] px-3 py-3'

const boxLabelClass =
  'mb-1 shrink-0 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50'

const listClass =
  'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain'

const largeMetronomeButtonClass =
  'button-safe flex h-[0.58em] w-[0.58em] shrink-0 items-center justify-center overflow-visible'

function useScrollActiveIntoView(items: HomeScreenItem[]) {
  const listRef = useRef<HTMLDivElement>(null)
  const activeIndex = items.findIndex((item) => item.isActive)
  useEffect(() => {
    const row = listRef.current?.children[activeIndex]
    if (row instanceof HTMLElement) {
      row.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex])
  return listRef
}

export function HomeScreenOverlay({
  presetTitle,
  isTransport,
  songTitle,
  presets,
  songs,
  onSelectPreset,
  onSelectSong,
  onToggleTransportMetronomeSync,
  onOpenClickTab,
  onOpenShineTab,
}: HomeScreenOverlayProps) {
  const presetListRef = useScrollActiveIntoView(presets)
  const songListRef = useScrollActiveIntoView(songs)
  const metroLongPressTimerRef = useRef<number | null>(null)
  const metroLongPressFiredRef = useRef(false)
  const clearMetroLongPressTimer = () => {
    if (metroLongPressTimerRef.current !== null) {
      window.clearTimeout(metroLongPressTimerRef.current)
      metroLongPressTimerRef.current = null
    }
  }
  const activeItem = presets.find((item) => item.isActive)
  const largeMetroLit = activeItem?.metronomeLit ?? activeItem?.metronomeSyncEnabled === true
  const showLargeMetronome =
    Boolean(onToggleTransportMetronomeSync) &&
    activeItem?.metronomeSyncEnabled === true &&
    (activeItem.isTransport || activeItem.showMetronomeSync)
  const largeMetronomeCluster =
    showLargeMetronome && activeItem && onToggleTransportMetronomeSync ? (
      <>
        <button
          type="button"
          onPointerDown={() => {
            if (!onOpenClickTab) {
              return
            }
            metroLongPressFiredRef.current = false
            clearMetroLongPressTimer()
            metroLongPressTimerRef.current = window.setTimeout(() => {
              metroLongPressTimerRef.current = null
              metroLongPressFiredRef.current = true
              onOpenClickTab()
            }, METRONOME_LONG_PRESS_MS)
          }}
          onPointerUp={clearMetroLongPressTimer}
          onPointerLeave={clearMetroLongPressTimer}
          onPointerCancel={clearMetroLongPressTimer}
          onClick={() => {
            if (metroLongPressFiredRef.current) {
              metroLongPressFiredRef.current = false
              return
            }
            onToggleTransportMetronomeSync(activeItem.id, false)
          }}
          className={clsx(
            largeMetronomeButtonClass,
            largeMetroLit ? 'text-fuchsia-100' : 'text-white/40',
          )}
          aria-pressed="true"
          aria-label={
            `${
              activeItem.isTransport
                ? 'Disable click sync for this play/pause marker'
                : 'Disable click sync for this preset'
            }${onOpenClickTab ? '. Long-press to open Click.' : ''}`
          }
        >
          <MetronomeIcon className="h-full w-full" />
        </button>
        {activeItem.metronomeBpm != null ? (
          <span
            className={clsx(
              'flex h-[0.58em] shrink-0 items-center text-[0.58em] font-bold tabular-nums leading-none',
              largeMetroLit ? 'text-fuchsia-100' : 'text-white/40',
            )}
          >
            {Math.round(activeItem.metronomeBpm)}
          </span>
        ) : null}
      </>
    ) : null
  const showLargeShine =
    Boolean(onOpenShineTab) &&
    activeItem != null &&
    !activeItem.isTransport &&
    activeItem.shineEnabled === true
  const largeShineButton =
    showLargeShine && activeItem && onOpenShineTab ? (
      <button
        type="button"
        onClick={() => onOpenShineTab(activeItem.id)}
        className="button-safe flex h-[0.58em] w-[0.58em] shrink-0 items-center justify-center text-cyan-100"
        aria-label="Open Shine. Shine is on."
      >
        <Sparkles className="h-full w-full" strokeWidth={2} aria-hidden />
      </button>
    ) : null

  return (
    <div className="home-screen-overlay flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className={boxClass}>
        <div className={boxLabelClass}>Preset</div>
        <div className="home-screen-preset-name h-[1em] shrink-0 text-[6rem] text-white">
          {isTransport ? (
            <div className="flex h-full items-center justify-center gap-[0.18em]">
              <PlayPauseIcon className="h-[1em] w-auto shrink-0" />
              {largeMetronomeCluster}
            </div>
          ) : (
            <div className="flex h-full min-w-0 items-center justify-center gap-[0.18em]">
              <div className="min-w-0 truncate text-center font-bold leading-none tracking-tight">
                {presetTitle}
              </div>
              {largeShineButton}
              {largeMetronomeCluster}
            </div>
          )}
        </div>
        <div ref={presetListRef} className={`home-screen-list mt-3 ${listClass}`}>
          {presets.map((item) => (
            <SequenceListRow
              key={`preset-${item.id}`}
              number={item.number}
              name={item.name}
              isActive={item.isActive}
              isTransport={item.isTransport}
              metronomeSyncEnabled={item.metronomeSyncEnabled}
              metronomeLit={item.metronomeLit}
              metronomeBpm={item.metronomeBpm}
              shineEnabled={item.shineEnabled}
              onSelect={() => onSelectPreset(item.id)}
              onToggleMetronomeSync={
                onToggleTransportMetronomeSync && (item.isTransport || item.showMetronomeSync)
                  ? () => onToggleTransportMetronomeSync(item.id, !item.metronomeSyncEnabled)
                  : undefined
              }
              onLongPressMetronome={
                onOpenClickTab && (item.isTransport || item.showMetronomeSync)
                  ? onOpenClickTab
                  : undefined
              }
              onOpenShine={
                onOpenShineTab && !item.isTransport && item.shineEnabled
                  ? () => onOpenShineTab(item.id)
                  : undefined
              }
            />
          ))}
        </div>
      </div>
      <div className={boxClass}>
        <div className={boxLabelClass}>Song</div>
        <div className="home-screen-song-name h-[1.25em] shrink-0 text-[3rem] text-cyan-100/90">
          <div className="h-full w-full truncate pb-[0.25em] text-center font-semibold leading-none tracking-tight">
            {songTitle}
          </div>
        </div>
        <div ref={songListRef} className={`home-screen-list mt-3 ${listClass}`}>
          {songs.map((item) => (
            <SequenceListRow
              key={`song-${item.id}`}
              number={item.number}
              name={item.name}
              isActive={item.isActive}
              accent="cyan"
              onSelect={() => onSelectSong(item.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
