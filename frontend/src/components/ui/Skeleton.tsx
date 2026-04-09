import { SkeletonPlaceholder, SkeletonText as CarbonSkeletonText } from '~/lib/carbon-feedback'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return <SkeletonPlaceholder className={className} />
}

Skeleton.Text = function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={className} aria-busy="true" aria-label="Loading text">
      <CarbonSkeletonText paragraph lineCount={lines} heading={false} />
    </div>
  )
}

Skeleton.Chart = function SkeletonChart({ className }: { className?: string }) {
  return (
    <div className={className} aria-busy="true" aria-label="Loading chart">
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        <SkeletonPlaceholder style={{ width: '100%', height: '280px' }} />
        <SkeletonPlaceholder style={{ width: '100%', height: '160px' }} />
      </div>
    </div>
  )
}

Skeleton.Table = function SkeletonTable({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={className} aria-busy="true" aria-label="Loading table">
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        <SkeletonPlaceholder style={{ width: '100%', height: '2rem' }} />
        {Array.from({ length: rows }, (_, i) => (
          <SkeletonPlaceholder key={i} style={{ width: '100%', height: '2.5rem' }} />
        ))}
      </div>
    </div>
  )
}
