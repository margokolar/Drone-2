import clsx from 'clsx'
import { ArrowDown, ArrowUp, Check, Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Preset } from '../presets/defaultPresets'
import { resolveActivePresetHighlightKey, type PresetNavigationEntry } from '../presets/presetNavigation'
import { PlayPauseIcon } from './PlayPauseIcon'
import { NavigationCheckbox } from './NavigationCheckbox'

type PresetListProps = {
  presets: Preset[]
  presetNavigation: PresetNavigationEntry[]
  activeNavigationKey: string
  activePresetId: string
  onLoadPreset: (presetId: string) => void
  onRenamePreset: (presetId: string, name: string) => void
  onDuplicatePreset: (presetId: string) => void
  onDeletePreset: (presetId: string) => void
  onMoveNavigationEntry: (entryKey: string, direction: 'up' | 'down') => void
  onToggleNavigationEnabled: (presetId: string) => void
  onInsertTransportAfter: (presetId: string) => void
  onDeleteTransportMarker: (markerId: string) => void
  onToggleTransportNavigationEnabled: (markerId: string) => void
  onActivateTransport: (markerId: string) => void
}

export function PresetList({
  presets,
  presetNavigation,
  activeNavigationKey,
  activePresetId,
  onLoadPreset,
  onRenamePreset,
  onDuplicatePreset,
  onDeletePreset,
  onMoveNavigationEntry,
  onToggleNavigationEnabled,
  onInsertTransportAfter,
  onDeleteTransportMarker,
  onToggleTransportNavigationEnabled,
  onActivateTransport,
}: PresetListProps) {
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const renameInputRef = useRef<HTMLInputElement | null>(null)
  const renameBlurTimeoutRef = useRef<number | null>(null)
  const renameIgnoreBlurRef = useRef(false)

  const clearRenameBlurTimeout = () => {
    if (renameBlurTimeoutRef.current !== null) {
      window.clearTimeout(renameBlurTimeoutRef.current)
      renameBlurTimeoutRef.current = null
    }
  }

  const commitRename = (presetId: string) => {
    clearRenameBlurTimeout()
    const trimmed = editingName.replace(/\s+/g, ' ').trim()
    if (trimmed) {
      onRenamePreset(presetId, trimmed)
    }
    setEditingPresetId(null)
  }

  const scheduleRenameBlur = (presetId: string) => {
    if (renameIgnoreBlurRef.current) {
      return
    }
    clearRenameBlurTimeout()
    renameBlurTimeoutRef.current = window.setTimeout(() => {
      renameBlurTimeoutRef.current = null
      if (document.activeElement === renameInputRef.current) {
        return
      }
      commitRename(presetId)
    }, 120)
  }

  const startEditing = (preset: Preset) => {
    clearRenameBlurTimeout()
    renameIgnoreBlurRef.current = true
    flushSync(() => {
      setEditingPresetId(preset.id)
      setEditingName(preset.name)
    })
    const input = renameInputRef.current
    if (input) {
      input.focus({ preventScroll: true })
      input.select()
    }
    window.setTimeout(() => {
      renameIgnoreBlurRef.current = false
    }, 400)
  }

  const activePresetHighlightKey = resolveActivePresetHighlightKey(
    activeNavigationKey,
    activePresetId,
    presetNavigation,
  )

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {presetNavigation.map((entry) => {
          if (entry.kind === 'transport') {
            const isNavigationEnabled = entry.enabled !== false
            const isActive = isNavigationEnabled && activeNavigationKey === entry.id
            const toolButtonClass = clsx(
              'flex min-h-9 min-w-9 items-center justify-center rounded-lg border p-1.5 transition',
              isActive
                ? 'border-white/20 bg-[#2a2238] text-white/90 hover:bg-[#352a48]'
                : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10',
            )
            const deleteButtonClass = clsx(
              'flex min-h-9 min-w-9 items-center justify-center rounded-lg border p-1.5 transition',
              isActive
                ? 'border-red-300/55 bg-[#2a2238] text-red-200 hover:bg-red-300/20'
                : 'border-red-300/40 bg-red-300/10 text-red-100 hover:bg-red-300/20',
            )
            const navigationToggleButtonClass = clsx(toolButtonClass, 'ml-auto shrink-0')
            const isCollapsed = !isNavigationEnabled
            return (
              <article
                key={entry.id}
                className={clsx(
                  'rounded-xl border px-3 transition',
                  isCollapsed ? 'py-1.5' : 'py-2',
                  isActive
                    ? 'border-amber-300/70 bg-amber-300/15 shadow-[0_0_18px_rgba(251,191,36,0.12)]'
                    : 'border-white/10 bg-white/5 hover:bg-white/10',
                  !isNavigationEnabled && 'opacity-55',
                  isNavigationEnabled && 'cursor-pointer',
                )}
                onClick={isNavigationEnabled ? () => onActivateTransport(entry.id) : undefined}
                aria-label="Play / Pause marker"
              >
                <div className={clsx('flex min-h-10 items-center gap-2', !isCollapsed && 'mb-1.5')}>
                  <PlayPauseIcon size={28} className="shrink-0 text-amber-100/90" />
                  <NavigationCheckbox
                    checked={isNavigationEnabled}
                    onToggle={() => onToggleTransportNavigationEnabled(entry.id)}
                    buttonClassName={navigationToggleButtonClass}
                    accentColor="amber"
                    ariaLabelWhenChecked="Disable play/pause marker in prev/next navigation"
                    ariaLabelWhenUnchecked="Enable play/pause marker in prev/next navigation"
                  />
                </div>
                {!isCollapsed ? (
                  <div className="flex w-full flex-nowrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onMoveNavigationEntry(entry.id, 'up')
                    }}
                    className={clsx(toolButtonClass, 'shrink-0')}
                    aria-label="Move play/pause marker up"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onMoveNavigationEntry(entry.id, 'down')
                    }}
                    className={clsx(toolButtonClass, 'shrink-0')}
                    aria-label="Move play/pause marker down"
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onDeleteTransportMarker(entry.id)
                    }}
                    className={clsx(deleteButtonClass, 'ml-auto shrink-0')}
                    aria-label="Delete play/pause marker"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                ) : null}
              </article>
            )
          }

          const preset = presets.find((item) => item.id === entry.presetId)
          if (!preset) {
            return null
          }

          const isActive = activePresetHighlightKey === preset.id
          const isNavigationEnabled = preset.enabled !== false
          const isEditing = editingPresetId === preset.id
          const isCollapsed = !isNavigationEnabled && !isEditing
          const toolButtonClass = clsx(
            'flex min-h-9 min-w-9 items-center justify-center rounded-lg border p-1.5 transition',
            isActive
              ? 'border-white/20 bg-[#2a2238] text-white/90 hover:bg-[#352a48]'
              : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10',
          )
          const deleteButtonClass = clsx(
            'flex min-h-9 min-w-9 items-center justify-center rounded-lg border p-1.5 transition',
            isActive
              ? 'border-red-300/55 bg-[#2a2238] text-red-200 hover:bg-red-300/20'
              : 'border-red-300/40 bg-red-300/10 text-red-100 hover:bg-red-300/20',
          )
          const navigationToggleButtonClass = clsx(toolButtonClass, 'ml-auto shrink-0')
          return (
            <article
              key={preset.id}
              className={clsx(
                'rounded-xl border px-3 transition',
                isCollapsed ? 'py-1.5' : 'py-2',
                isActive
                  ? 'border-fuchsia-300/70 bg-fuchsia-300/20 shadow-[0_0_18px_rgba(240,171,252,0.16)]'
                  : 'border-white/10 bg-white/5 hover:bg-white/10',
                !isNavigationEnabled && 'opacity-55',
                !isEditing && 'cursor-pointer',
              )}
              onClick={!isEditing ? () => onLoadPreset(preset.id) : undefined}
            >
              <div className={clsx('flex min-h-8 items-center gap-2', !isCollapsed && 'mb-1.5')}>
                <div className="flex min-w-0 flex-1 items-center">
                  {isEditing ? (
                    <form
                      className="relative w-full min-w-0"
                      autoComplete="off"
                      onSubmit={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        commitRename(preset.id)
                      }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        type="text"
                        name="ios-autofill-name-trap"
                        tabIndex={-1}
                        aria-hidden
                        autoComplete="name"
                        defaultValue=""
                        className="pointer-events-none absolute -left-[9999px] h-px w-px opacity-0"
                        readOnly
                      />
                      <input
                        type="email"
                        name="ios-autofill-email-trap"
                        tabIndex={-1}
                        aria-hidden
                        autoComplete="email"
                        defaultValue=""
                        className="pointer-events-none absolute -left-[9999px] h-px w-px opacity-0"
                        readOnly
                      />
                      <input
                        ref={renameInputRef}
                        id={`preset-title-${preset.id}`}
                        type="search"
                        inputMode="text"
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        onBlur={() => scheduleRenameBlur(preset.id)}
                        onKeyDown={(event) => {
                          event.stopPropagation()
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            commitRename(preset.id)
                          }
                        }}
                        className="min-h-8 w-full appearance-none rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-sm font-semibold leading-tight text-white outline-none focus:border-fuchsia-300/50 [user-select:text] [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
                        aria-label="Preset title"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        enterKeyHint="done"
                        data-form-type="other"
                        data-lpignore="true"
                        data-1p-ignore="true"
                      />
                    </form>
                  ) : (
                    <div className="text-safe min-w-0 truncate text-sm font-semibold text-white">{preset.name}</div>
                  )}
                </div>
                {!isEditing && (
                  <NavigationCheckbox
                    checked={isNavigationEnabled}
                    onToggle={() => onToggleNavigationEnabled(preset.id)}
                    buttonClassName={navigationToggleButtonClass}
                    accentColor="fuchsia"
                    ariaLabelWhenChecked="Disable preset in prev/next navigation"
                    ariaLabelWhenUnchecked="Enable preset in prev/next navigation"
                  />
                )}
              </div>
              {!isCollapsed ? (
              <div className="flex flex-col gap-1.5">
                {isEditing ? (
                  <button
                    type="button"
                    onPointerDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                    }}
                    onClick={(event) => {
                      event.stopPropagation()
                      commitRename(preset.id)
                    }}
                    className="flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-fuchsia-300/50 bg-fuchsia-300/20 p-1.5 text-fuchsia-100 transition hover:bg-fuchsia-300/30"
                    aria-label="Save preset title"
                  >
                    <Check size={16} />
                  </button>
                ) : (
                  <>
                    <div className="flex w-full flex-nowrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          startEditing(preset)
                        }}
                        className={clsx(toolButtonClass, 'shrink-0')}
                        aria-label="Edit preset title"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          onMoveNavigationEntry(preset.id, 'up')
                        }}
                        className={clsx(toolButtonClass, 'shrink-0')}
                        aria-label="Move preset up"
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          onInsertTransportAfter(preset.id)
                        }}
                        className={clsx(toolButtonClass, 'shrink-0')}
                        aria-label="Insert play/pause marker after this preset"
                        title="Insert play/pause after"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    <div className="flex w-full flex-nowrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          onDuplicatePreset(preset.id)
                        }}
                        className={clsx(toolButtonClass, 'shrink-0')}
                        aria-label="Duplicate preset"
                      >
                        <Copy size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          onMoveNavigationEntry(preset.id, 'down')
                        }}
                        className={clsx(toolButtonClass, 'shrink-0')}
                        aria-label="Move preset down"
                      >
                        <ArrowDown size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          onDeletePreset(preset.id)
                        }}
                        className={clsx(deleteButtonClass, 'ml-auto shrink-0')}
                        aria-label="Delete preset"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </>
                )}
              </div>
              ) : null}
            </article>
          )
        })}
      </div>
    </div>
  )
}
