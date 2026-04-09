import { Tooltip as CarbonTooltip } from '~/lib/carbon-feedback'
import type { JSX, ReactElement, ReactNode } from 'react'

interface TooltipProps {
  children: ReactElement<JSX.IntrinsicElements[keyof JSX.IntrinsicElements]>
  content: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
}

export function Tooltip({ children, content, side = 'top', className }: TooltipProps) {
  return (
    <CarbonTooltip align={side} description={content} className={className} enterDelayMs={200}>
      {children}
    </CarbonTooltip>
  )
}
