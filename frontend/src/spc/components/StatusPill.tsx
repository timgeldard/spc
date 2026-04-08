import type { ReactNode } from 'react'

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

const STATUS_CONFIG: Record<StatusPillStatus, { label: string; icon: string; className: string }> = {
  'in-control': {
    label: 'In Control',
    icon: '✓',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  warning: {
    label: 'Warning',
    icon: '⚠',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  'out-of-control': {
    label: 'Out of Control',
    icon: '✕',
    className: 'bg-red-50 text-red-700 border-red-200',
  },
  'out-of-control-high': {
    label: 'Critical — Out of Control',
    icon: '‼',
    className: 'bg-red-100 text-red-800 border-red-400',
  },
  unknown: {
    label: 'Unknown',
    icon: '—',
    className: 'bg-slate-100 text-slate-500 border-slate-200',
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
      <span aria-hidden="true">{icon}</span>
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
  if (grrPct < 10) return { colorClass: 'text-emerald-700', verdict: 'Acceptable' }
  if (grrPct < 30) return { colorClass: 'text-amber-700', verdict: 'Conditionally Acceptable' }
  return { colorClass: 'text-red-700', verdict: 'Not Acceptable' }
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
