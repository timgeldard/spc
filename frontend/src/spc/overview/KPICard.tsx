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
  good: 'text-green-600 border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/50 dark:text-green-400',
  warning: 'text-amber-600 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-400',
  bad: 'text-red-600 border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400',
  neutral: 'text-gray-600 border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400',
} as const

export default function KPICard({ title, value, unit, change, status, icon: Icon }: KPICardProps) {
  return (
    <div className={cn('rounded-2xl border p-6 transition-all hover:shadow-sm', statusColors[status])}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
          <p className="mt-2 text-4xl font-semibold tabular-nums">
            {value}
            {unit && <span className="ml-1 text-2xl font-normal">{unit}</span>}
          </p>
        </div>
        <Icon className="h-8 w-8 opacity-70" />
      </div>
      {change && (
        <p className="mt-4 flex items-center gap-1 text-xs">
          <span className={change.startsWith('+') ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
            {change}
          </span>
          <span className="text-gray-500 dark:text-gray-400">from last shift</span>
        </p>
      )}
    </div>
  )
}
