import { ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const VIEWPORT_GUTTER_PX = 12
const VIEWPORT_DROPDOWN_CLASS =
  'fixed z-[60] overflow-y-auto rounded-lg border border-white/10 bg-[#1a1825] p-2 shadow-xl'
const ANCHOR_DROPDOWN_CLASS =
  'absolute right-0 top-full z-[60] overflow-y-auto rounded-lg border border-white/10 bg-[#1a1825] p-2 shadow-xl'

type DropdownPlacement = 'viewport' | 'anchor'

type SongEntry = {
  id: string
  name: string
}

type SongLibraryMenuProps = {
  songName: string
  songLibrary: SongEntry[]
  onLoadSong: (songId: string) => void
  triggerClassName?: string
  dropdownPlacement?: DropdownPlacement
}

export function SongLibraryMenu({
  songName,
  songLibrary,
  onLoadSong,
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
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    const width = Math.min(288, viewportWidth - VIEWPORT_GUTTER_PX * 2)
    setDropdownStyle({
      width,
      maxHeight: Math.max(120, viewportHeight - rect.bottom - VIEWPORT_GUTTER_PX),
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
          {songLibrary.map((song) => {
            const isActiveSong = song.name === songName
            return (
              <button
                key={song.id}
                type="button"
                className={`block w-full rounded-md px-2 py-1.5 text-left text-sm transition ${
                  isActiveSong ? 'bg-fuchsia-300/20 text-fuchsia-100' : 'text-white/80 hover:bg-white/10'
                }`}
                onClick={() => {
                  onLoadSong(song.id)
                  setMenuOpen(false)
                }}
              >
                <span className="block truncate">{song.name}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
