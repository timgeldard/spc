import type { ReactNode } from 'react'

interface MetadataLabelProps {
  children: ReactNode
  className?: string
}

export function MetadataLabel({ children, className }: MetadataLabelProps) {
  return (
    <div
      className={className}
      style={{
        fontSize: '0.625rem',
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--cds-text-secondary)',
      }}
    >
      {children}
    </div>
  )
}
