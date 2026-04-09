import { Tooltip as CarbonTooltip } from '~/lib/carbon-feedback'

export function Tooltip({ children, content, side = 'top' }) {
  return (
    <CarbonTooltip align={side} description={content} enterDelayMs={300}>
      {children}
    </CarbonTooltip>
  )
}
