import { useDroneStore } from '../store/useDroneStore'
import { ClickSyncButton } from './ClickSyncButton'
import { MetronomeControls } from './MetronomeControls'
import { SectionCard } from './SectionCard'

type ClickPanelProps = {
  onEnabledChange: (enabled: boolean) => void
  onSyncChange: (enabled: boolean) => void
}

/** Click (metronome) page. */
export function ClickPanel({ onEnabledChange, onSyncChange }: ClickPanelProps) {
  const enabled = useDroneStore((state) => state.metronomeEnabled)
  const syncEnabled = useDroneStore((state) => state.metronomeSyncEnabled)
  const bpm = useDroneStore((state) => state.metronomeBpm)
  const volumeDb = useDroneStore((state) => state.metronomeVolumeDb)
  const muted = useDroneStore((state) => state.metronomeMuted)
  const setBpm = useDroneStore((state) => state.setMetronomeBpm)
  const setVolumeDb = useDroneStore((state) => state.setMetronomeVolumeDb)
  const setMuted = useDroneStore((state) => state.setMetronomeMuted)

  return (
    <SectionCard
      title="Click"
      className="[&>header]:mb-0"
      rightSlot={
        <ClickSyncButton
          enabled={syncEnabled}
          onClick={() => onSyncChange(!syncEnabled)}
          inactiveClassName="border-white/15 bg-white/5 text-white/55 hover:bg-white/10"
          ariaLabel={
            syncEnabled
              ? 'Disable click sync with drone transport play and pause'
              : 'Sync click start and stop with drone transport play and pause'
          }
        />
      }
    >
      <MetronomeControls
        enabled={enabled}
        bpm={bpm}
        volumeDb={volumeDb}
        muted={muted}
        onEnabledChange={onEnabledChange}
        onBpmChange={setBpm}
        onVolumeChange={setVolumeDb}
        onMutedChange={setMuted}
      />
    </SectionCard>
  )
}
