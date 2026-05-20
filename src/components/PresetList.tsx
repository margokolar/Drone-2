import clsx from 'clsx'
import { ArrowDown, ArrowUp, Check, Copy, Pencil, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Preset } from '../presets/defaultPresets'

type PresetListProps = {
  presets: Preset[]
  activePresetId: string
  onLoadPreset: (presetId: string) => void
  onRenamePreset: (presetId: string, name: string) => void
  onDuplicatePreset: (presetId: string) => void
  onDeletePreset: (presetId: string) => void
  onMovePreset: (presetId: string, direction: 'up' | 'down') => void
}

export function PresetList({
  presets,
  activePresetId,
  onLoadPreset,
  onRenamePreset,
  onDuplicatePreset,
  onDeletePreset,
  onMovePreset,
}: PresetListProps) {
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const renameInputRef = useRef<HTMLInputElement | null>(null)

  const startEditing = (preset: Preset) => {
    flushSync(() => {
      setEditingPresetId(preset.id)
      setEditingName(preset.name)
    })
    const input = renameInputRef.current
    if (!input) {
      return
    }
    input.focus({ preventScroll: true })
    input.readOnly = false
    input.setSelectionRange(0, input.value.length)
  }

  const commitRename = (presetId: string) => {
    const trimmed = editingName.trim()
    if (trimmed) {
      onRenamePreset(presetId, trimmed)
    }
    setEditingPresetId(null)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {presets.map((preset) => {
          const isActive = preset.id === activePresetId
          const isEditing = editingPresetId === preset.id
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
          return (
            <article
              key={preset.id}
              className={`rounded-xl border px-3 py-2 transition ${
                isActive
                  ? 'border-fuchsia-300/70 bg-fuchsia-300/20 shadow-[0_0_18px_rgba(240,171,252,0.16)]'
                  : 'border-white/10 bg-white/5 hover:bg-white/10'
              } ${!isEditing ? 'cursor-pointer' : ''}`}
              onClick={!isEditing ? () => onLoadPreset(preset.id) : undefined}
            >
              <div className="mb-1.5 flex min-h-8 items-center">
                <div className="flex min-w-0 flex-1 items-center">
                  {(isEditing) ? (
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
                        name="contact-autofill-trap"
                        tabIndex={-1}
                        aria-hidden
                        autoComplete="name"
                        className="pointer-events-none absolute -left-[9999px] h-px w-px opacity-0"
                        defaultValue=""
                        readOnly
                      />
                      <input
                        ref={renameInputRef}
                        id={`preset-label-${preset.id}`}
                        name={`preset-label-${preset.id}`}
                        type="text"
                        inputMode="text"
                        value={editingName}
                        readOnly
                        onChange={(event) => setEditingName(event.target.value)}
                        onBlur={() => commitRename(preset.id)}
                        onKeyDown={(event) => {
                          event.stopPropagation()
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            event.currentTarget.form?.requestSubmit()
                          }
                        }}
                        className="min-h-8 w-full rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-sm font-semibold leading-tight text-white outline-none focus:border-fuchsia-300/50 [user-select:text]"
                        aria-label="Preset label"
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
                    <div className="flex min-h-8 w-full min-w-0 items-center justify-between gap-3">
                      <div className="text-safe min-w-0 flex-1 truncate text-sm font-semibold text-white">
                        {preset.name}
                      </div>
                      <div className="shrink-0 text-right text-xs text-white/60">
                        <span className="uppercase">{preset.tuningSystemId}</span>
                        <span className="mx-1 text-white/35">•</span>
                        <span>Center {preset.tonalCenter.toUpperCase()}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {(isEditing) ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      commitRename(preset.id)
                    }}
                    className="flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-fuchsia-300/50 bg-fuchsia-300/20 p-1.5 text-fuchsia-100 transition hover:bg-fuchsia-300/30"
                    aria-label="Save name"
                  >
                    <Check size={16} />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onPointerDown={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        startEditing(preset)
                      }}
                      className={toolButtonClass}
                      aria-label="Rename preset"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onMovePreset(preset.id, 'up')
                      }}
                      className={toolButtonClass}
                      aria-label="Move preset up"
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onMovePreset(preset.id, 'down')
                      }}
                      className={toolButtonClass}
                      aria-label="Move preset down"
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDuplicatePreset(preset.id)
                      }}
                      className={toolButtonClass}
                      aria-label="Duplicate preset"
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeletePreset(preset.id)
                      }}
                      className={deleteButtonClass}
                      aria-label="Delete preset"
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
