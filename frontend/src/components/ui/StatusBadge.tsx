import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import type { ElementType } from 'react'
import { cn } from '../../lib/utils'

type Status = 'healthy' | 'warning' | 'critical'
type StatusColor = 'emerald' | 'amber' | 'rose'

const statusConfig: Record<Status, { color: StatusColor; icon: ElementType }> = {
  healthy: { color: 'emerald', icon: CheckCircle },
  warning: { color: 'amber', icon: AlertTriangle },
  critical: { color: 'rose', icon: XCircle },
}

interface StatusBadgeProps {
  status: Status
  label: string
  className?: string
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const { color, icon: Icon } = statusConfig[status]

  const colorMap: Record<StatusColor, string> = {
    emerald: 'border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50',
    amber: 'border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50',
    rose: 'border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50',
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-3xl text-xs font-medium border',
        colorMap[color],
        className,
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </div>
  )
}
