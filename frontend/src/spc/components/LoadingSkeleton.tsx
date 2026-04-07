import { loadingClass, spinnerClass } from '../uiClasses'

interface LoadingSkeletonProps {
  /** Show animated skeleton lines instead of a spinner. Use for table/list contexts. */
  variant?: 'spinner' | 'lines'
  message?: string
  /** Number of skeleton lines (variant="lines" only) */
  lines?: number
  /** Minimum height for the container */
  minHeight?: string
}

/**
 * Consistent loading state for all module tabs.
 * - variant="spinner" (default): centered spinner + message, matches loadingClass token
 * - variant="lines": animated skeleton rows for table/list contexts
 *
 * Replaces: PanelLoadingState(), ChartLoadingState(), ScorecardPanelLoadingState(),
 *           and ad-hoc inline skeleton divs.
 */
export default function LoadingSkeleton({
  variant = 'spinner',
  message = 'Loading…',
  lines = 5,
  minHeight,
}: LoadingSkeletonProps) {
  if (variant === 'lines') {
    return (
      <div className="flex flex-col gap-3 py-6" style={minHeight ? { minHeight } : undefined}>
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            className="h-10 animate-pulse rounded-md bg-slate-200/70"
            style={{ width: i % 3 === 0 ? '100%' : i % 3 === 1 ? `${83 + (i % 2) * 4}%` : '66%' }}
            aria-hidden="true"
          />
        ))}
        <span className="sr-only">{message}</span>
      </div>
    )
  }

  return (
    <div
      className={loadingClass}
      style={minHeight ? { minHeight } : undefined}
      aria-live="polite"
      aria-label={message}
    >
      <div className={spinnerClass} aria-hidden="true" />
      <p>{message}</p>
    </div>
  )
}
