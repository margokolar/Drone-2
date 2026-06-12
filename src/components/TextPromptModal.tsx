import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { dismissVirtualKeyboard } from '../utils/iosKeyboardGuard'

type TextPromptModalProps = {
  open: boolean
  title: string
  defaultValue?: string
  confirmLabel?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

export function TextPromptModal({
  open,
  title,
  defaultValue = '',
  confirmLabel = 'Done',
  onConfirm,
  onCancel,
}: TextPromptModalProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(defaultValue)

  useEffect(() => {
    if (open) {
      setDraft(defaultValue)
    }
  }, [defaultValue, open])

  useLayoutEffect(() => {
    if (!open) {
      return
    }
    const input = inputRef.current
    if (!input) {
      return
    }
    input.focus({ preventScroll: true })
    input.select()
  }, [open])

  const close = (nextValue: string | null) => {
    dismissVirtualKeyboard()
    if (nextValue === null) {
      onCancel()
      return
    }
    onConfirm(nextValue)
  }

  if (!open) {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-[130] bg-black/70">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Cancel text entry"
        onClick={() => close(null)}
      />
      <div className="absolute inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-[131] mx-auto w-full max-w-sm rounded-2xl border border-white/10 bg-[#1a1825] p-4 shadow-2xl">
        <div className="mb-3 text-xs uppercase tracking-[0.16em] text-white/60">{title}</div>
        <input
          ref={inputRef}
          type="text"
          inputMode="text"
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              close(draft)
            }
          }}
          className="mb-4 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-base text-white outline-none focus:border-fuchsia-300/50"
          aria-label={title}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="done"
          data-form-type="other"
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="min-h-[44px] rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-semibold text-white transition hover:bg-white/10"
            onClick={() => close(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="min-h-[44px] rounded-xl border border-fuchsia-300/60 bg-fuchsia-300/20 px-3 text-sm font-semibold text-white transition hover:bg-fuchsia-300/30"
            onClick={() => close(draft)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
