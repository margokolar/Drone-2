import { ArrowDown, ArrowUp, ChevronDown, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

type SongEntry = {
  id: string
  name: string
}

type SongLibraryMenuProps = {
  songName: string
  songLibrary: SongEntry[]
  onSaveCurrentSong: (songName?: string) => void
  onLoadSong: (songId: string) => void
  onMoveSong: (songId: string, direction: 'up' | 'down') => void
  onDeleteSong: (songId: string) => void
  triggerClassName?: string
  dropdownClassName?: string
}

export function SongLibraryMenu({
  songName,
  songLibrary,
  onSaveCurrentSong,
  onLoadSong,
  onMoveSong,
  onDeleteSong,
  triggerClassName,
  dropdownClassName,
}: SongLibraryMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpen) {
      return
    }
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const container = menuRef.current
      if (!container) {
        return
      }
      const target = event.target
      if (target instanceof Node && !container.contains(target)) {
        setMenuOpen(false)
      }
    }
    window.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePointer)
    }
  }, [menuOpen])

  return (
    <div className="relative min-w-0" ref={menuRef}>
      <button
        type="button"
        className={
          triggerClassName ??
          'flex min-h-[40px] w-full min-w-0 items-center justify-between gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 transition hover:bg-white/10'
        }
        onClick={() => setMenuOpen((current) => !current)}
        aria-expanded={menuOpen}
        aria-label="Open song list"
      >
        <span className="min-w-0 flex-1 truncate text-left" title={songName}>
          {songName}
        </span>
        <ChevronDown size={12} className="shrink-0" />
      </button>
      {menuOpen && (
        <div
          className={
            dropdownClassName ??
            'absolute left-0 right-0 z-40 mt-1 max-h-64 overflow-y-auto rounded-lg border border-white/10 bg-[#1a1825] p-2 shadow-xl'
          }
        >
          <button
            type="button"
            className="mb-2 block min-h-[38px] w-full rounded-md border border-fuchsia-300/40 bg-fuchsia-300/10 px-3 py-2 text-left text-sm text-fuchsia-100 transition hover:bg-fuchsia-300/20"
            onClick={() => {
              const inputName = window.prompt('Song name', songName || 'My Song')
              if (inputName === null) {
                return
              }
              const trimmed = inputName.trim()
              if (!trimmed) {
                return
              }
              onSaveCurrentSong(trimmed)
              setMenuOpen(false)
            }}
          >
            Save / rename song
          </button>
          {songLibrary.map((song) => {
            const isActiveSong = song.name === songName
            const songIndex = songLibrary.findIndex((entry) => entry.id === song.id)
            const canMoveUp = songIndex > 0
            const canMoveDown = songIndex < songLibrary.length - 1
            return (
              <div
                key={song.id}
                className={`flex items-center gap-2 rounded-md px-1 py-1.5 ${
                  isActiveSong ? 'bg-fuchsia-300/20' : ''
                }`}
              >
                <button
                  type="button"
                  className={`min-w-0 flex-1 rounded px-2 py-1.5 text-left text-sm transition ${
                    isActiveSong ? 'text-fuchsia-100' : 'text-white/80 hover:bg-white/10'
                  }`}
                  onClick={() => {
                    onLoadSong(song.id)
                    setMenuOpen(false)
                  }}
                >
                  <span className="block truncate">{song.name}</span>
                </button>
                <button
                  type="button"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-white/20 bg-white/10 text-white/80 transition hover:bg-white/15 disabled:opacity-40"
                  aria-label={`Move ${song.name} up`}
                  disabled={!canMoveUp}
                  onClick={() => onMoveSong(song.id, 'up')}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-white/20 bg-white/10 text-white/80 transition hover:bg-white/15 disabled:opacity-40"
                  aria-label={`Move ${song.name} down`}
                  disabled={!canMoveDown}
                  onClick={() => onMoveSong(song.id, 'down')}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-red-300/40 bg-red-300/10 text-red-100 transition hover:bg-red-300/20 disabled:opacity-40"
                  aria-label={`Delete ${song.name}`}
                  disabled={songLibrary.length <= 1}
                  onClick={() => {
                    const confirmed = window.confirm(`Delete song "${song.name}" from library?`)
                    if (!confirmed) {
                      return
                    }
                    onDeleteSong(song.id)
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
