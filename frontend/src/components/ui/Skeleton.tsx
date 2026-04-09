import { cn } from '../../lib/utils'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn('animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700', className)} />
}

Skeleton.Text = function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-busy="true" aria-label="Loading text">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className={cn(
            'animate-pulse rounded bg-slate-200 dark:bg-slate-700 h-4',
            i === lines - 1 ? 'w-3/4' : 'w-full',
          )}
        />
      ))}
    </div>
  )
}

Skeleton.Chart = function SkeletonChart({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse space-y-2', className)} aria-busy="true" aria-label="Loading chart">
      <div className="h-[280px] rounded-xl bg-slate-200 dark:bg-slate-700" />
      <div className="h-[160px] rounded-xl bg-slate-200 dark:bg-slate-700" />
    </div>
  )
}

Skeleton.Table = function SkeletonTable({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-busy="true" aria-label="Loading table">
      <div className="animate-pulse h-8 rounded-lg bg-slate-200 dark:bg-slate-700" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="animate-pulse h-10 rounded-lg bg-slate-100 dark:bg-slate-800" />
      ))}
    </div>
  )
}
