import { Stack, Tile } from '~/lib/carbon-layout'

interface EmptyStateProps {
  message?: string
}

export default function EmptyState({ message = 'No data available for selected filters' }: EmptyStateProps) {
  return (
    <Tile>
      <Stack
        gap={4}
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '16rem',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '3rem', color: 'var(--cds-icon-secondary)' }} aria-hidden="true">
          [chart]
        </div>
        <p style={{ margin: 0, maxWidth: '18rem', color: 'var(--cds-text-secondary)' }}>{message}</p>
      </Stack>
    </Tile>
  )
}
