import { ChevronDown, Download, Save, Upload, X } from 'lucide-react'
import { triggerSaveFlash } from '../utils/saveFlash'

type ToneSetEditorDialogProps = {
  quickName: string
  onQuickNameChange: (next: string) => void
  quickGrid: string
  onQuickGridChange: (next: string) => void
  jsonCollapsed: boolean
  onToggleJsonCollapsed: () => void
  draft: string
  onDraftChange: (next: string) => void
  error: string | null
  onClose: () => void
  onSave: () => void
  onImportJson: () => void
  onExportJson: () => void
}

/** Modal for creating / editing a custom tone set (simple fields + raw JSON). */
export function ToneSetEditorDialog({
  quickName,
  onQuickNameChange,
  quickGrid,
  onQuickGridChange,
  jsonCollapsed,
  onToggleJsonCollapsed,
  draft,
  onDraftChange,
  error,
  onClose,
  onSave,
  onImportJson,
  onExportJson,
}: ToneSetEditorDialogProps) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tone-set-editor-title"
        className="w-full max-w-lg rounded-xl border border-white/15 bg-[#252332] p-4 shadow-2xl"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id="tone-set-editor-title" className="text-sm font-semibold text-white">
              Tone set custom JSON
            </h2>
            <p className="mt-1 text-sm text-white/70">
              Edit or paste tone set: 2 subOctaveIds and 16 gridIds.
            </p>
          </div>
          <button
            type="button"
            className="flex size-8 shrink-0 items-center justify-center rounded-md border border-white/10 text-white/70 transition hover:bg-white/10"
            onClick={onClose}
            aria-label="Close tone set editor"
          >
            <X size={16} />
          </button>
        </div>
        <div className="mb-3 rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="mb-2 text-xs uppercase tracking-[0.14em] text-white/60">Simple editor</div>
          <div className="grid gap-2">
            <input
              type="text"
              value={quickName}
              onChange={(event) => onQuickNameChange(event.target.value)}
              placeholder="Tone set name"
              className="w-full rounded-md border border-white/15 bg-[#1b1827] px-3 py-2 text-sm text-white outline-none focus:border-fuchsia-300/50"
            />
            <textarea
              value={quickGrid}
              onChange={(event) => onQuickGridChange(event.target.value)}
              placeholder="All tones (e.g. g0, a0, c, d, e, f, fis...)"
              rows={3}
              className="w-full resize-y rounded-md border border-white/15 bg-[#1b1827] px-3 py-2 text-sm text-white outline-none focus:border-fuchsia-300/50"
            />
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <button
            type="button"
            className="button-safe flex min-h-[34px] w-full items-center justify-between rounded-md border border-white/10 bg-[#1b1827] px-3 py-2 text-left text-xs uppercase tracking-[0.14em] text-white/70 transition hover:bg-[#252332]"
            onClick={onToggleJsonCollapsed}
            aria-expanded={!jsonCollapsed}
            aria-controls="tone-set-json-editor"
          >
            <span>JSON editor</span>
            <ChevronDown
              size={16}
              className={`transition-transform ${jsonCollapsed ? '' : 'rotate-180'}`}
            />
          </button>
          {!jsonCollapsed ? (
            <div id="tone-set-json-editor" className="mt-3">
              <textarea
                value={draft}
                onChange={(event) => onDraftChange(event.target.value)}
                className="min-h-[220px] w-full rounded-lg border border-white/15 bg-[#1b1827] p-3 font-mono text-xs text-white/90 outline-none focus:border-fuchsia-300/50"
                spellCheck={false}
                aria-label="Tone set JSON"
              />
              <p className="mt-2 text-[11px] leading-relaxed text-white/55">
                Allowed tone symbols: G0..D2 chromatic range. Accepted forms include plain names
                (<code className="rounded bg-white/10 px-1">g0</code>, <code className="rounded bg-white/10 px-1">a1</code>,
                <code className="rounded bg-white/10 px-1">d2</code>) and accidentals with sharps/flats
                (<code className="rounded bg-white/10 px-1">g#1</code>, <code className="rounded bg-white/10 px-1">ab1</code>,
                <code className="rounded bg-white/10 px-1">db2</code>, also <code className="rounded bg-white/10 px-1">♯</code>/<code className="rounded bg-white/10 px-1">♭</code>).
              </p>
            </div>
          ) : null}
        </div>
        {error ? (
          <p className="mt-2 text-xs text-red-200">{error}</p>
        ) : null}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="button-safe min-h-[44px] flex-1 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button-safe min-h-[44px] flex flex-1 items-center justify-center rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10"
            onClick={(event) => {
              triggerSaveFlash(event.currentTarget)
              onSave()
            }}
            aria-label="Save custom tone set"
            title="Save"
          >
            <Save size={18} />
          </button>
          <button
            type="button"
            className="button-safe min-h-[44px] flex flex-1 items-center justify-center rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10"
            onClick={onImportJson}
            aria-label="Import tone set JSON into editor"
            title="Import JSON"
          >
            <Download size={18} />
          </button>
          <button
            type="button"
            className="button-safe min-h-[44px] flex flex-1 items-center justify-center rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10"
            onClick={onExportJson}
            aria-label="Export custom tone set JSON"
            title="Export JSON"
          >
            <Upload size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
