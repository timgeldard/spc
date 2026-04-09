import type { ReactNode } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, AlertOctagon, Minus } from 'lucide-react'

export type StatusPillStatus =
  | 'in-control'          // No SPC violations AND Cpk >= threshold
  | 'warning'             // No SPC violations BUT Cpk < threshold
  | 'out-of-control'      // SPC violation present
  | 'out-of-control-high' // Violation AND Cpk < threshold
  | 'unknown'             // Insufficient data to determine

interface StatusPillProps {
  status: StatusPillStatus
  /** Override the default label */
  label?: string
  /** Show a compact icon-only variant */
  compact?: boolean
}

// Kerry semantic colors: Jade=success, Sunrise=warning, Sunset=critical
const STATUS_CONFIG: Record<StatusPillStatus, { label: string; icon: React.ReactNode; className: string }> = {
  'in-control': {
    label: 'In Control',
    icon: <CheckCircle2 className="h-3 w-3" aria-hidden="true" />,
    className: 'bg-[var(--c-status-ok-bg)] text-[var(--c-status-ok-text)] border-[var(--c-status-ok-border)]',
  },
  warning: {
    label: 'Warning',
    icon: <AlertTriangle className="h-3 w-3" aria-hidden="true" />,
    className: 'bg-[var(--c-status-warn-bg)] text-[var(--c-status-warn-text)] border-[var(--c-status-warn-border)]',
  },
  'out-of-control': {
    label: 'Out of Control',
    icon: <XCircle className="h-3 w-3" aria-hidden="true" />,
    className: 'bg-[var(--c-status-bad-bg)] text-[var(--c-status-bad-text)] border-[var(--c-status-bad-border)]',
  },
  'out-of-control-high': {
    label: 'Critical — Out of Control',
    icon: <AlertOctagon className="h-3 w-3" aria-hidden="true" />,
    className: 'bg-[var(--c-status-bad-bg)] text-[var(--c-status-bad-text)] border-[var(--c-status-bad-strong-border)]',
  },
  unknown: {
    label: 'Unknown',
    icon: <Minus className="h-3 w-3" aria-hidden="true" />,
    className: 'bg-[var(--c-status-neutral-bg)] text-[var(--c-status-neutral-text)] border-[var(--c-status-neutral-border)]',
  },
}

/**
 * Combination status pill applying SPC + capability logic.
 * Status semantics are never color-only: icon + label always present.
 *
 * Combination logic:
 *   in-control           = no SPC violations AND Cpk ≥ threshold
 *   warning              = no SPC violations AND Cpk < threshold
 *   out-of-control       = SPC violation present
 *   out-of-control-high  = violation AND Cpk < threshold (high confidence)
 */
export default function StatusPill({ status, label, compact = false }: StatusPillProps) {
  const { label: defaultLabel, icon, className } = STATUS_CONFIG[status]
  const displayLabel = label ?? defaultLabel

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}
      title={displayLabel}
    >
      {icon}
      {!compact && <span>{displayLabel}</span>}
      {compact && <span className="sr-only">{displayLabel}</span>}
    </span>
  )
}

/** Helper: derive status from SPC + capability values */
export function deriveStatus(
  hasViolations: boolean,
  cpk: number | null | undefined,
  cpkThreshold = 1.0,
): StatusPillStatus {
  if (cpk == null) return hasViolations ? 'out-of-control' : 'unknown'
  const capable = cpk >= cpkThreshold
  if (hasViolations && !capable) return 'out-of-control-high'
  if (hasViolations) return 'out-of-control'
  if (!capable) return 'warning'
  return 'in-control'
}

/** Helper: derive a text-color class from GRR percentage for MSA verdicts */
export function grrStatusClass(grrPct: number | null | undefined): { colorClass: string; verdict: string } {
  if (grrPct == null) return { colorClass: 'text-slate-400', verdict: 'Unknown' }
  if (grrPct < 10) return { colorClass: 'text-[#143700]', verdict: 'Acceptable' }         /* Forest on Jade bg */
  if (grrPct < 30) return { colorClass: 'text-[#005776]', verdict: 'Conditionally Acceptable' } /* Slate on Sunrise bg */
  return { colorClass: 'text-[#F24A00]', verdict: 'Not Acceptable' }                       /* Sunset */
}

/** Shared ReactNode rendering a StatusPill alongside explanatory children */
export function StatusPillWithReason({
  status,
  children,
}: {
  status: StatusPillStatus
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusPill status={status} />
      {children && <span className="text-sm text-[var(--c-text-muted)]">{children}</span>}
    </div>
  )
}
