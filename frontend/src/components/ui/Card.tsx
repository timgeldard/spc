import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'dark'
  children: ReactNode
}

export function Card({ className, variant = 'default', children, ...props }: CardProps) {
  const baseClasses = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-shadow'
  const darkClasses = 'bg-slate-900 border-slate-700 shadow-xl text-white hover:border-slate-600'

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
    <div className={cn('px-6 py-5 border-b border-slate-200 dark:border-slate-700', className)}>
      {children}
    </div>
  )
}

export function CardContent({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-6', className)}>{children}</div>
}

export function CardTitle({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <h3 className={cn('text-slate-900 dark:text-white text-xl font-semibold tracking-tight', className)}>
      {children}
    </h3>
  )
}
