import { cn } from '../../lib/utils'

const VARIANTS = {
  default: 'bg-gray-100 text-gray-800',
  capable: 'bg-emerald-50 text-emerald-700',
  marginal: 'bg-amber-50 text-amber-700',
  poor: 'bg-red-50 text-red-700',
  info: 'bg-sky-50 text-sky-700',
}

export function Badge({ children, variant = 'default', className, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        VARIANTS[variant] ?? VARIANTS.default,
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}
