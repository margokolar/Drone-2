import { loopSlotLabel, presetLoopSyncSlot } from '../audio/loopSlots'
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

/** Loop (audio slots) page. */
export function LoopPanel({
  onEnabledChange,
  onSyncChange,
  onSelectSlot,
  onPickFile,
  onClearFile,
}: LoopPanelProps) {
  const enabled = useDroneStore((state) => state.loopEnabled)
  const activePresetId = useDroneStore((state) => state.activePresetId)
  const presets = useDroneStore((state) => state.presets)
  const associatedSlot = presetLoopSyncSlot(presets.find((preset) => preset.id === activePresetId))
  const syncEnabled = associatedSlot != null
  const activeSlot = useDroneStore((state) => state.activeLoopSlot)
  const slots = useDroneStore((state) => state.loopSlots)
  const volumeDb = useDroneStore((state) => state.loopVolumeDb)
  const muted = useDroneStore((state) => state.loopMuted)
  const repeats = useDroneStore((state) => state.loopRepeatBySlot)
  const setVolumeDb = useDroneStore((state) => state.setLoopVolumeDb)
  const setMuted = useDroneStore((state) => state.setLoopMuted)
  const setSlotRepeat = useDroneStore((state) => state.setLoopSlotRepeat)

  return (
    <SectionCard
      title="Loop"
      className="[&>header]:mb-0"
      rightSlot={
        <LoopSyncButton
          enabled={syncEnabled}
          slot={associatedSlot}
          onClick={() => onSyncChange(!syncEnabled)}
          inactiveClassName="border-white/15 bg-white/5 text-white/55 hover:bg-white/10"
          ariaLabel={
            syncEnabled && associatedSlot != null
              ? `Disable loop sync for this preset (${loopSlotLabel(associatedSlot)})`
              : 'Sync loop start and stop with this preset'
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
        repeats={repeats}
        onEnabledChange={onEnabledChange}
        onSelectSlot={onSelectSlot}
        onPickFile={onPickFile}
        onClearFile={onClearFile}
        onVolumeChange={setVolumeDb}
        onMutedChange={setMuted}
        onRepeatChange={setSlotRepeat}
      />
    </SectionCard>
  )
}
