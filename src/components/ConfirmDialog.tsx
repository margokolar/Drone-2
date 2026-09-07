type ConfirmDialogProps = {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="w-full max-w-sm rounded-xl border border-white/15 bg-[#1b1827] p-4 shadow-2xl"
      >
        <h2 id="confirm-dialog-title" className="text-sm font-semibold text-white">
          {title}
        </h2>
        <p id="confirm-dialog-message" className="mt-2 text-sm text-white/70">
          {message}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="button-safe min-h-10 flex-1 rounded-lg border border-white/15 bg-white/5 px-3 text-sm font-medium text-white/85 transition hover:bg-white/10"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button-safe min-h-10 flex-1 rounded-lg border border-red-300/45 bg-red-400/20 px-3 text-sm font-medium text-red-100 transition hover:bg-red-400/30"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
