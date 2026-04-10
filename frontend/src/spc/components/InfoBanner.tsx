import { InlineNotification } from '~/lib/carbon-feedback'

type Variant = 'error' | 'warn' | 'info' | 'neutral'

const KIND_MAP: Record<Variant, 'error' | 'warning' | 'info' | 'info-square'> = {
  error:   'error',
  warn:    'warning',
  info:    'info',
  neutral: 'info-square',
}

interface InfoBannerProps {
  variant?: Variant
  children: string
}

/**
 * Inline info/warning/error banner backed by Carbon InlineNotification.
 *
 * Usage:
 *   <InfoBanner variant="error">Failed to load data: {error}</InfoBanner>
 *   <InfoBanner variant="warn">More than 30 characteristics detected.</InfoBanner>
 */
export default function InfoBanner({ variant = 'neutral', children }: InfoBannerProps) {
  return (
    <InlineNotification
      kind={KIND_MAP[variant]}
      title=""
      subtitle={children}
      hideCloseButton
      lowContrast
      role={variant === 'error' ? 'alert' : 'status'}
    />
  )
}
