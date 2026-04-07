import type { ReactNode } from 'react'
import { fieldHelpClass, fieldValidationErrorClass } from '../uiClasses'

interface FieldHelpProps {
  id?: string
  /** Show as a validation error instead of neutral help text */
  error?: boolean
  /** Announce changes to screen readers */
  live?: boolean
  children: ReactNode
}

/**
 * Inline field help or validation message.
 * Uses fieldHelpClass (neutral) or fieldValidationErrorClass (error) tokens.
 *
 * Usage:
 *   <FieldHelp id="spc-material-help">Validate the material before proceeding.</FieldHelp>
 *   <FieldHelp error live>Material not found — check the ID and try again.</FieldHelp>
 */
export default function FieldHelp({ id, error = false, live = false, children }: FieldHelpProps) {
  return (
    <span
      id={id}
      className={error ? fieldValidationErrorClass : fieldHelpClass}
      role={error ? 'alert' : undefined}
      aria-live={live ? (error ? 'assertive' : 'polite') : undefined}
    >
      {children}
    </span>
  )
}
