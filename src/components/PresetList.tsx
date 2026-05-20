import { ArrowDown, ArrowUp, Check, Copy, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
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

  const startEditing = (preset: Preset) => {
    setEditingPresetId(preset.id)
    setEditingName(preset.name)
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
      <div className="space-y-2">
        {presets.map((preset) => {
          const isActive = preset.id === activePresetId
          const isEditing = editingPresetId === preset.id
          return (
            <article
              key={preset.id}
              className={`rounded-xl border border-white/10 bg-white/5 p-3 transition hover:bg-white/10 ${!isEditing ? 'cursor-pointer' : ''}`}
              onClick={!isEditing ? () => onLoadPreset(preset.id) : undefined}
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-h-10 flex-1 items-center">
                  {(isEditing) ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => commitRename(preset.id)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === 'Enter') {
                          ;(e.target as HTMLInputElement).blur()
                        }
                      }}
                      className="min-h-10 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold leading-tight text-white outline-none focus:border-fuchsia-300/50 [user-select:text]"
                      aria-label="Preset name"
                      autoFocus
                    />
                  ) : (
                    <div className="min-h-10 w-full min-w-0 text-left">
                      <div className="text-safe text-sm font-semibold text-white">{preset.name}</div>
                      <div className="text-xs text-white/60">
                        {preset.tuningSystemId.toUpperCase()} • Center {preset.tonalCenter.toUpperCase()}
                      </div>
                    </div>
                  )}
                </div>
                {(isActive) && (
                  <div className="flex h-10 shrink-0 items-center justify-center rounded-lg border border-fuchsia-300/60 bg-fuchsia-300/20 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-fuchsia-100">
                    Active
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(isEditing) ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      commitRename(preset.id)
                    }}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-fuchsia-300/50 bg-fuchsia-300/20 p-2 text-fuchsia-100 transition hover:bg-fuchsia-300/30"
                    aria-label="Save name"
                  >
                    <Check size={18} />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        startEditing(preset)
                      }}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/10"
                      aria-label="Rename preset"
                    >
                      <Pencil size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onMovePreset(preset.id, 'up')
                      }}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/10"
                      aria-label="Move preset up"
                    >
                      <ArrowUp size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onMovePreset(preset.id, 'down')
                      }}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/10"
                      aria-label="Move preset down"
                    >
                      <ArrowDown size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDuplicatePreset(preset.id)
                      }}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/10"
                      aria-label="Duplicate preset"
                    >
                      <Copy size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeletePreset(preset.id)
                      }}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-red-300/40 bg-red-300/10 p-2 text-red-100 transition hover:bg-red-300/20"
                      aria-label="Delete preset"
                    >
                      <Trash2 size={18} />
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
