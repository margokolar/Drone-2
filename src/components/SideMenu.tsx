import { BatteryMedium, ChevronDown, Download, Info, Menu, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'
import { BtControlMenuSection } from '../bluetooth/BtControlMenuSection'
import type { useScribbleDisplay } from '../hooks/useScribbleDisplay'
import { ScribbleMenuSection } from '../scribble/ScribbleMenuSection'
import { LoopMenuSection } from './LoopMenuSection'
import { MicMenuSection } from './MicMenuSection'

const APP_VERSION = '3.0'

type SideMenuProps = {
  onClose: () => void
  scribble: ReturnType<typeof useScribbleDisplay>
  /** Export/import sections stay expanded across menu opens, so their state lives in the parent. */
  exportOpen: boolean
  onToggleExport: () => void
  importOpen: boolean
  onToggleImport: () => void
  onExportSong: () => void
  onExportSongLibrary: () => void
  onExportToneSet: () => void
  onExportGlobal: () => void
  onImportSongs: () => void
  onImportToneSet: () => void
  onImportGlobal: () => void
  toneSetName: string
  onOpenToneSetOptions: () => void
  onOpenMidi: () => void
}

/** Slide-in left menu (rendered only while open). */
export function SideMenu({
  onClose,
  scribble,
  exportOpen,
  onToggleExport,
  importOpen,
  onToggleImport,
  onExportSong,
  onExportSongLibrary,
  onExportToneSet,
  onExportGlobal,
  onImportSongs,
  onImportToneSet,
  onImportGlobal,
  toneSetName,
  onOpenToneSetOptions,
  onOpenMidi,
}: SideMenuProps) {
  const sideMenuRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const closeMenuOnOutsidePointer = (event: PointerEvent) => {
      const menuElement = sideMenuRef.current
      if (!menuElement) {
        return
      }
      const target = event.target
      if (target instanceof Node && !menuElement.contains(target)) {
        onClose()
      }
    }
    window.addEventListener('pointerdown', closeMenuOnOutsidePointer)
    return () => {
      window.removeEventListener('pointerdown', closeMenuOnOutsidePointer)
    }
  }, [onClose])

  const openJblPortableApp = useCallback(() => {
    // Best effort deep-link. Works only if JBL registers this URL scheme.
    window.location.href = 'jblportable://'
  }, [])

  return (
    <>
      <button
        type="button"
        aria-label="Close menu overlay"
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside
        ref={sideMenuRef}
        className="fixed left-0 top-0 z-50 flex h-full w-[280px] flex-col border-r border-white/10 bg-[#1a1825] p-4 shadow-2xl"
        onClick={(event) => {
          const target = event.target as HTMLElement | null
          const interactiveAncestor = target?.closest(
            'button, a, input, select, textarea, [role="button"], [data-keep-menu-open]',
          )
          if (!interactiveAncestor) {
            onClose()
          }
        }}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/70">Menu</h2>
          <button
            type="button"
            aria-label="Close menu"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-white/10 bg-white/5 p-2 text-white/80"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain">
          <div data-keep-menu-open>
            <BtControlMenuSection />
          </div>
          <div data-keep-menu-open>
            <ScribbleMenuSection scribble={scribble} />
          </div>
          <button
            type="button"
            className="button-safe flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-white transition hover:bg-white/10"
            onClick={onToggleExport}
            aria-expanded={exportOpen}
            aria-controls="menu-export-actions"
          >
            <span className="flex items-center gap-2">
              <Upload size={20} />
              Export
            </span>
            <ChevronDown size={16} className={exportOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
          {exportOpen ? (
            <div id="menu-export-actions" className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-2">
              <button
                type="button"
                className="button-safe flex min-h-[40px] w-full items-center gap-2 rounded-lg border border-white/10 bg-[#1b1827] px-3 py-2 text-left text-sm text-white/90 transition hover:bg-[#252332]"
                onClick={() => {
                  onExportSong()
                  onClose()
                }}
              >
                <Upload size={16} />
                Export song JSON
              </button>
              <button
                type="button"
                className="button-safe flex min-h-[40px] w-full items-center gap-2 rounded-lg border border-white/10 bg-[#1b1827] px-3 py-2 text-left text-sm text-white/90 transition hover:bg-[#252332]"
                onClick={() => {
                  onExportSongLibrary()
                  onClose()
                }}
              >
                <Upload size={16} />
                Export song library JSON
              </button>
              <button
                type="button"
                className="button-safe flex min-h-[40px] w-full items-center gap-2 rounded-lg border border-white/10 bg-[#1b1827] px-3 py-2 text-left text-sm text-white/90 transition hover:bg-[#252332]"
                onClick={() => {
                  onExportToneSet()
                  onClose()
                }}
              >
                <Upload size={16} />
                Export tone set JSON
              </button>
              <button
                type="button"
                className="button-safe flex min-h-[40px] w-full items-center gap-2 rounded-lg border border-white/10 bg-[#1b1827] px-3 py-2 text-left text-sm text-white/90 transition hover:bg-[#252332]"
                onClick={() => {
                  onExportGlobal()
                  onClose()
                }}
              >
                <Upload size={16} />
                Global export (all data)
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="button-safe flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-white transition hover:bg-white/10"
            onClick={onToggleImport}
            aria-expanded={importOpen}
            aria-controls="menu-import-actions"
          >
            <span className="flex items-center gap-2">
              <Download size={20} />
              Import
            </span>
            <ChevronDown size={16} className={importOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
          {importOpen ? (
            <div id="menu-import-actions" className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-2">
              <button
                type="button"
                className="button-safe flex min-h-[40px] w-full items-center gap-2 rounded-lg border border-white/10 bg-[#1b1827] px-3 py-2 text-left text-sm text-white/90 transition hover:bg-[#252332]"
                onClick={() => {
                  onImportSongs()
                  onClose()
                }}
              >
                <Download size={16} />
                Import song / library JSON
              </button>
              <button
                type="button"
                className="button-safe flex min-h-[40px] w-full items-center gap-2 rounded-lg border border-white/10 bg-[#1b1827] px-3 py-2 text-left text-sm text-white/90 transition hover:bg-[#252332]"
                onClick={() => {
                  onImportToneSet()
                  onClose()
                }}
              >
                <Download size={16} />
                Import tone set JSON
              </button>
              <button
                type="button"
                className="button-safe flex min-h-[40px] w-full items-center gap-2 rounded-lg border border-white/10 bg-[#1b1827] px-3 py-2 text-left text-sm text-white/90 transition hover:bg-[#252332]"
                onClick={() => {
                  onImportGlobal()
                  onClose()
                }}
              >
                <Download size={16} />
                Global import (all data)
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="button-safe flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-white transition hover:bg-white/10"
            onClick={openJblPortableApp}
          >
            <BatteryMedium size={20} />
            Open JBL Portable
          </button>
          <button
            type="button"
            className="button-safe flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-white transition hover:bg-white/10"
            onClick={onOpenToneSetOptions}
          >
            <Menu size={20} />
            Tone set: {toneSetName}
          </button>
          <button
            type="button"
            className="button-safe flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-white transition hover:bg-white/10"
            onClick={() => {
              onOpenMidi()
              onClose()
            }}
          >
            <Menu size={20} />
            MIDI
          </button>
          <div data-keep-menu-open>
            <LoopMenuSection />
          </div>
          <div data-keep-menu-open>
            <MicMenuSection />
          </div>
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white/70">
            <div className="mb-1 flex items-center gap-2 text-white/80">
              <Info size={14} />
              Drone 3 v{APP_VERSION}
            </div>
            <p>Professional drone reference for tuning and intonation practice.</p>
            <p className="mt-2 text-xs text-white/55">© Margo Kõlar</p>
            <p className="mt-1 text-[11px] text-white/40">Apache License 2.0</p>
          </div>
        </div>
      </aside>
    </>
  )
}
