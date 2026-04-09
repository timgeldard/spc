import { InlineLoading, SkeletonPlaceholder } from '~/lib/carbon-feedback'
import { Stack } from '~/lib/carbon-layout'

interface LoadingSkeletonProps {
  variant?: 'spinner' | 'lines'
  message?: string
  lines?: number
  minHeight?: string
}

export default function LoadingSkeleton({
  variant = 'spinner',
  message = 'Loading…',
  lines = 5,
  minHeight,
}: LoadingSkeletonProps) {
  if (variant === 'lines') {
    return (
      <div style={minHeight ? { minHeight } : undefined}>
        <Stack gap={3} style={{ padding: '1.5rem 0' }}>
          {Array.from({ length: lines }, (_, i) => (
            <SkeletonPlaceholder
              key={i}
              style={{ width: i % 3 === 0 ? '100%' : i % 3 === 1 ? `${83 + (i % 2) * 4}%` : '66%', height: '2.5rem' }}
              aria-hidden="true"
            />
          ))}
          <span
            style={{
              position: 'absolute',
              width: '1px',
              height: '1px',
              padding: 0,
              margin: '-1px',
              overflow: 'hidden',
              clip: 'rect(0, 0, 0, 0)',
              whiteSpace: 'nowrap',
              border: 0,
            }}
          >
            {message}
          </span>
        </Stack>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        padding: '1.5rem',
        color: 'var(--cds-text-secondary)',
      }}
      aria-live="polite"
      aria-label={message}
    >
      <InlineLoading description={message} status="active" />
    </div>
  )
}
