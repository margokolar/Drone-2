import clsx from 'clsx'
import { Check, ChevronDown } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'

const VIEWPORT_GUTTER_PX = 12
const COMPACT_DROPDOWN_PANEL_CLASS =
  'fixed z-[60] overflow-y-auto rounded-lg border border-white/10 bg-[#1a1825] p-2 shadow-xl'
const SELECT_DROPDOWN_PANEL_CLASS =
  'fixed z-[60] w-max overflow-y-auto rounded-xl border border-white/15 bg-[#1d1b2a] py-1 shadow-xl'

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
  appearance?: 'compact' | 'select'
}

const COMPACT_TRIGGER_CLASS =
  'flex min-h-[40px] w-full min-w-0 items-center justify-between gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 transition hover:bg-white/10'
/** Same closed-control feel as TopControls; open menu uses larger native-select-like type. */
const SELECT_TRIGGER_CLASS =
  'flex min-h-[40px] w-full min-w-0 items-center gap-1 rounded-xl border border-white/15 bg-white/5 px-2 py-2 text-base leading-none text-white outline-none transition hover:bg-white/10 focus:border-fuchsia-300/60'
const COMPACT_ITEM_CLASS = 'block w-full rounded-md px-2 py-1.5 text-left text-sm transition'
const SELECT_ITEM_CLASS =
  'flex w-full min-h-[48px] items-center gap-3 whitespace-nowrap rounded-lg px-4 py-3 text-left text-xl leading-none transition'

export function LibraryPickerMenu({
  selectedId,
  items,
  onSelect,
  triggerClassName,
  openAriaLabel = 'Open list',
  inactiveItemClassName = 'text-white/80 hover:bg-white/10',
  dropdownPlacement = 'anchor',
  appearance = 'compact',
}: LibraryPickerMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({})
  const menuRef = useRef<HTMLDivElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const selectedName = items.find((item) => item.id === selectedId)?.name ?? '—'
  const isSelectAppearance = appearance === 'select'
  const listItems = isSelectAppearance ? items : items.filter((item) => item.id !== selectedId)
  const resolvedTriggerClass = clsx(
    isSelectAppearance ? SELECT_TRIGGER_CLASS : COMPACT_TRIGGER_CLASS,
    triggerClassName,
  )
  const resolvedItemClass = isSelectAppearance ? SELECT_ITEM_CLASS : COMPACT_ITEM_CLASS
  const chevronSize = isSelectAppearance ? 16 : 12

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
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    if (dropdownPlacement === 'viewport') {
      const top = isSelectAppearance ? rect.top : rect.bottom + 4
      setDropdownStyle({
        top,
        left: VIEWPORT_GUTTER_PX,
        right: VIEWPORT_GUTTER_PX,
        maxHeight: Math.max(120, viewportHeight - top - VIEWPORT_GUTTER_PX),
      })
      return
    }

    const top = isSelectAppearance ? rect.top : rect.bottom + 4
    const maxWidth = Math.max(rect.width, viewportWidth - VIEWPORT_GUTTER_PX * 2)

    if (isSelectAppearance) {
      // Native <select> menus size to content, not the closed control width.
      setDropdownStyle({
        top,
        left: rect.left,
        minWidth: rect.width,
        maxWidth,
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
  }, [dropdownPlacement, isSelectAppearance])

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

  useLayoutEffect(() => {
    if (!menuOpen || !isSelectAppearance || dropdownPlacement !== 'anchor') {
      return
    }
    const panel = dropdownRef.current
    const container = menuRef.current
    const trigger = container?.querySelector('button')
    if (!(panel instanceof HTMLElement) || !(trigger instanceof HTMLElement)) {
      return
    }
    const triggerRect = trigger.getBoundingClientRect()
    const panelRect = panel.getBoundingClientRect()
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth
    const maxRight = viewportWidth - VIEWPORT_GUTTER_PX
    let left = triggerRect.left
    if (left + panelRect.width > maxRight) {
      left = Math.max(VIEWPORT_GUTTER_PX, maxRight - panelRect.width)
    }
    if (left !== panelRect.left) {
      setDropdownStyle((current) => ({ ...current, left }))
    }
  }, [menuOpen, isSelectAppearance, dropdownPlacement, listItems])

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
        className={clsx(resolvedTriggerClass, menuOpen && isSelectAppearance && 'invisible')}
        onClick={() => setMenuOpen((current) => !current)}
        aria-expanded={menuOpen}
        aria-label={openAriaLabel}
      >
        <span className="min-w-0 flex-1 truncate text-left" title={selectedName}>
          {selectedName}
        </span>
        <ChevronDown
          size={chevronSize}
          className={clsx('shrink-0 text-white/70', menuOpen && isSelectAppearance && 'invisible')}
        />
      </button>
      {menuOpen && (
        <div
          ref={dropdownRef}
          className={isSelectAppearance ? SELECT_DROPDOWN_PANEL_CLASS : COMPACT_DROPDOWN_PANEL_CLASS}
          style={dropdownStyle}
        >
          {listItems.map((item) => {
            const isSelected = item.id === selectedId
            return (
              <button
                key={item.id}
                type="button"
                className={clsx(
                  resolvedItemClass,
                  isSelectAppearance
                    ? isSelected
                      ? 'text-white'
                      : 'text-white hover:bg-white/10'
                    : inactiveItemClassName,
                )}
                onClick={() => {
                  if (!isSelected) {
                    onSelect(item.id)
                  }
                  setMenuOpen(false)
                }}
              >
                {isSelectAppearance && (
                  <Check
                    size={20}
                    strokeWidth={2.5}
                    className={clsx('shrink-0', isSelected ? 'text-white' : 'text-transparent')}
                    aria-hidden={!isSelected}
                  />
                )}
                <span className={clsx(isSelectAppearance ? 'shrink-0' : 'min-w-0 flex-1 truncate')}>
                  {item.name}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
