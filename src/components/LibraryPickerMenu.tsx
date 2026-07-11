import { ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const VIEWPORT_GUTTER_PX = 12
const DROPDOWN_PANEL_CLASS =
  'fixed z-[60] overflow-y-auto rounded-lg border border-white/10 bg-[#1a1825] p-2 shadow-xl'

type DropdownPlacement = 'viewport' | 'anchor'

type PickerItem = {
  id: string
  name: string
}

type LibraryPickerMenuProps = {
  selectedId: string
  items: PickerItem[]
  onSelect: (id: string) => void
  triggerClassName?: string
  openAriaLabel?: string
  inactiveItemClassName?: string
  dropdownPlacement?: DropdownPlacement
}

export function LibraryPickerMenu({
  selectedId,
  items,
  onSelect,
  triggerClassName,
  openAriaLabel = 'Open list',
  inactiveItemClassName = 'text-white/80 hover:bg-white/10',
  dropdownPlacement = 'anchor',
}: LibraryPickerMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<Record<string, number>>({})
  const menuRef = useRef<HTMLDivElement | null>(null)
  const selectedName = items.find((item) => item.id === selectedId)?.name ?? '—'
  const selectableItems = items.filter((item) => item.id !== selectedId)

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
    const top = rect.bottom + 4
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    if (dropdownPlacement === 'viewport') {
      setDropdownStyle({
        top,
        left: VIEWPORT_GUTTER_PX,
        right: VIEWPORT_GUTTER_PX,
        maxHeight: Math.max(120, viewportHeight - top - VIEWPORT_GUTTER_PX),
      })
      return
    }

    setDropdownStyle({
      top,
      left: rect.left,
      width: rect.width,
      maxHeight: Math.max(120, viewportHeight - top - VIEWPORT_GUTTER_PX),
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
        aria-label={openAriaLabel}
      >
        <span className="min-w-0 flex-1 truncate text-left" title={selectedName}>
          {selectedName}
        </span>
        <ChevronDown size={12} className="shrink-0" />
      </button>
      {menuOpen && (
        <div className={DROPDOWN_PANEL_CLASS} style={dropdownStyle}>
          {selectableItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`block w-full rounded-md px-2 py-1.5 text-left text-sm transition ${inactiveItemClassName}`}
                onClick={() => {
                  onSelect(item.id)
                  setMenuOpen(false)
                }}
              >
                <span className="block truncate">{item.name}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
