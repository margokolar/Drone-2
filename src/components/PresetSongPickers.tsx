import { Copy } from 'lucide-react'
import type { ComponentProps } from 'react'
import { LibraryPickerMenu } from './LibraryPickerMenu'
import { triggerSaveFlash } from '../utils/saveFlash'

type PickerItems = ComponentProps<typeof LibraryPickerMenu>['items']

type PresetSongPickersProps = {
  selectedPresetKey: string
  presetItems: PickerItems
  onSelectPreset: (navigationKey: string) => void
  onSaveAsNewPreset: () => void
  selectedSongId: string
  songItems: PickerItems
  onSelectSong: (songId: string) => void
}

/** Preset + song dropdowns shown under the title bar on the Tone page. */
export function PresetSongPickers({
  selectedPresetKey,
  presetItems,
  onSelectPreset,
  onSaveAsNewPreset,
  selectedSongId,
  songItems,
  onSelectSong,
}: PresetSongPickersProps) {
  return (
    <div className="mx-auto mt-3 grid max-w-[26.5rem] grid-cols-2 gap-3 landscape:mt-0 max-h-[500px]:mt-0 md:max-w-[62.5rem]">
      <article className="relative min-w-0 overflow-hidden rounded-xl border border-fuchsia-300/45 bg-[#211a2d] p-3">
        <div className="mb-2 flex min-h-8 items-center gap-2">
          <h2 className="min-w-0 flex-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">
            Preset
          </h2>
          <button
            type="button"
            className="button-safe flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-[#2a2238] text-white/80 transition hover:bg-[#352a48]"
            onClick={(event) => {
              triggerSaveFlash(event.currentTarget)
              onSaveAsNewPreset()
            }}
            aria-label="Save as new preset"
          >
            <Copy size={15} />
          </button>
        </div>
        <LibraryPickerMenu
          selectedId={selectedPresetKey}
          items={presetItems}
          onSelect={onSelectPreset}
          appearance="select"
          openAriaLabel="Open preset list"
        />
      </article>
      <article className="relative min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#1a1825] p-3">
        <div className="mb-2 flex min-h-8 items-center gap-2">
          <h2 className="min-w-0 flex-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">
            Song
          </h2>
        </div>
        <LibraryPickerMenu
          selectedId={selectedSongId}
          items={songItems}
          onSelect={onSelectSong}
          appearance="select"
          dropdownAlign="end"
          openAriaLabel="Open song list"
        />
      </article>
    </div>
  )
}
