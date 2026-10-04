import { X } from 'lucide-react'
import type { ToneSetLayout } from './toneSetLayout'

type ToneSetOptionsDialogProps = {
  customSets: ToneSetLayout[]
  selectedCustomSetName: string
  onSelectedCustomSetNameChange: (name: string) => void
  onSelectDefault: () => void
  onLoadCustomSet: (name: string) => void
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}

/** Modal: pick default / saved custom tone set, or open the editor. */
export function ToneSetOptionsDialog({
  customSets,
  selectedCustomSetName,
  onSelectedCustomSetNameChange,
  onSelectDefault,
  onLoadCustomSet,
  onEdit,
  onDelete,
  onClose,
}: ToneSetOptionsDialogProps) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tone-set-options-title"
        className="w-full max-w-sm rounded-xl border border-white/15 bg-[#252332] p-4 shadow-2xl"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id="tone-set-options-title" className="text-sm font-semibold text-white">
              Tone set options
            </h2>
          </div>
          <button
            type="button"
            className="flex size-8 shrink-0 items-center justify-center rounded-md border border-white/10 text-white/70 transition hover:bg-white/10"
            onClick={onClose}
            aria-label="Close tone set options"
          >
            <X size={16} />
          </button>
        </div>
        <div className="space-y-2">
          <button
            type="button"
            className="button-safe min-h-[44px] w-full rounded-lg border border-fuchsia-300/50 bg-fuchsia-300/15 px-4 py-2 text-left text-sm font-semibold text-white transition hover:bg-fuchsia-300/25"
            onClick={() => {
              onSelectDefault()
              onClose()
            }}
          >
            Default (Eesti Torupill)
          </button>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.14em] text-white/55">Custom set</span>
            <select
              className="w-full rounded-lg border border-white/15 bg-[#1b1827] px-3 py-2 text-sm text-white outline-none focus:border-fuchsia-300/50"
              value={selectedCustomSetName}
              onChange={(event) => {
                const nextName = event.target.value
                onSelectedCustomSetNameChange(nextName)
                if (!nextName) {
                  return
                }
                onLoadCustomSet(nextName)
                onClose()
              }}
            >
              {customSets.length === 0 ? (
                <option value="">No custom sets saved</option>
              ) : (
                customSets.map((setEntry) => (
                  <option key={setEntry.name} value={setEntry.name}>
                    {setEntry.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <button
            type="button"
            className="button-safe min-h-[44px] w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-left text-sm font-semibold text-white/90 transition hover:bg-white/10"
            onClick={onEdit}
          >
            Edit
          </button>
          <button
            type="button"
            className="button-safe min-h-[44px] w-full rounded-lg border border-red-300/40 bg-red-300/10 px-4 py-2 text-left text-sm font-semibold text-red-100 transition hover:bg-red-300/20"
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
