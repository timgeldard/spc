import { Stack, Tile } from '~/lib/carbon-layout'

export default function EmptyState({ icon, title, subtitle }) {
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
        <div style={{ color: 'var(--cds-icon-secondary)' }}>
          {icon ?? (
            <svg width="80" height="60" viewBox="0 0 80 60" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="1" width="78" height="58" rx="5" stroke="currentColor" strokeWidth="2" strokeDasharray="6 4"/>
              <line x1="1" y1="45" x2="79" y2="45" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3"/>
              <circle cx="20" cy="32" r="3" fill="currentColor"/>
              <circle cx="35" cy="24" r="3" fill="currentColor"/>
              <circle cx="50" cy="28" r="3" fill="currentColor"/>
              <circle cx="65" cy="18" r="3" fill="currentColor"/>
              <polyline points="20,32 35,24 50,28 65,18" stroke="currentColor" strokeWidth="1.5" fill="none"/>
            </svg>
          )}
        </div>
        <div>
          <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>{title}</p>
          {subtitle && (
            <p style={{ margin: '0.25rem auto 0', maxWidth: '18rem', fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
              {subtitle}
            </p>
          )}
        </div>
      </Stack>
    </Tile>
  )
}
