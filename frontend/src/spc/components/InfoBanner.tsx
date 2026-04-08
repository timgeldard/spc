import type { ReactNode } from 'react'
import { infoBannerErrorClass, infoBannerInfoClass, infoBannerNeutralClass, infoBannerWarnClass } from '../uiClasses'

type Variant = 'error' | 'warn' | 'info' | 'neutral'

const VARIANT_CLASS: Record<Variant, string> = {
  error: infoBannerErrorClass,
  warn: infoBannerWarnClass,
  info: infoBannerInfoClass,
  neutral: infoBannerNeutralClass,
}

interface InfoBannerProps {
  variant?: Variant
  children: ReactNode
}

/**
 * Consistent info/warning/error banner. Replaces ad-hoc .banner.banner--* CSS classes.
 *
 * Usage:
 *   <InfoBanner variant="error">Failed to load data: {error}</InfoBanner>
 *   <InfoBanner variant="warn">More than 30 characteristics detected.</InfoBanner>
 */
export default function InfoBanner({ variant = 'neutral', children }: InfoBannerProps) {
  return (
    <div
      className={VARIANT_CLASS[variant]}
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
    >
      {children}
    </div>
  )
}
