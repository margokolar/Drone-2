import { useDroneStore } from '../store/useDroneStore'
import { EntryGlideControls } from './EntryGlideControls'
import { FadeControls } from './FadeControls'

/** Play/pause fade + preset crossfade card, wired to the store. */
export function FadeSection() {
  const enabled = useDroneStore((state) => state.playbackFadeEnabled)
  const fadeInSeconds = useDroneStore((state) => state.playbackFadeInSeconds)
  const fadeOutSeconds = useDroneStore((state) => state.playbackFadeOutSeconds)
  const presetCrossfadeSeconds = useDroneStore((state) => state.presetCrossfadeSeconds)
  const toggleEnabled = useDroneStore((state) => state.togglePlaybackFadeEnabled)
  const setFadeInSeconds = useDroneStore((state) => state.setPlaybackFadeInSeconds)
  const setFadeOutSeconds = useDroneStore((state) => state.setPlaybackFadeOutSeconds)
  const setPresetCrossfadeSeconds = useDroneStore((state) => state.setPresetCrossfadeSeconds)
  return (
    <FadeControls
      enabled={enabled}
      fadeInSeconds={fadeInSeconds}
      fadeOutSeconds={fadeOutSeconds}
      presetCrossfadeSeconds={presetCrossfadeSeconds}
      onToggleEnabled={toggleEnabled}
      onFadeInSecondsChange={setFadeInSeconds}
      onFadeOutSecondsChange={setFadeOutSeconds}
      onPresetCrossfadeSecondsChange={setPresetCrossfadeSeconds}
    />
  )
}

/** Entry glide card for the lowest / highest tone, wired to the store. */
export function EntryGlideSection() {
  const enabled = useDroneStore((state) => state.entryGlideEnabled)
  const lowestCents = useDroneStore((state) => state.entryGlideLowestCents)
  const lowestSeconds = useDroneStore((state) => state.entryGlideLowestSeconds)
  const highestCents = useDroneStore((state) => state.entryGlideHighestCents)
  const highestSeconds = useDroneStore((state) => state.entryGlideHighestSeconds)
  const toggleEnabled = useDroneStore((state) => state.toggleEntryGlideEnabled)
  const setLowestCents = useDroneStore((state) => state.setEntryGlideLowestCents)
  const setLowestSeconds = useDroneStore((state) => state.setEntryGlideLowestSeconds)
  const setHighestCents = useDroneStore((state) => state.setEntryGlideHighestCents)
  const setHighestSeconds = useDroneStore((state) => state.setEntryGlideHighestSeconds)
  return (
    <EntryGlideControls
      enabled={enabled}
      lowestCents={lowestCents}
      lowestSeconds={lowestSeconds}
      highestCents={highestCents}
      highestSeconds={highestSeconds}
      onToggleEnabled={toggleEnabled}
      onLowestCentsChange={setLowestCents}
      onLowestSecondsChange={setLowestSeconds}
      onHighestCentsChange={setHighestCents}
      onHighestSecondsChange={setHighestSeconds}
    />
  )
}
