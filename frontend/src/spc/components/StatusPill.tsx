import type { ReactNode } from 'react'
import { Tag } from '~/lib/carbon-layout'
import CheckmarkFilled from '@carbon/icons-react/es/CheckmarkFilled.js'
import Misuse from '@carbon/icons-react/es/Misuse.js'
import SubtractFilled from '@carbon/icons-react/es/SubtractFilled.js'
import WarningAltFilled from '@carbon/icons-react/es/WarningAltFilled.js'
import WarningFilled from '@carbon/icons-react/es/WarningFilled.js'

export type StatusPillStatus =
  | 'in-control'           // No SPC violations AND Cpk >= threshold
  | 'warning'              // No SPC violations BUT Cpk < threshold
  | 'out-of-control'       // SPC violation present
  | 'out-of-control-high'  // Violation AND Cpk < threshold
  | 'unknown'              // Insufficient data

interface StatusPillProps {
  status: StatusPillStatus
  /** Override the default label */
  label?: string
  /** Show a compact (sm) tag — label remains in aria-label */
  compact?: boolean
}

// Carbon Tag type mapping for SPC statuses.
// Color is never the sole differentiator — icon + label always present (WCAG 1.4.1).
const STATUS_CONFIG: Record<
  StatusPillStatus,
  { type: 'green' | 'warm-gray' | 'red' | 'gray' | 'high-contrast'; defaultLabel: string; icon: React.ComponentType<{ size?: number }> }
> = {
  'in-control':          { type: 'green',          defaultLabel: 'In Control',              icon: CheckmarkFilled    },
  'warning':             { type: 'warm-gray',       defaultLabel: 'Warning',                 icon: WarningAltFilled   },
  'out-of-control':      { type: 'red',             defaultLabel: 'Out of Control',          icon: WarningFilled      },
  'out-of-control-high': { type: 'high-contrast',   defaultLabel: 'Critical — Out of Control', icon: Misuse           },
  'unknown':             { type: 'gray',            defaultLabel: 'Unknown',                 icon: SubtractFilled     },
}

export default function StatusPill({ status, label, compact = false }: StatusPillProps) {
  const { type, defaultLabel, icon: Icon } = STATUS_CONFIG[status]
  const displayLabel = label ?? defaultLabel

  if (compact) {
    return (
      <Tag
        type={type}
        size="sm"
        renderIcon={() => <Icon size={12} />}
        title={displayLabel}
        aria-label={displayLabel}
        style={{ paddingInline: '0.25rem' }}
      >
        <span
          style={{
            position: 'absolute',
            width: '1px',
            height: '1px',
            padding: 0,
            margin: '-1px',
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
        >
          {displayLabel}
        </span>
      </Tag>
    )
  }

  return (
    <Tag
      type={type}
      size="md"
      renderIcon={() => <Icon size={14} />}
      title={displayLabel}
    >
      {displayLabel}
    </Tag>
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
  if (hasViolations)             return 'out-of-control'
  if (!capable)                  return 'warning'
  return 'in-control'
}

/** Helper: derive a text-color class from GRR percentage for MSA verdicts.
 *  NOTE: This returns Carbon CSS custom property values, not Tailwind classes. */
export function grrStatusClass(grrPct: number | null | undefined): { colorStyle: string; verdict: string } {
  if (grrPct == null) return { colorStyle: 'var(--cds-text-secondary)', verdict: 'Unknown'                  }
  if (grrPct < 10)    return { colorStyle: 'var(--cds-support-success)', verdict: 'Acceptable'              }
  if (grrPct < 30)    return { colorStyle: 'var(--cds-support-warning)', verdict: 'Conditionally Acceptable' }
  return                     { colorStyle: 'var(--cds-support-error)',   verdict: 'Not Acceptable'           }
}

/** Shared composition — StatusPill alongside explanatory children */
export function StatusPillWithReason({
  status,
  children,
}: {
  status: StatusPillStatus
  children?: ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
      <StatusPill status={status} />
      {children && (
        <span style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
          {children}
        </span>
      )}
    </div>
  )
}
