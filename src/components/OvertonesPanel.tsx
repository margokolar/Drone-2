import { AudioWaveform, Globe } from 'lucide-react'
import type { PartialConfig, TimbreBlend } from '../audio/types'
import type { NoteId } from '../music/notes'
import { OvertoneBars } from './OvertoneBars'
import {
  OvertoneClipboardButtons,
  OvertoneHistoryButtons,
  type OvertoneEditActions,
} from './OvertoneEditButtons'
import { OvertoneAllSoloButton, OvertoneToneNavControls } from './OvertoneToneNavControls'
import { overtoneControlButtonSizeClass } from './overtoneControlStyles'
import { PartialEditor } from './PartialEditor'
import { SectionCard } from './SectionCard'
import { TimbreMorphSlider } from './TimbreMorphSlider'

type OvertoneToneNav = {
  selectedNoteId: NoteId
  isSolo: boolean
  canNavigate: boolean
  soloAriaLabel: string
  onToggleSolo: () => void
  onPrevious: () => void
  onNext: () => void
}

type OvertonesPanelProps = {
  globalEditEnabled: boolean
  onToggleGlobalEdit: () => void
  isAllTonesCompareActive: boolean
  onToggleAllTonesCompare: () => void
  toneNav: OvertoneToneNav
  onGoToToneMixer: (noteId: NoteId) => void
  editActions: OvertoneEditActions
  partials: PartialConfig[]
  timbreBlend: TimbreBlend
  harmonicTimbreEnabled: boolean
  onPartialGainChange: (partialId: string, gainDb: number) => void
  onBarEnabledChange: (partialId: string, enabled: boolean) => void
  onPartialEnabledChange: (partialId: string, enabled: boolean) => void
  onPartialGainDragStart: () => void
  onAnalyzeAudio: () => void
  onSetTimbreValue: (key: 'sine' | 'saw' | 'square', value: number) => void
  onTimbreChangeStart: () => void
  onTimbreChangeEnd: () => void
  referenceFrequencyHz: number | null
  onSetPartialRatio: (partialId: string, ratio: number) => void
  onAddPartial: () => void
  onRemovePartial: (partialId: string) => void
}

function OvertonePortraitNav({
  toneNav,
  isAllTonesCompareActive,
  onToggleAllTonesCompare,
  onGoToToneMixer,
  editActions,
}: {
  toneNav: OvertoneToneNav
  isAllTonesCompareActive: boolean
  onToggleAllTonesCompare: () => void
  onGoToToneMixer: (noteId: NoteId) => void
  editActions: OvertoneEditActions
}) {
  return (
    <div className="flex w-full min-w-0 flex-col items-end gap-1.5 landscape:hidden max-h-[500px]:hidden">
      <div className="flex items-center gap-2">
        <OvertoneAllSoloButton
          variant="portrait-solo"
          isActive={isAllTonesCompareActive}
          onClick={onToggleAllTonesCompare}
        />
        <OvertoneToneNavControls
          variant="portrait-solo"
          toneNoteId={toneNav.selectedNoteId}
          isSolo={toneNav.isSolo}
          canNavigate={toneNav.canNavigate}
          soloAriaLabel={toneNav.soloAriaLabel}
          onToggleSolo={toneNav.onToggleSolo}
          onPrevious={toneNav.onPrevious}
          onNext={toneNav.onNext}
          onGoToToneMixer={onGoToToneMixer}
        />
      </div>
      <div className="hide-scrollbar -mx-0.5 flex overflow-x-auto">
        <div className="flex min-w-full items-center justify-between gap-9 px-0.5">
          <div className="flex shrink-0 items-center gap-1">
            <OvertoneHistoryButtons variant="portrait-solo" actions={editActions} />
          </div>
          <OvertoneToneNavControls
            variant="portrait-steps"
            toneNoteId={toneNav.selectedNoteId}
            isSolo={toneNav.isSolo}
            canNavigate={toneNav.canNavigate}
            soloAriaLabel={toneNav.soloAriaLabel}
            onToggleSolo={toneNav.onToggleSolo}
            onPrevious={toneNav.onPrevious}
            onNext={toneNav.onNext}
          />
        </div>
      </div>
    </div>
  )
}

/** Landscape overtone tools shown in the bottom nav instead of section tabs. */
export function OvertonesLandscapeToolbar({
  editActions,
  isAllTonesCompareActive,
  onToggleAllTonesCompare,
  toneNav,
}: {
  editActions: OvertoneEditActions
  isAllTonesCompareActive: boolean
  onToggleAllTonesCompare: () => void
  toneNav: OvertoneToneNav
}) {
  return (
    <div className="hidden w-full min-w-0 items-center gap-1.5 landscape:flex max-h-[500px]:flex">
      <div className="flex shrink-0 items-center gap-1.5">
        <OvertoneHistoryButtons variant="landscape-inline" actions={editActions} />
        <OvertoneClipboardButtons variant="landscape-inline" actions={editActions} />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <OvertoneAllSoloButton
          variant="landscape-inline"
          isActive={isAllTonesCompareActive}
          onClick={onToggleAllTonesCompare}
        />
        <OvertoneToneNavControls
          variant="landscape-inline"
          toneNoteId={toneNav.selectedNoteId}
          isSolo={toneNav.isSolo}
          canNavigate={toneNav.canNavigate}
          soloAriaLabel={toneNav.soloAriaLabel}
          onToggleSolo={toneNav.onToggleSolo}
          onPrevious={toneNav.onPrevious}
          onNext={toneNav.onNext}
        />
      </div>
    </div>
  )
}

/** Timbre page: overtone graph, copy/paste tools, analysis, and partial editor. */
export function OvertonesPanel({
  globalEditEnabled,
  onToggleGlobalEdit,
  isAllTonesCompareActive,
  onToggleAllTonesCompare,
  toneNav,
  onGoToToneMixer,
  editActions,
  partials,
  timbreBlend,
  harmonicTimbreEnabled,
  onPartialGainChange,
  onBarEnabledChange,
  onPartialEnabledChange,
  onPartialGainDragStart,
  onAnalyzeAudio,
  onSetTimbreValue,
  onTimbreChangeStart,
  onTimbreChangeEnd,
  referenceFrequencyHz,
  onSetPartialRatio,
  onAddPartial,
  onRemovePartial,
}: OvertonesPanelProps) {
  return (
    <>
      <div className="landscape:flex landscape:items-end landscape:gap-2 max-h-[500px]:flex max-h-[500px]:items-end max-h-[500px]:gap-2">
        <SectionCard
          title="Overtones"
          titleAddon={
            <button
              type="button"
              className={`button-safe flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition ${
                globalEditEnabled
                  ? 'border-cyan-300/60 bg-cyan-400/15 text-cyan-200 hover:bg-cyan-400/25'
                  : 'border-white/15 bg-white/5 text-white/80 opacity-40 hover:bg-white/10'
              }`}
              onClick={onToggleGlobalEdit}
              title="Global overtone edit"
              aria-label="Toggle global overtone edit"
              aria-pressed={globalEditEnabled}
            >
              <Globe size={14} aria-hidden />
            </button>
          }
          className="landscape:min-w-0 landscape:flex-1 landscape:p-2 landscape:[&>header]:hidden max-h-[500px]:min-w-0 max-h-[500px]:flex-1 max-h-[500px]:p-2 max-h-[500px]:[&>header]:hidden [&>header]:mb-2"
          rightSlot={
            <OvertonePortraitNav
              toneNav={toneNav}
              isAllTonesCompareActive={isAllTonesCompareActive}
              onToggleAllTonesCompare={onToggleAllTonesCompare}
              onGoToToneMixer={onGoToToneMixer}
              editActions={editActions}
            />
          }
        >
          <OvertoneBars
            partials={partials}
            timbreBlend={timbreBlend}
            harmonicTimbreEnabled={harmonicTimbreEnabled}
            onGainChange={onPartialGainChange}
            onGainDragStart={onPartialGainDragStart}
            onToggleEnabled={onBarEnabledChange}
          />
          <div className="mt-2 flex items-center gap-1 landscape:hidden max-h-[500px]:hidden">
            <div className="flex shrink-0 items-center gap-1">
              <OvertoneClipboardButtons variant="portrait-solo" actions={editActions} />
            </div>
            <button
              type="button"
              className={`button-safe ml-auto flex shrink-0 touch-manipulation items-center gap-1 rounded-lg border border-white/15 bg-white/5 text-xs font-semibold text-white/85 transition hover:bg-white/10 ${overtoneControlButtonSizeClass('portrait-solo')}`}
              onClick={onAnalyzeAudio}
              aria-label="Choose audio file for overtone analysis"
            >
              <AudioWaveform size={16} />
              Analyse audio
            </button>
          </div>
          <div className="mt-3">
            <TimbreMorphSlider
              variant="mixer"
              timbreBlend={timbreBlend}
              onSetTimbreValue={onSetTimbreValue}
              onTimbreChangeStart={onTimbreChangeStart}
              onTimbreChangeEnd={onTimbreChangeEnd}
            />
          </div>
        </SectionCard>
      </div>
      <SectionCard title="Partials">
        <PartialEditor
          partials={partials}
          referenceFrequencyHz={referenceFrequencyHz}
          onSetPartialEnabled={onPartialEnabledChange}
          onSetPartialRatio={onSetPartialRatio}
          onSetPartialGain={onPartialGainChange}
          onAddPartial={onAddPartial}
          onRemovePartial={onRemovePartial}
        />
      </SectionCard>
    </>
  )
}
