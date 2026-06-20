import { useState } from 'react'
import { Bluetooth, ChevronDown } from 'lucide-react'
import { BT_CONTROL_MODES } from './types'
import { useDroneStore } from '../store/useDroneStore'
import { needsIosMediaRemoteIntegration } from '../utils/mediaSessionEnvironment'

export function BtControlMenuSection() {
  const [menuOpen, setMenuOpen] = useState(false)
  const btControlMode = useDroneStore((state) => state.btControlMode)
  const setBtControlMode = useDroneStore((state) => state.setBtControlMode)

  if (!needsIosMediaRemoteIntegration()) {
    return null
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        data-keep-menu-open
        className="button-safe flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-white transition hover:bg-white/10"
        onClick={() => setMenuOpen((current) => !current)}
        aria-expanded={menuOpen}
        aria-controls="menu-bt-control-actions"
      >
        <span className="flex items-center gap-2">
          <Bluetooth size={20} />
          Control
        </span>
        <ChevronDown
          size={16}
          className={menuOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
        />
      </button>
      {menuOpen ? (
        <div
          id="menu-bt-control-actions"
          className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/5 p-2"
        >
          {BT_CONTROL_MODES.map(({ id, label }) => {
            const active = btControlMode === id
            return (
              <button
                key={id}
                type="button"
                data-keep-menu-open
                aria-pressed={active}
                className={`button-safe flex min-h-[40px] w-full items-center justify-center rounded-lg border px-3 py-2 text-sm transition ${
                  active
                    ? 'border-white/30 bg-white/15 text-white'
                    : 'border-white/10 bg-[#1b1827] text-white/90 hover:bg-[#252332]'
                }`}
                onClick={() => setBtControlMode(id)}
              >
                {label}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
