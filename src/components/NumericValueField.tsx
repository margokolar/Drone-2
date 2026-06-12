import { Delete } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { isIosStandalonePwa } from '../utils/platform'

type NumericValueFieldProps = {
  value: number
  onCommit: (value: number) => void
  min: number
  max: number
  decimals: number
  className: string
  ariaLabel: string
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function formatValue(value: number, decimals: number): string {
  if (decimals === 0) {
    return String(Math.round(value))
  }
  return value.toFixed(decimals)
}

function sanitizeDraft(rawValue: string, decimals: number, allowNegative: boolean): string {
  let sanitized = rawValue.replace(/[^0-9.-]/g, '')
  const hasNegative = allowNegative && sanitized.startsWith('-')
  sanitized = sanitized.replace(/-/g, '')
  const [whole, ...fractionParts] = sanitized.split('.')
  const fraction = fractionParts.join('')
  const truncatedFraction = decimals > 0 ? fraction.slice(0, decimals) : ''
  const merged =
    decimals > 0 && sanitized.includes('.')
      ? `${whole}.${truncatedFraction}`
      : whole
  if (!merged) {
    return hasNegative ? '-' : ''
  }
  return `${hasNegative ? '-' : ''}${merged}`
}

export function NumericValueField({
  value,
  onCommit,
  min,
  max,
  decimals,
  className,
  ariaLabel,
}: NumericValueFieldProps) {
  const [draft, setDraft] = useState(() => formatValue(value, decimals))
  const [open, setOpen] = useState(false)
  const useIosPrompt = useMemo(() => isIosStandalonePwa(), [])
  const allowNegative = min < 0

  useEffect(() => {
    if (!open) {
      setDraft(formatValue(value, decimals))
    }
  }, [decimals, open, value])

  const openEditor = () => {
    setDraft(formatValue(value, decimals))
    setOpen(true)
  }

  const commitValue = (rawValue: string) => {
    const parsed = Number(rawValue)
    if (!Number.isFinite(parsed)) {
      setDraft(formatValue(value, decimals))
      return
    }
    const nextValue = clamp(parsed, min, max)
    onCommit(nextValue)
    setDraft(formatValue(nextValue, decimals))
  }

  if (!useIosPrompt) {
    return (
      <input
        type="text"
        inputMode={decimals > 0 ? 'decimal' : 'numeric'}
        value={draft}
        onChange={(event) => {
          const nextValue = sanitizeDraft(event.currentTarget.value, decimals, allowNegative)
          setDraft(nextValue)
          const parsed = Number(nextValue)
          if (Number.isFinite(parsed)) {
            onCommit(parsed)
          }
        }}
        onBlur={() => {
          commitValue(draft)
        }}
        className={className}
        aria-label={ariaLabel}
      />
    )
  }

  const pushKey = (key: string) => {
    if (key === '.' && decimals === 0) {
      return
    }
    if (key === '.' && draft.includes('.')) {
      return
    }
    const nextValue = sanitizeDraft(`${draft}${key}`, decimals, allowNegative)
    setDraft(nextValue)
  }

  const toggleSign = () => {
    if (!allowNegative) {
      return
    }
    if (!draft) {
      setDraft('-')
      return
    }
    if (draft.startsWith('-')) {
      setDraft(draft.slice(1))
      return
    }
    setDraft(`-${draft}`)
  }

  const backspace = () => {
    setDraft((current) => current.slice(0, -1))
  }

  return (
    <>
      <button
        type="button"
        className={`${className} cursor-pointer`}
        aria-label={ariaLabel}
        data-text-entry-trigger="true"
        onClick={openEditor}
        onPointerUp={(event) => {
          if (event.pointerType !== 'touch') {
            return
          }
          event.preventDefault()
          openEditor()
        }}
        onTouchEnd={(event) => {
          event.preventDefault()
          openEditor()
        }}
        style={{ touchAction: 'manipulation' }}
      >
        {formatValue(value, decimals)}
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[100] bg-black/70">
            <button
              type="button"
              className="absolute inset-0"
              aria-label="Close numeric keypad"
              onClick={() => {
                setDraft(formatValue(value, decimals))
                setOpen(false)
              }}
            />
            <div className="absolute inset-x-3 bottom-3 z-[101] mx-auto w-auto max-w-xs rounded-2xl border border-white/10 bg-[#1a1825] p-4 shadow-2xl sm:inset-x-0 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2">
              <div className="mb-3 text-xs uppercase tracking-[0.16em] text-white/60">
                {ariaLabel}
              </div>
              <div className="mb-4 rounded-xl border border-white/10 bg-black/20 px-3 py-4 text-right text-2xl font-semibold tabular-nums text-white">
                {draft || '0'}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((key) => (
                  <button
                    key={key}
                    type="button"
                    className="min-h-[52px] rounded-xl border border-white/10 bg-white/5 text-lg font-semibold text-white transition hover:bg-white/10"
                    onClick={() => pushKey(key)}
                  >
                    {key}
                  </button>
                ))}
                <button
                  type="button"
                  className="min-h-[52px] rounded-xl border border-white/10 bg-white/5 text-lg font-semibold text-white transition hover:bg-white/10 disabled:opacity-40"
                  onClick={toggleSign}
                  disabled={!allowNegative}
                >
                  +/-
                </button>
                <button
                  type="button"
                  className="min-h-[52px] rounded-xl border border-white/10 bg-white/5 text-lg font-semibold text-white transition hover:bg-white/10"
                  onClick={() => pushKey('0')}
                >
                  0
                </button>
                <button
                  type="button"
                  className="min-h-[52px] rounded-xl border border-white/10 bg-white/5 text-lg font-semibold text-white transition hover:bg-white/10 disabled:opacity-40"
                  onClick={() => pushKey('.')}
                  disabled={decimals === 0}
                >
                  .
                </button>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  className="min-h-[48px] rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-semibold text-white transition hover:bg-white/10"
                  onClick={() => setDraft('')}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="flex min-h-[48px] items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-semibold text-white transition hover:bg-white/10"
                  onClick={backspace}
                  aria-label="Delete last digit"
                >
                  <Delete size={18} />
                </button>
                <button
                  type="button"
                  className="min-h-[48px] rounded-xl border border-fuchsia-300/60 bg-fuchsia-300/20 px-3 text-sm font-semibold text-white transition hover:bg-fuchsia-300/30"
                  onClick={() => {
                    commitValue(draft)
                    setOpen(false)
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
