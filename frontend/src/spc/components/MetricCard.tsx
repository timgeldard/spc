import type { ReactNode } from 'react'
import { metricCardLabelClass, metricCardMetaClass, metricCardValueClass, scorecardKpiClass } from '../uiClasses'

interface MetricCardProps {
  label: string
  value: ReactNode
  meta?: string
  /** Extra Tailwind border/background classes for status-coloured variants */
  colorClass?: string
}

/**
 * KPI metric card. Consistent replacement for ad-hoc scorecardKpiClass + hardcoded color inline styles.
 *
 * Usage:
 *   <MetricCard label="Not Capable" value={4} meta="Immediate attention required"
 *     colorClass="border-red-200 bg-red-50 text-red-700" />
 */
export default function MetricCard({ label, value, meta, colorClass }: MetricCardProps) {
  return (
    <div className={`${scorecardKpiClass}${colorClass ? ` ${colorClass}` : ''}`}>
      <span className={metricCardValueClass}>{value}</span>
      <span className={metricCardLabelClass}>{label}</span>
      {meta && <span className={`${metricCardMetaClass} block`}>{meta}</span>}
    </div>
  )
}
