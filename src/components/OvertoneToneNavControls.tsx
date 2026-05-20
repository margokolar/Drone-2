import { StepBack, StepForward } from 'lucide-react'

type OvertoneToneNavControlsProps = {
  toneLabel: string
  isSolo: boolean
  canNavigate: boolean
  soloAriaLabel: string
  onToggleSolo: () => void
  onPrevious: () => void
  onNext: () => void
  variant: 'portrait-solo' | 'portrait-steps' | 'landscape-inline'
}

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
  toneLabel,
  isSolo,
  canNavigate,
  soloAriaLabel,
  onToggleSolo,
  onPrevious,
  onNext,
  variant,
}: OvertoneToneNavControlsProps) {
  const stepButtonClass =
    'button-safe flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/10 disabled:opacity-40'

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
        className={`button-safe flex h-9 shrink-0 touch-manipulation items-center gap-1 rounded-lg border px-2 transition ${soloButtonClass(isSolo, variant)}`}
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
        <span className="text-sm font-extrabold uppercase tracking-[0.12em]">{toneLabel}</span>
      </button>
    ) : (
      <button
        type="button"
        className={`button-safe min-w-0 shrink touch-manipulation rounded-lg border px-2.5 py-1 text-base font-extrabold uppercase tracking-[0.12em] transition ${soloButtonClass(isSolo, variant)}`}
        onClick={onToggleSolo}
        aria-label={soloAriaLabel}
      >
        {toneLabel}
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
