import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface MetadataLabelProps {
  children: ReactNode
  className?: string
}

export function MetadataLabel({ children, className }: MetadataLabelProps) {
  return (
    <div className={cn('text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500', className)}>
      {children}
    </div>
  )
}
