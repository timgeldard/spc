import { Stack, Tile } from '~/lib/carbon-layout'
import type { ReactNode } from 'react'

interface ModuleEmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export default function ModuleEmptyState({ icon, title, description, action }: ModuleEmptyStateProps) {
  return (
    <Tile>
      <Stack
        gap={4}
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '11.25rem',
          padding: '1rem 2rem',
          textAlign: 'center',
        }}
      >
        {icon && (
          <div style={{ marginBottom: '0.25rem', fontSize: '2.5rem', opacity: 0.5 }}>
            {icon}
          </div>
        )}
        <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>{title}</p>
        {description && (
          <p style={{ margin: 0, maxWidth: '25rem', fontSize: '0.8125rem', lineHeight: 1.5, color: 'var(--cds-text-secondary)' }}>
            {description}
          </p>
        )}
        {action && <div style={{ marginTop: '0.25rem' }}>{action}</div>}
      </Stack>
    </Tile>
  )
}
