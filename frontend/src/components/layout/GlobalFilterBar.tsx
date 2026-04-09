import type { ReactNode } from 'react'

interface GlobalFilterBarProps {
  children?: ReactNode
}

export function GlobalFilterBar({ children }: GlobalFilterBarProps) {
  return (
    <div className="spc-global-filter-bar">
      <div className="spc-global-filter-bar__inner">{children}</div>
    </div>
  )
}
