import { loopSlotLabel } from '../audio/loopSlots'
import { useDroneStore } from '../store/useDroneStore'
import { LoopControls } from './LoopControls'
import { LoopSyncButton } from './LoopSyncButton'
import { SectionCard } from './SectionCard'

type LoopControlsProps = Parameters<typeof LoopControls>[0]

type LoopPanelProps = {
  onEnabledChange: (enabled: boolean) => void
  onSyncChange: (enabled: boolean) => void
  onSelectSlot: LoopControlsProps['onSelectSlot']
  onPickFile: LoopControlsProps['onPickFile']
  onClearFile: LoopControlsProps['onClearFile']
}

/** Loop (WAV slots) page. */
export function LoopPanel({
  onEnabledChange,
  onSyncChange,
  onSelectSlot,
  onPickFile,
  onClearFile,
}: LoopPanelProps) {
  const enabled = useDroneStore((state) => state.loopEnabled)
  const syncEnabled = useDroneStore((state) => state.loopSyncEnabled)
  const activeSlot = useDroneStore((state) => state.activeLoopSlot)
  const slots = useDroneStore((state) => state.loopSlots)
  const volumeDb = useDroneStore((state) => state.loopVolumeDb)
  const muted = useDroneStore((state) => state.loopMuted)
  const setVolumeDb = useDroneStore((state) => state.setLoopVolumeDb)
  const setMuted = useDroneStore((state) => state.setLoopMuted)

  return (
    <SectionCard
      title="Loop"
      className="[&>header]:mb-0"
      rightSlot={
        <LoopSyncButton
          enabled={syncEnabled}
          slot={syncEnabled ? activeSlot : null}
          onClick={() => onSyncChange(!syncEnabled)}
          inactiveClassName="border-white/15 bg-white/5 text-white/55 hover:bg-white/10"
          ariaLabel={
            syncEnabled
              ? `Disable loop sync with drone transport play and pause (${loopSlotLabel(activeSlot)})`
              : 'Sync loop start and stop with drone transport play and pause'
          }
        />
      }
    >
      <LoopControls
        enabled={enabled}
        activeSlot={activeSlot}
        slots={slots}
        volumeDb={volumeDb}
        muted={muted}
        onEnabledChange={onEnabledChange}
        onSelectSlot={onSelectSlot}
        onPickFile={onPickFile}
        onClearFile={onClearFile}
        onVolumeChange={setVolumeDb}
        onMutedChange={setMuted}
      />
    </SectionCard>
  )
}
