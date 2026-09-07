import { useMemo, useState } from 'react'
import { ClipboardPaste } from 'lucide-react'
import type { Preset } from '../presets/defaultPresets'

type SongEntry = {
  id: string
  name: string
  presets: Preset[]
}

type ImportPresetsFromSongProps = {
  songName: string
  songLibrary: SongEntry[]
  onImport: (sourceSongId: string, sourcePresetIds: string[]) => void
}

export function ImportPresetsFromSong({
  songName,
  songLibrary,
  onImport,
}: ImportPresetsFromSongProps) {
  const [open, setOpen] = useState(false)
  const [sourceSongId, setSourceSongId] = useState('')
  const [selectedPresetIds, setSelectedPresetIds] = useState<Set<string>>(() => new Set())

  const otherSongs = useMemo(
    () => songLibrary.filter((song) => song.name !== songName && song.presets.length > 0),
    [songLibrary, songName],
  )

  const sourceSong = otherSongs.find((song) => song.id === sourceSongId) ?? otherSongs[0]

  const togglePreset = (presetId: string) => {
    setSelectedPresetIds((current) => {
      const next = new Set(current)
      if (next.has(presetId)) {
        next.delete(presetId)
      } else {
        next.add(presetId)
      }
      return next
    })
  }

  const handleOpen = () => {
    const first = otherSongs[0]
    if (!first) {
      return
    }
    setSourceSongId(first.id)
    setSelectedPresetIds(new Set())
    setOpen(true)
  }

  if (otherSongs.length === 0) {
    return null
  }

  return (
    <div className="mb-2 shrink-0">
      <button
        type="button"
        className="button-safe flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/85 transition hover:bg-white/10"
        onClick={() => (open ? setOpen(false) : handleOpen())}
      >
        <ClipboardPaste size={14} />
        From other song
      </button>
      {open ? (
        <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-[#1b1827] p-2">
          <label className="block text-[11px] text-white/55">
            Source song
            <select
              value={sourceSong?.id ?? ''}
              onChange={(event) => {
                setSourceSongId(event.target.value)
                setSelectedPresetIds(new Set())
              }}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#14121c] px-2 py-1.5 text-sm text-white"
            >
              {otherSongs.map((song) => (
                <option key={song.id} value={song.id}>
                  {song.name}
                </option>
              ))}
            </select>
          </label>
          <div className="max-h-40 space-y-1 overflow-y-auto overscroll-contain">
            {sourceSong?.presets.map((preset) => {
              const checked = selectedPresetIds.has(preset.id)
              return (
                <label
                  key={preset.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-white/90 hover:bg-white/5"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePreset(preset.id)}
                    className="h-4 w-4 rounded border-white/20 bg-[#14121c]"
                  />
                  <span className="truncate">{preset.name}</span>
                </label>
              )
            })}
          </div>
          <button
            type="button"
            disabled={selectedPresetIds.size === 0}
            className="button-safe w-full rounded-lg border border-fuchsia-300/40 bg-fuchsia-300/15 px-3 py-2 text-sm text-fuchsia-100 transition hover:bg-fuchsia-300/25 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => {
              if (!sourceSong || selectedPresetIds.size === 0) {
                return
              }
              onImport(sourceSong.id, [...selectedPresetIds])
              setOpen(false)
              setSelectedPresetIds(new Set())
            }}
          >
            Add to this song
          </button>
          <p className="text-[11px] leading-relaxed text-white/45">
            Copies presets into the current song. Edit here later without changing the source song.
          </p>
        </div>
      ) : null}
    </div>
  )
}
