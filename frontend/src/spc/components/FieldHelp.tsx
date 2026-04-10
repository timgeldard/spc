import type { ReactNode } from 'react'

interface FieldHelpProps {
  id?: string
  /** Show as a validation error instead of neutral help text */
  error?: boolean
  /** Announce changes to screen readers */
  live?: boolean
  children: ReactNode
}

/**
 * Inline field help or validation message using Carbon token styles.
 *
 * Usage:
 *   <FieldHelp id="spc-material-help">Validate the material before proceeding.</FieldHelp>
 *   <FieldHelp error live>Material not found — check the ID and try again.</FieldHelp>
 */
export default function FieldHelp({ id, error = false, live = false, children }: FieldHelpProps) {
  return (
    <span
      id={id}
      style={{
        fontSize: '0.75rem',
        color: error ? 'var(--cds-support-error)' : 'var(--cds-text-secondary)',
        fontWeight: error ? 600 : 400,
      }}
      role={error && live ? 'alert' : undefined}
      aria-live={live ? (error ? 'assertive' : 'polite') : undefined}
    >
      {children}
    </span>
  )
}
