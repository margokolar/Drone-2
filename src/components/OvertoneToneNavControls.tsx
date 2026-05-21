import clsx from 'clsx'
import { GitCompareArrows, StepBack, StepForward } from 'lucide-react'
import { tonePageLabelUsesUppercase, type NoteId } from '../music/notes'
import { ToneLabel } from './ToneLabel'

type OvertoneToneNavControlsProps = {
  toneNoteId: NoteId
  isSolo: boolean
  canNavigate: boolean
  soloAriaLabel: string
  onToggleSolo: () => void
  onPrevious: () => void
  onNext: () => void
  variant: 'portrait-solo' | 'portrait-steps' | 'landscape-inline'
}

export function overtoneControlButtonSizeClass(
  variant: 'portrait-solo' | 'portrait-steps' | 'landscape-inline',
): string {
  return variant === 'landscape-inline' ? 'h-10 px-2' : 'h-9 px-2.5'
}

export function overtoneIconButtonClass(
  variant: 'portrait-solo' | 'portrait-steps' | 'landscape-inline',
): string {
  return clsx(
    'button-safe flex shrink-0 touch-manipulation items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/10 disabled:opacity-40',
    variant === 'landscape-inline' ? 'size-10' : 'size-9',
  )
}

export function harmonicTimbreIconButtonClass(
  variant: 'portrait-solo' | 'landscape-inline',
  enabled: boolean,
): string {
  return clsx(
    overtoneIconButtonClass(variant),
    enabled
      ? 'border-cyan-200/90 bg-cyan-400/35 text-white shadow-[0_0_20px_rgba(34,211,238,0.45)] hover:bg-cyan-400/45'
      : 'border-white/10 bg-white/3 text-white/35 hover:bg-white/8 hover:text-white/60',
  )
}

type HarmonicTimbreToggleButtonProps = {
  variant: 'portrait-solo' | 'landscape-inline'
  enabled: boolean
  onClick: () => void
}

export function HarmonicTimbreToggleButton({ variant, enabled, onClick }: HarmonicTimbreToggleButtonProps) {
  return (
    <button
      type="button"
      className={harmonicTimbreIconButtonClass(variant, enabled)}
      onClick={onClick}
      aria-label="Toggle harmonic timbre (square and saw follow overtone graph)"
      aria-pressed={enabled}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill={enabled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={enabled ? 1.75 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="4" y="4" width="16" height="16" rx="1" />
      </svg>
    </button>
  )
}

const overtoneToneButtonShellClass =
  'button-safe flex shrink-0 touch-manipulation items-center justify-center rounded-lg border transition'

function soloButtonClass(isSolo: boolean, variant: OvertoneToneNavControlsProps['variant']): string {
  if (variant === 'landscape-inline') {
    return isSolo
      ? 'border-amber-300/65 bg-amber-300/25 text-amber-50 shadow-[0_0_18px_rgba(251,191,36,0.22)] hover:bg-amber-300/35'
      : 'border-fuchsia-300/45 bg-fuchsia-300/15 text-fuchsia-50 shadow-[0_0_18px_rgba(240,171,252,0.12)] hover:bg-fuchsia-300/25'
  }
  return isSolo
    ? 'border-amber-300/70 bg-amber-300/30 text-amber-50 shadow-[0_0_18px_rgba(251,191,36,0.28)] hover:bg-amber-300/40'
    : 'border-fuchsia-300/50 bg-fuchsia-300/20 text-fuchsia-50 shadow-[0_0_18px_rgba(240,171,252,0.16)] hover:bg-fuchsia-300/30'
}

export function OvertoneToneNavControls({
  toneNoteId,
  isSolo,
  canNavigate,
  soloAriaLabel,
  onToggleSolo,
  onPrevious,
  onNext,
  variant,
}: OvertoneToneNavControlsProps) {
  const toneLabelUppercase = tonePageLabelUsesUppercase(toneNoteId)
  const stepButtonClass = overtoneIconButtonClass(variant)

  const stepButtons = (
    <>
      <button
        type="button"
        className={stepButtonClass}
        onClick={onPrevious}
        aria-label="Previous tone"
        disabled={!canNavigate}
      >
        <StepBack size={16} />
      </button>
      <button
        type="button"
        className={stepButtonClass}
        onClick={onNext}
        aria-label="Next tone"
        disabled={!canNavigate}
      >
        <StepForward size={16} />
      </button>
    </>
  )

  if (variant === 'portrait-steps') {
    return <div className="flex shrink-0 items-center gap-1">{stepButtons}</div>
  }

  const soloButton =
    variant === 'landscape-inline' ? (
      <button
        type="button"
        className={clsx(
          overtoneToneButtonShellClass,
          overtoneControlButtonSizeClass(variant),
          'gap-1',
          soloButtonClass(isSolo, variant),
        )}
        onClick={onToggleSolo}
        aria-label={soloAriaLabel}
      >
        <span
          className={`text-[9px] font-semibold uppercase tracking-[0.14em] ${
            isSolo ? 'text-amber-100/65' : 'text-white/45'
          }`}
        >
          Tone
        </span>
        <ToneLabel
          noteId={toneNoteId}
          className={clsx('tracking-[0.12em]', toneLabelUppercase && 'uppercase')}
        />
      </button>
    ) : (
      <button
        type="button"
        className={clsx(
          overtoneToneButtonShellClass,
          overtoneControlButtonSizeClass(variant),
          'tracking-[0.12em]',
          soloButtonClass(isSolo, variant),
        )}
        onClick={onToggleSolo}
        aria-label={soloAriaLabel}
      >
        <ToneLabel noteId={toneNoteId} className={toneLabelUppercase ? 'uppercase' : undefined} />
      </button>
    )

  if (variant === 'portrait-solo') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Tone</span>
        {soloButton}
      </div>
    )
  }

  return (
    <div className="flex shrink-0 touch-manipulation items-center justify-end gap-1.5">
      {stepButtons}
      {soloButton}
    </div>
  )
}

type OvertoneAllSoloButtonProps = {
  isActive: boolean
  onClick: () => void
  className?: string
  variant?: 'portrait-solo' | 'landscape-inline'
}

export function OvertoneAllSoloButton({
  isActive,
  onClick,
  className,
  variant = 'portrait-solo',
}: OvertoneAllSoloButtonProps) {
  const sizeVariant = variant === 'landscape-inline' ? 'landscape-inline' : 'portrait-solo'

  return (
    <button
      type="button"
      className={clsx(
        overtoneToneButtonShellClass,
        sizeVariant === 'landscape-inline' ? 'size-10' : 'size-9',
        isActive
          ? 'border-amber-300/70 bg-amber-300/30 text-amber-50 shadow-[0_0_18px_rgba(251,191,36,0.28)] hover:bg-amber-300/40'
          : 'border-fuchsia-300/50 bg-fuchsia-300/20 text-fuchsia-50 shadow-[0_0_18px_rgba(240,171,252,0.16)] hover:bg-fuchsia-300/30',
        className,
      )}
      onClick={onClick}
      aria-label="Lülita kõigi toonide võrdlus-solo"
      aria-pressed={isActive}
    >
      <GitCompareArrows size={16} aria-hidden />
    </button>
  )
}
