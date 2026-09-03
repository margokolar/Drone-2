import clsx from 'clsx'
import { Mic } from 'lucide-react'
import { useDroneStore } from '../store/useDroneStore'

export function MicMenuSection() {
  const micFeaturesEnabled = useDroneStore((state) => state.micFeaturesEnabled)
  const setMicFeaturesEnabled = useDroneStore((state) => state.setMicFeaturesEnabled)

  return (
    <div
      data-keep-menu-open
      className="button-safe flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-white"
    >
      <span className="flex items-center gap-2">
        <Mic size={20} />
        Mic
      </span>
      <button
        type="button"
        data-keep-menu-open
        className={clsx(
          'shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] transition',
          micFeaturesEnabled
            ? 'border-cyan-300/50 bg-cyan-300/15 text-cyan-100 hover:bg-cyan-300/25'
            : 'border-white/15 bg-white/5 text-white/55 hover:bg-white/10',
        )}
        aria-pressed={micFeaturesEnabled}
        aria-label={
          micFeaturesEnabled
            ? 'Disable Mic tab and transport control'
            : 'Enable Mic tab and transport control'
        }
        onClick={() => setMicFeaturesEnabled(!micFeaturesEnabled)}
      >
        {micFeaturesEnabled ? 'On' : 'Off'}
      </button>
    </div>
  )
}
