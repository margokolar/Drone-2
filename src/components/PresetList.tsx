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

function selectAllEditableText(element: HTMLElement) {
  element.focus({ preventScroll: true })
  const range = document.createRange()
  range.selectNodeContents(element)
  const selection = window.getSelection()
  if (!selection) {
    return
  }
  selection.removeAllRanges()
  selection.addRange(range)
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
  const renameEditorRef = useRef<HTMLDivElement | null>(null)
  const renameBlurTimeoutRef = useRef<number | null>(null)

  const clearRenameBlurTimeout = () => {
    if (renameBlurTimeoutRef.current !== null) {
      window.clearTimeout(renameBlurTimeoutRef.current)
      renameBlurTimeoutRef.current = null
    }
  }

  const startEditing = (preset: Preset) => {
    clearRenameBlurTimeout()
    flushSync(() => {
      setEditingPresetId(preset.id)
      setEditingName(preset.name)
    })
    const editor = renameEditorRef.current
    if (!editor) {
      return
    }
    editor.textContent = preset.name
    selectAllEditableText(editor)
  }

  const scheduleRenameBlur = (presetId: string) => {
    clearRenameBlurTimeout()
    renameBlurTimeoutRef.current = window.setTimeout(() => {
      renameBlurTimeoutRef.current = null
      const editor = renameEditorRef.current
      const active = document.activeElement
      if (editor && (active === editor || editor.contains(active))) {
        return
      }
      if (active instanceof HTMLElement && active.closest('[data-preset-edit-toolbar]')) {
        editor?.focus()
        return
      }
      commitRename(presetId)
    }, 50)
  }

  const commitRename = (presetId: string) => {
    clearRenameBlurTimeout()
    const raw = renameEditorRef.current?.textContent ?? editingName
    const trimmed = raw.replace(/\s+/g, ' ').trim()
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
                    <div
                      className="w-full min-w-0"
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <div
                        ref={renameEditorRef}
                        contentEditable
                        suppressContentEditableWarning
                        role="textbox"
                        aria-label="Preset label"
                        spellCheck={false}
                        autoCapitalize="off"
                        onInput={(event) => setEditingName(event.currentTarget.textContent ?? '')}
                        onFocus={clearRenameBlurTimeout}
                        onBlur={() => scheduleRenameBlur(preset.id)}
                        onKeyDown={(event) => {
                          event.stopPropagation()
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            commitRename(preset.id)
                          }
                        }}
                        onPaste={(event) => {
                          event.preventDefault()
                          const text = event.clipboardData.getData('text/plain').replace(/[\r\n]+/g, ' ')
                          document.execCommand('insertText', false, text)
                        }}
                        className="min-h-8 w-full rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-sm font-semibold leading-tight text-white outline-none focus:border-fuchsia-300/50 [user-select:text]"
                      />
                    </div>
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
              <div
                className="flex flex-wrap items-center gap-1.5"
                data-preset-edit-toolbar={isEditing ? '' : undefined}
              >
                {(isEditing) ? (
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
                    aria-label="Save name"
                  >
                    <Check size={16} />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={(event) => {
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
