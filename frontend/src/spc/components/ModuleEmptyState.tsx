import type { ReactNode } from 'react'
import { emptyCardClass, emptyIconClass, emptySubClass } from '../uiClasses'

interface ModuleEmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  /** Optional call-to-action or next-step content */
  action?: ReactNode
}

/**
 * Consistent empty state for all module tabs.
 * Replaces ad-hoc hardcoded flex/center/gray divs.
 *
 * Usage:
 *   <ModuleEmptyState
 *     icon="📈"
 *     title="No material selected"
 *     description="Select a material above to view the scorecard."
 *   />
 */
export default function ModuleEmptyState({ icon, title, description, action }: ModuleEmptyStateProps) {
  return (
    <div className={emptyCardClass}>
      {icon && <div className={emptyIconClass}>{icon}</div>}
      <p className="text-sm font-semibold text-[var(--c-text)]">{title}</p>
      {description && <p className={emptySubClass}>{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
