import { Tag } from '~/lib/carbon-layout'

const VARIANTS = {
  default: 'cool-gray',
  capable: 'green',
  marginal: 'warm-gray',
  poor: 'red',
  info: 'blue',
}

export function Badge({ children, variant = 'default', className, ...props }) {
  return (
    <Tag type={VARIANTS[variant] ?? VARIANTS.default} size="sm" className={className} {...props}>
      {children}
    </Tag>
  )
}
