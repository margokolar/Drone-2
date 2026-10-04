import { activateTransportMarker, applyClickSyncForPreset } from '../audio/presetNavigationTransport'
import { useDroneStore } from '../store/useDroneStore'
import { PRESETS_SECTION_CARD_ID } from '../utils/scrollBelowStickyChrome'
import { ImportPresetsFromSong } from './ImportPresetsFromSong'
import { PresetList } from './PresetList'
import { SectionCard } from './SectionCard'
import { SongList } from './SongList'

type PresetsPanelProps = {
  onLoadSong: (songId: string) => void
  onSetTransportMetronomeSync: (markerId: string, enabled: boolean) => void
  onSetPresetMetronomeSync: (presetId: string, enabled: boolean) => void
  onSetPresetLoopSync: (presetId: string) => void
}

/** Presets page: preset / play-pause marker list on the left, song library on the right. */
export function PresetsPanel({
  onLoadSong,
  onSetTransportMetronomeSync,
  onSetPresetMetronomeSync,
  onSetPresetLoopSync,
}: PresetsPanelProps) {
  const songName = useDroneStore((state) => state.songName)
  const songLibrary = useDroneStore((state) => state.songLibrary)
  const presets = useDroneStore((state) => state.presets)
  const presetNavigation = useDroneStore((state) => state.presetNavigation)
  const activeNavigationKey = useDroneStore((state) => state.activeNavigationKey)
  const activePresetId = useDroneStore((state) => state.activePresetId)
  const loadPreset = useDroneStore((state) => state.loadPreset)
  const importPresetsFromSong = useDroneStore((state) => state.importPresetsFromSong)
  const renamePreset = useDroneStore((state) => state.renamePreset)
  const duplicatePreset = useDroneStore((state) => state.duplicatePreset)
  const deletePreset = useDroneStore((state) => state.deletePreset)
  const moveNavigationEntry = useDroneStore((state) => state.moveNavigationEntry)
  const togglePresetNavigationEnabled = useDroneStore((state) => state.togglePresetNavigationEnabled)
  const insertTransportMarkerAfter = useDroneStore((state) => state.insertTransportMarkerAfter)
  const deleteTransportMarker = useDroneStore((state) => state.deleteTransportMarker)
  const toggleTransportMarkerNavigationEnabled = useDroneStore(
    (state) => state.toggleTransportMarkerNavigationEnabled,
  )
  const renameSongInLibrary = useDroneStore((state) => state.renameSongInLibrary)
  const duplicateSongInLibrary = useDroneStore((state) => state.duplicateSongInLibrary)
  const deleteSongFromLibrary = useDroneStore((state) => state.deleteSongFromLibrary)
  const moveSongInLibrary = useDroneStore((state) => state.moveSongInLibrary)
  const toggleSongNavigationEnabled = useDroneStore((state) => state.toggleSongNavigationEnabled)

  return (
    <SectionCard
      id={PRESETS_SECTION_CARD_ID}
      title="Presets"
      className="flex min-h-0 flex-1 flex-col overflow-hidden [&>header]:mb-3 [&>header]:shrink-0"
    >
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
        <section className="flex min-h-0 min-w-0 flex-col">
          <h3 className="mb-2 shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
            Presets
          </h3>
          <div className="presets-column-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <ImportPresetsFromSong
              songName={songName}
              songLibrary={songLibrary}
              onImport={importPresetsFromSong}
            />
            <PresetList
              presets={presets}
              presetNavigation={presetNavigation}
              activeNavigationKey={activeNavigationKey}
              activePresetId={activePresetId}
              onLoadPreset={(presetId) => {
                loadPreset(presetId)
                applyClickSyncForPreset(presetId)
              }}
              onRenamePreset={renamePreset}
              onDuplicatePreset={duplicatePreset}
              onDeletePreset={deletePreset}
              onMoveNavigationEntry={moveNavigationEntry}
              onToggleNavigationEnabled={togglePresetNavigationEnabled}
              onInsertTransportAfter={insertTransportMarkerAfter}
              onDeleteTransportMarker={deleteTransportMarker}
              onToggleTransportNavigationEnabled={toggleTransportMarkerNavigationEnabled}
              onSetTransportMetronomeSync={onSetTransportMetronomeSync}
              onSetPresetMetronomeSync={onSetPresetMetronomeSync}
              onSetPresetLoopSync={onSetPresetLoopSync}
              onActivateTransport={activateTransportMarker}
            />
          </div>
        </section>
        <section className="flex min-h-0 min-w-0 flex-col">
          <h3 className="mb-2 shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
            Songs
          </h3>
          <div className="presets-column-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <SongList
              songName={songName}
              songLibrary={songLibrary}
              onLoadSong={onLoadSong}
              onRenameSong={renameSongInLibrary}
              onDuplicateSong={duplicateSongInLibrary}
              onDeleteSong={deleteSongFromLibrary}
              onMoveSong={moveSongInLibrary}
              onToggleNavigationEnabled={toggleSongNavigationEnabled}
            />
          </div>
        </section>
      </div>
    </SectionCard>
  )
}
