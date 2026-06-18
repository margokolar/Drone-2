import { BT_CONTROL_MODES } from './types'
import { useDroneStore } from '../store/useDroneStore'
import { needsIosMediaRemoteIntegration } from '../utils/mediaSessionEnvironment'

export function BtControlMenuSection() {
  const btControlMode = useDroneStore((state) => state.btControlMode)
  const setBtControlMode = useDroneStore((state) => state.setBtControlMode)

  if (!needsIosMediaRemoteIntegration()) {
    return null
  }

  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">BT control</p>
        <p className="mt-1 text-xs text-white/45">Choose one path — pedal or speaker, not both.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {BT_CONTROL_MODES.map(({ id, label, hint }) => {
          const active = btControlMode === id
          return (
            <button
              key={id}
              type="button"
              data-keep-menu-open
              aria-pressed={active}
              className={`button-safe min-h-[52px] rounded-lg border px-2 py-2 text-left transition ${
                active
                  ? 'border-white/30 bg-white/15 text-white'
                  : 'border-white/10 bg-[#1b1827] text-white/75 hover:bg-[#252332]'
              }`}
              onClick={() => setBtControlMode(id)}
            >
              <span className="block text-sm font-medium">{label}</span>
              <span className="mt-0.5 block text-[11px] leading-tight text-white/45">{hint}</span>
            </button>
          )
        })}
      </div>
      <p className="text-[11px] leading-snug text-white/40">
        Vol up/down works in both modes. Play/pause and preset use the selected path only.
      </p>
    </div>
  )
}
