import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { ToneConfig } from '../audio/types'
import type { NoteId } from '../music/notes'
import { DEFAULT_MASTER_GAIN_DB } from '../presets/defaultPresets'
import { useDroneStore } from '../store/useDroneStore'
import type { ToneSetLayout } from '../toneSets/toneSetLayout'
import { NoteSelector } from './NoteSelector'
import { ResettableRangeInput } from './ResettableRangeInput'
import { SectionCard } from './SectionCard'
import { ToneMixer } from './ToneMixer'
import { TONE_MIXER_SECTION_ID } from './toneMixerIds'
import { TopControls } from './TopControls'
import { EntryGlideSection, FadeSection } from './ToneSettingsSections'

type TonePanelProps = {
  toneSetLayout: ToneSetLayout
  tones: ToneConfig[]
  tonesInToneSet: ToneConfig[]
  toneMixerTones: ToneConfig[]
  toneSelectionSoloMode: boolean
  shineEnabled: boolean
  shineVolume: number
  shineMotion: number
  shineOctaveIndex: number
  onTonePress: (noteId: NoteId) => void
  onToneLongPress: (noteId: NoteId) => void
  onShineToggle: () => void
  onShineLongPress: () => void
  onShineVolume: (volume: number) => void
  onShineMotion: (motion: number) => void
  onShineOctaveIndex: (index: number) => void
  onToggleToneSolo: (noteId: NoteId) => void
  onEditOvertones: (noteId: NoteId) => void
}

/** Tone page: tuning, note grid, master gain, mixer, fade and entry glide. */
export function TonePanel({
  toneSetLayout,
  tones,
  tonesInToneSet,
  toneMixerTones,
  toneSelectionSoloMode,
  shineEnabled,
  shineVolume,
  shineMotion,
  shineOctaveIndex,
  onTonePress,
  onToneLongPress,
  onShineToggle,
  onShineLongPress,
  onShineVolume,
  onShineMotion,
  onShineOctaveIndex,
  onToggleToneSolo,
  onEditOvertones,
}: TonePanelProps) {
  const [spatialExpanded, setSpatialExpanded] = useState(false)
  const referenceA4Hz = useDroneStore((state) => state.referenceA4Hz)
  const baseOctave = useDroneStore((state) => state.baseOctave)
  const tuningSystemId = useDroneStore((state) => state.tuningSystemId)
  const tonalCenter = useDroneStore((state) => state.tonalCenter)
  const masterGainDb = useDroneStore((state) => state.masterGainDb)
  const timbreBlend = useDroneStore((state) => state.timbreBlend)
  const nudgeReferenceA4Hz = useDroneStore((state) => state.nudgeReferenceA4Hz)
  const nudgeBaseOctave = useDroneStore((state) => state.nudgeBaseOctave)
  const setTuningSystemId = useDroneStore((state) => state.setTuningSystemId)
  const setTonalCenter = useDroneStore((state) => state.setTonalCenter)
  const setMasterGainDb = useDroneStore((state) => state.setMasterGainDb)
  const setToneGain = useDroneStore((state) => state.setToneGain)
  const setTonePan = useDroneStore((state) => state.setTonePan)
  const setToneDetune = useDroneStore((state) => state.setToneDetune)
  const setToneTimbreValue = useDroneStore((state) => state.setToneTimbreValue)

  return (
    <>
      <SectionCard title="Global controls" className="[&>header]:hidden">
        <div className="space-y-3">
          <TopControls
            referenceA4Hz={referenceA4Hz}
            baseOctave={baseOctave}
            tuningSystemId={tuningSystemId}
            tonalCenter={tonalCenter}
            onReferenceNudge={nudgeReferenceA4Hz}
            onBaseOctaveNudge={nudgeBaseOctave}
            onTuningSystemChange={setTuningSystemId}
            onTonalCenterChange={setTonalCenter}
          />
          <NoteSelector
            tones={tones}
            toneSetName={toneSetLayout.name}
            subOctaveIds={toneSetLayout.subOctaveIds}
            gridIds={toneSetLayout.gridIds}
            toneLabelOverrides={toneSetLayout.toneLabelOverrides}
            soloModeActive={toneSelectionSoloMode}
            onTonePress={onTonePress}
            onToneLongPress={onToneLongPress}
            shineActive={shineEnabled}
            onShineToggle={onShineToggle}
            onShineLongPress={onShineLongPress}
          />
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.16em] text-white/60">Master gain</span>
              <span className="text-xs tabular-nums text-white/70">{masterGainDb.toFixed(1)} dB</span>
            </div>
            <ResettableRangeInput
              min={-30}
              max={0}
              step={0.1}
              value={masterGainDb}
              onChange={(event) => setMasterGainDb(Number(event.target.value))}
              onReset={() => setMasterGainDb(DEFAULT_MASTER_GAIN_DB)}
              aria-label="Master gain. Double-click or double-tap to reset to default."
              className="h-1.5 w-full accent-fuchsia-300"
            />
          </div>
        </div>
      </SectionCard>
      <SectionCard
        id={TONE_MIXER_SECTION_ID}
        title="Tone mixer"
        titleAddon={
          <button
            type="button"
            className={`button-safe flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition ${
              spatialExpanded
                ? 'border-fuchsia-300/50 bg-fuchsia-300/15 text-fuchsia-100 hover:bg-fuchsia-300/25'
                : 'border-white/15 bg-white/5 text-white/70 hover:bg-white/10'
            }`}
            onClick={() => setSpatialExpanded((current) => !current)}
            aria-expanded={spatialExpanded}
            aria-controls={TONE_MIXER_SECTION_ID}
            aria-label={
              spatialExpanded
                ? 'Peida detune ja pan kõigil toonidel'
                : 'Näita detune ja pan kõigil toonidel'
            }
            title="Detune & Pan"
          >
            <ChevronDown
              size={14}
              className={`transition-transform${spatialExpanded ? ' rotate-180' : ''}`}
              aria-hidden
            />
          </button>
        }
      >
        <ToneMixer
          tones={toneMixerTones}
          allTones={tonesInToneSet}
          spatialExpanded={spatialExpanded}
          referenceA4Hz={referenceA4Hz}
          baseOctave={baseOctave}
          tuningSystemId={tuningSystemId}
          tonalCenter={tonalCenter}
          fallbackTimbreBlend={timbreBlend}
          shineEnabled={shineEnabled}
          shineVolume={shineVolume}
          shineMotion={shineMotion}
          shineOctaveIndex={shineOctaveIndex}
          onShineToggle={onShineToggle}
          onShineVolume={onShineVolume}
          onShineMotion={onShineMotion}
          onShineOctaveIndex={onShineOctaveIndex}
          onToneGain={setToneGain}
          onTonePan={setTonePan}
          onToneDetune={setToneDetune}
          onToneTimbreValue={setToneTimbreValue}
          onToggleToneSolo={onToggleToneSolo}
          onEditOvertones={onEditOvertones}
        />
      </SectionCard>
      <FadeSection />
      <EntryGlideSection />
    </>
  )
}
