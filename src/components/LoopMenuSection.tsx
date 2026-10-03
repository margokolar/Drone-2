import clsx from 'clsx'
import { Repeat } from 'lucide-react'
import { useDroneStore } from '../store/useDroneStore'

export function LoopMenuSection() {
  const loopFeaturesEnabled = useDroneStore((state) => state.loopFeaturesEnabled)
  const setLoopFeaturesEnabled = useDroneStore((state) => state.setLoopFeaturesEnabled)

  return (
    <div
      data-keep-menu-open
      className="button-safe flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-white"
    >
      <span className="flex items-center gap-2">
        <Repeat size={20} />
        Loop
      </span>
      <button
        type="button"
        data-keep-menu-open
        className={clsx(
          'shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] transition',
          loopFeaturesEnabled
            ? 'border-emerald-300/50 bg-emerald-300/15 text-emerald-100 hover:bg-emerald-300/25'
            : 'border-white/15 bg-white/5 text-white/55 hover:bg-white/10',
        )}
        aria-pressed={loopFeaturesEnabled}
        aria-label={
          loopFeaturesEnabled
            ? 'Disable Loop tab and loop sync controls'
            : 'Enable Loop tab and loop sync controls'
        }
        onClick={() => setLoopFeaturesEnabled(!loopFeaturesEnabled)}
      >
        {loopFeaturesEnabled ? 'On' : 'Off'}
      </button>
    </div>
  )
}
