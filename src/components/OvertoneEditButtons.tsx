import { ClipboardPaste, Copy, PowerOff, Redo2, RotateCcw, Undo2 } from 'lucide-react'
import { HarmonicTimbreToggleButton } from './OvertoneToneNavControls'
import { overtoneIconButtonClass } from './overtoneControlStyles'

/** Edit actions for the selected tone's overtone graph (shared by portrait and landscape toolbars). */
export type OvertoneEditActions = {
  onReset: () => void
  canReset: boolean
  onUndo: () => void
  canUndo: boolean
  onRedo: () => void
  canRedo: boolean
  onCopy: () => void
  onPaste: () => void
  canPaste: boolean
  onDeactivateAll: () => void
  canDeactivateAll: boolean
  harmonicTimbreEnabled: boolean
  onToggleHarmonicTimbre: () => void
}

type ButtonVariant = 'portrait-solo' | 'landscape-inline'

/** Reset balance, undo, redo. */
export function OvertoneHistoryButtons({
  variant,
  actions,
}: {
  variant: ButtonVariant
  actions: OvertoneEditActions
}) {
  const buttonClass = overtoneIconButtonClass(variant)
  return (
    <>
      <button
        type="button"
        className={buttonClass}
        onClick={actions.onReset}
        aria-label="Reset overtone balance"
        disabled={!actions.canReset}
      >
        <RotateCcw size={16} />
      </button>
      <button
        type="button"
        className={buttonClass}
        onClick={actions.onUndo}
        aria-label="Undo overtone change"
        disabled={!actions.canUndo}
      >
        <Undo2 size={16} />
      </button>
      <button
        type="button"
        className={buttonClass}
        onClick={actions.onRedo}
        aria-label="Redo overtone change"
        disabled={!actions.canRedo}
      >
        <Redo2 size={16} />
      </button>
    </>
  )
}

/** Copy, paste, deactivate all partials, harmonic timbre toggle. */
export function OvertoneClipboardButtons({
  variant,
  actions,
}: {
  variant: ButtonVariant
  actions: OvertoneEditActions
}) {
  const buttonClass = overtoneIconButtonClass(variant)
  return (
    <>
      <button
        type="button"
        className={buttonClass}
        onClick={actions.onCopy}
        aria-label="Copy tone overtones"
      >
        <Copy size={16} />
      </button>
      <button
        type="button"
        className={buttonClass}
        onClick={actions.onPaste}
        aria-label="Paste tone overtones"
        disabled={!actions.canPaste}
      >
        <ClipboardPaste size={16} />
      </button>
      <button
        type="button"
        className={buttonClass}
        onClick={actions.onDeactivateAll}
        aria-label="Deactivate all partials"
        disabled={!actions.canDeactivateAll}
      >
        <PowerOff size={16} />
      </button>
      <HarmonicTimbreToggleButton
        variant={variant}
        enabled={actions.harmonicTimbreEnabled}
        onClick={actions.onToggleHarmonicTimbre}
      />
    </>
  )
}
