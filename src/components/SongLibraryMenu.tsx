import { ArrowDown, ArrowUp, ChevronDown, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const VIEWPORT_GUTTER_PX = 12
const VIEWPORT_DROPDOWN_CLASS =
  'fixed z-[60] overflow-y-auto rounded-lg border border-white/10 bg-[#1a1825] p-2 shadow-xl'
const ANCHOR_DROPDOWN_CLASS =
  'fixed z-[60] max-h-64 overflow-y-auto rounded-lg border border-white/10 bg-[#1a1825] p-2 shadow-xl'

type DropdownPlacement = 'viewport' | 'anchor'

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
  dropdownPlacement?: DropdownPlacement
}

export function SongLibraryMenu({
  songName,
  songLibrary,
  onSaveCurrentSong,
  onLoadSong,
  onMoveSong,
  onDeleteSong,
  triggerClassName,
  dropdownPlacement = 'viewport',
}: SongLibraryMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<Record<string, number>>({})
  const menuRef = useRef<HTMLDivElement | null>(null)
  const usesViewportDropdown = dropdownPlacement === 'viewport'

  const updateDropdownPosition = useCallback(() => {
    const container = menuRef.current
    if (!container) {
      return
    }
    const trigger = container.querySelector('button')
    if (!(trigger instanceof HTMLElement)) {
      return
    }
    const rect = trigger.getBoundingClientRect()
    if (dropdownPlacement === 'viewport') {
      const top = rect.bottom + 4
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      setDropdownStyle({
        top,
        left: VIEWPORT_GUTTER_PX,
        right: VIEWPORT_GUTTER_PX,
        maxHeight: Math.max(120, viewportHeight - top - VIEWPORT_GUTTER_PX),
      })
      return
    }

    const viewportWidth = window.innerWidth
    const width = Math.min(288, viewportWidth - VIEWPORT_GUTTER_PX * 2)
    const right = Math.max(VIEWPORT_GUTTER_PX, viewportWidth - rect.right)
    setDropdownStyle({
      top: rect.bottom,
      right,
      width,
    })
  }, [dropdownPlacement])

  useLayoutEffect(() => {
    if (!menuOpen) {
      return
    }
    updateDropdownPosition()
    window.addEventListener('resize', updateDropdownPosition)
    window.addEventListener('scroll', updateDropdownPosition, true)
    return () => {
      window.removeEventListener('resize', updateDropdownPosition)
      window.removeEventListener('scroll', updateDropdownPosition, true)
    }
  }, [menuOpen, updateDropdownPosition])

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
          className={usesViewportDropdown ? VIEWPORT_DROPDOWN_CLASS : ANCHOR_DROPDOWN_CLASS}
          style={dropdownStyle}
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
