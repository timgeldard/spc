import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'dark'
  children: ReactNode
}

export function Card({ className, variant = 'default', children, ...props }: CardProps) {
  const baseClasses = 'bg-[var(--c-surface)] border border-[var(--c-border)] rounded-sm shadow-sm overflow-hidden transition-shadow'
  const darkClasses = 'bg-[var(--c-surface)] border-[var(--c-border)] shadow-xl text-white'

  return (
    <div
      className={cn(variant === 'dark' ? darkClasses : baseClasses, className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('px-6 py-5 border-b border-[var(--c-border)]', className)}>
      {children}
    </div>
  )
}

export function CardContent({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-6', className)}>{children}</div>
}

export function CardTitle({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <h3 className={cn('text-[var(--c-text)] text-xl font-semibold tracking-tight', className)}>
      {children}
    </h3>
  )
}
