import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'

interface KPICardProps {
  title: string
  value: string | number
  unit?: string
  change?: string
  status: 'good' | 'warning' | 'bad' | 'neutral'
  icon: LucideIcon
}

const statusColors = {
  good:    'text-[var(--c-status-ok-text)] border-[var(--c-status-ok-border)] bg-[var(--c-status-ok-bg)]',
  warning: 'text-[var(--c-status-warn-text)] border-[var(--c-status-warn-border)] bg-[var(--c-status-warn-bg)]',
  bad:     'text-[var(--c-status-bad-text)] border-[var(--c-status-bad-border)] bg-[var(--c-status-bad-bg)]',
  neutral: 'text-[var(--c-text-muted)] border-[var(--c-border)] bg-[var(--c-surface)]',
} as const

export default function KPICard({ title, value, unit, change, status, icon: Icon }: KPICardProps) {
  return (
    <div className={cn('rounded-sm border p-5 transition-all', statusColors[status])}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-[var(--c-text-muted)]">{title}</p>
          <p className="mt-2 font-mono text-4xl font-semibold tabular-nums text-[var(--c-text)]">
            {value}
            {unit && <span className="ml-1 text-2xl font-normal text-[var(--c-text)]">{unit}</span>}
          </p>
        </div>
        <Icon className="h-6 w-6 opacity-60" />
      </div>
      {change && (
        <p className="mt-4 flex items-center gap-1 text-xs">
          <span className={change.startsWith('+') ? 'text-[var(--c-status-ok-text)]' : 'text-[var(--c-status-bad-text)]'}>
            {change}
          </span>
          <span className="text-[var(--c-text-muted)]">from last shift</span>
        </p>
      )}
    </div>
  )
}
