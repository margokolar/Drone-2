import { useState } from 'react'
import { ChevronDown, Monitor, RefreshCw } from 'lucide-react'
import { formatScribbleSetupGuide } from './scribbleSlotMap'
import { useScribbleDisplay } from '../hooks/useScribbleDisplay'
import { exportTextFile, exportTextResultMessage } from '../utils/exportTextFile'

type ScribbleMenuSectionProps = {
  scribble: ReturnType<typeof useScribbleDisplay>
}

export function ScribbleMenuSection({ scribble }: ScribbleMenuSectionProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [exportMessage, setExportMessage] = useState<string | null>(null)

  if (!scribble.supported) {
    return null
  }

  const activeDestination = scribble.destinations.find(
    (item) => item.id === scribble.settings.destinationId,
  )

  return (
    <div className="space-y-2">
      <button
        type="button"
        data-keep-menu-open
        className="button-safe flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-white transition hover:bg-white/10"
        onClick={() => setMenuOpen((current) => !current)}
        aria-expanded={menuOpen}
        aria-controls="menu-scribble-actions"
      >
        <span className="flex items-center gap-2">
          <Monitor size={20} />
          Scribble
        </span>
        <ChevronDown
          size={16}
          className={menuOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
        />
      </button>
      {menuOpen ? (
        <div
          id="menu-scribble-actions"
          className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/90"
        >
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={scribble.settings.enabled}
              onChange={(event) => scribble.setEnabled(event.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-[#1b1827]"
            />
            <span>Sync with Scribble</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={scribble.settings.followInput}
              disabled={!scribble.settings.enabled}
              onChange={(event) => scribble.setFollowInput(event.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-[#1b1827] disabled:opacity-40"
            />
            <span>Follow Scribble buttons</span>
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs uppercase tracking-wide text-white/50">MIDI out</span>
              <button
                type="button"
                data-keep-menu-open
                className="button-safe flex min-h-[32px] items-center gap-1 rounded-lg border border-white/10 bg-[#1b1827] px-2 py-1 text-xs text-white/80"
                onClick={() => void scribble.refreshDestinations()}
              >
                <RefreshCw size={12} />
                Refresh
              </button>
            </div>
            <select
              value={scribble.settings.destinationId ?? ''}
              onChange={(event) => {
                const value = event.target.value
                scribble.setDestinationId(value ? Number(value) : null)
              }}
              className="w-full rounded-lg border border-white/10 bg-[#1b1827] px-3 py-2 text-sm text-white"
            >
              <option value="">— select device —</option>
              {scribble.destinations.map((destination) => (
                <option key={destination.id} value={destination.id}>
                  {destination.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              data-keep-menu-open
              className="button-safe w-full rounded-lg border border-white/10 bg-[#1b1827] px-3 py-2 text-left text-sm text-white/90 hover:bg-[#252332]"
              onClick={() => void scribble.showBluetoothPicker()}
            >
              Pair Bluetooth MIDI device…
            </button>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-white/50">
              MIDI channel (match Scribble)
            </span>
            <input
              type="number"
              min={1}
              max={16}
              value={scribble.settings.channel}
              onChange={(event) => scribble.setChannel(Number(event.target.value))}
              className="w-full rounded-lg border border-white/10 bg-[#1b1827] px-3 py-2 text-sm text-white"
            />
          </label>

          <div className="rounded-lg border border-white/10 bg-[#1b1827] px-3 py-2 text-xs text-white/70">
            {activeDestination ? (
              <p>
                Device: <span className="text-white/90">{activeDestination.name}</span>
              </p>
            ) : (
              <p>Pair Scribble via Bluetooth, then pick it from the list.</p>
            )}
            {scribble.currentSlot !== null ? (
              <p className="mt-1">
                Current slot:{' '}
                <span className="text-white/90">{scribble.currentSlot + 1}</span>
                {scribble.lastSentSlot === scribble.currentSlot ? ' (sent)' : ''}
              </p>
            ) : (
              <p className="mt-1">Current selection is not in the slot map.</p>
            )}
          </div>

          {scribble.accessError ? (
            <p className="text-xs text-amber-200/90">{scribble.accessError}</p>
          ) : null}

          <button
            type="button"
            data-keep-menu-open
            className="button-safe w-full rounded-lg border border-white/10 bg-[#1b1827] px-3 py-2 text-left text-sm text-white/90 hover:bg-[#252332]"
            onClick={() => {
              void (async () => {
                try {
                  const result = await exportTextFile(
                    formatScribbleSetupGuide(scribble.slotMap),
                    'scribble-setup.txt',
                  )
                  setExportMessage(exportTextResultMessage(result))
                } catch {
                  setExportMessage('Eksport ebaõnnestus — proovi uuesti.')
                }
              })()
            }}
          >
            Export Scribble setup guide
          </button>
          {exportMessage ? (
            <p className="text-xs text-emerald-200/90">{exportMessage}</p>
          ) : null}

          <p className="text-xs leading-relaxed text-white/50">
            Scribble shows text from edit.piratemidi.com. For two-way sync, enable Preset MIDI
            PC Outputs → BLE in Scribble global settings so button presses send Program Change.
          </p>
        </div>
      ) : null}
    </div>
  )
}
