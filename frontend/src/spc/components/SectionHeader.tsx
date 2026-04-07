import type { ReactNode } from 'react'
import { moduleEyebrowClass, sectionSubClass, sectionTitleClass } from '../uiClasses'

interface SectionHeaderProps {
  eyebrow?: string
  title: string
  subtitle?: string
  actions?: ReactNode
}

/**
 * Consistent section heading used across all module tabs.
 *
 * Usage:
 *   <SectionHeader eyebrow="Portfolio review" title="Scorecard" subtitle="Use worst-first triage." />
 */
export default function SectionHeader({ eyebrow, title, subtitle, actions }: SectionHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        {eyebrow && <div className={moduleEyebrowClass}>{eyebrow}</div>}
        <h3 className={sectionTitleClass}>{title}</h3>
        {subtitle && <p className={sectionSubClass}>{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
