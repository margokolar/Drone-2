import { Delete } from 'lucide-react'
import { useState } from 'react'

type OnScreenTextKeyboardProps = {
  onKey: (char: string) => void
  onBackspace: () => void
  onSpace: () => void
}

const NUMBER_ROW = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const
const LETTER_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
] as const
const ESTONIAN_ROW = ['õ', 'ä', 'ö', 'ü', 'š', 'ž'] as const
const PUNCTUATION_ROW = ['-', '_', '.', ',', "'", '&', '(', ')'] as const

const KEY_CLASS =
  'flex min-h-[44px] min-w-0 flex-1 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-base font-semibold text-white transition hover:bg-white/10 active:bg-white/15'

/** Pure on-screen keyboard: never focuses a native input, so iOS keeps the system keyboard untouched. */
export function OnScreenTextKeyboard({ onKey, onBackspace, onSpace }: OnScreenTextKeyboardProps) {
  const [shifted, setShifted] = useState(false)

  const emit = (char: string) => {
    onKey(shifted ? char.toUpperCase() : char)
    if (shifted) {
      setShifted(false)
    }
  }

  return (
    <div className="space-y-1.5 select-none">
      <div className="flex gap-1.5">
        {NUMBER_ROW.map((key) => (
          <button key={key} type="button" className={KEY_CLASS} onClick={() => onKey(key)}>
            {key}
          </button>
        ))}
      </div>
      {LETTER_ROWS.map((row, rowIndex) => (
        <div key={row.join('')} className="flex gap-1.5">
          {rowIndex === 2 ? (
            <button
              type="button"
              className={`${KEY_CLASS} max-w-[3rem] flex-[1.4] ${shifted ? 'border-fuchsia-300/60 bg-fuchsia-300/20 text-fuchsia-100' : ''}`}
              onClick={() => setShifted((current) => !current)}
              aria-pressed={shifted}
              aria-label="Shift"
            >
              ⇧
            </button>
          ) : null}
          {row.map((key) => (
            <button key={key} type="button" className={KEY_CLASS} onClick={() => emit(key)}>
              {shifted ? key.toUpperCase() : key}
            </button>
          ))}
          {rowIndex === 2 ? (
            <button
              type="button"
              className={`${KEY_CLASS} max-w-[3rem] flex-[1.4]`}
              onClick={onBackspace}
              aria-label="Delete last character"
            >
              <Delete size={18} />
            </button>
          ) : null}
        </div>
      ))}
      <div className="flex gap-1.5">
        {ESTONIAN_ROW.map((key) => (
          <button key={key} type="button" className={KEY_CLASS} onClick={() => emit(key)}>
            {shifted ? key.toUpperCase() : key}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        {PUNCTUATION_ROW.map((key) => (
          <button key={key} type="button" className={KEY_CLASS} onClick={() => onKey(key)}>
            {key}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <button
          type="button"
          className={`${KEY_CLASS} flex-[5]`}
          onClick={onSpace}
          aria-label="Space"
        >
          space
        </button>
      </div>
    </div>
  )
}
