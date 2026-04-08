import * as RadixTooltip from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface TooltipProps {
  children: ReactNode
  content: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
}

export function Tooltip({ children, content, side = 'top', className }: TooltipProps) {
  return (
    <RadixTooltip.Provider delayDuration={200}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            sideOffset={8}
            className={cn(
              'z-50 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-2xl',
              className,
            )}
          >
            {content}
            <RadixTooltip.Arrow className="fill-white" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  )
}
