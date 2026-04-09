import { Tile } from '~/lib/carbon-layout'
import type { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'dark'
  children: ReactNode
}

export function Card({ className, variant = 'default', children, ...props }: CardProps) {
  return (
    <Tile
      className={className}
      style={{
        overflow: 'hidden',
        transition: 'box-shadow 160ms ease',
        background: 'var(--cds-layer)',
        border: `1px solid ${variant === 'dark' ? 'var(--cds-border-strong-01)' : 'var(--cds-border-subtle-01)'}`,
        color: variant === 'dark' ? 'var(--cds-text-primary)' : undefined,
      }}
      {...props}
    >
      {children}
    </Tile>
  )
}

export function CardHeader({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={className}
      style={{
        padding: '1.25rem 1.5rem',
        borderBottom: '1px solid var(--cds-border-subtle-01)',
      }}
    >
      {children}
    </div>
  )
}

export function CardContent({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={className} style={{ padding: '1.5rem' }}>
      {children}
    </div>
  )
}

export function CardTitle({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <h3
      className={className}
      style={{
        margin: 0,
        color: 'var(--cds-text-primary)',
        fontSize: '1.25rem',
        fontWeight: 600,
        letterSpacing: '-0.01em',
      }}
    >
      {children}
    </h3>
  )
}
