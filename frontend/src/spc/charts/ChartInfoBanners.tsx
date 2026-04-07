import { AlertTriangle } from 'lucide-react'

import type { ExclusionAuditSnapshot } from '../types'
import {
  infoBannerErrorClass,
  infoBannerInfoClass,
  infoBannerNeutralClass,
  infoBannerWarnClass,
} from '../uiClasses'

interface ChartInfoBannersProps {
  lockedLimitsError?: string | null
  exclusionsError?: string | null
  exclusionsLoading?: boolean
  dataTruncated?: boolean
  exclusionAudit?: ExclusionAuditSnapshot | null
}

export default function ChartInfoBanners({
  lockedLimitsError,
  exclusionsError,
  exclusionsLoading = false,
  dataTruncated = false,
  exclusionAudit,
}: ChartInfoBannersProps) {
  return (
    <>
      {lockedLimitsError && (
        <div className={infoBannerErrorClass} role="alert">
          Locked limits error: {lockedLimitsError}
        </div>
      )}
      {exclusionsError && (
        <div className={infoBannerErrorClass} role="alert">
          Exclusions audit error: {exclusionsError}
        </div>
      )}
      {exclusionsLoading && (
        <div className={infoBannerInfoClass} role="status" aria-live="polite">
          Loading persisted exclusions…
        </div>
      )}
      {dataTruncated && (
        <div className={infoBannerWarnClass} role="alert">
          <AlertTriangle size={16} />
          <span>Data limit reached. Only the first 10,000 points are displayed. Please narrow your Date Range for a complete analysis.</span>
        </div>
      )}
      {exclusionAudit && (
        <div className={infoBannerNeutralClass} role="status" aria-live="polite">
          {exclusionAudit.excluded_count ?? 0} point{(exclusionAudit.excluded_count ?? 0) !== 1 ? 's' : ''} excluded
          {exclusionAudit.user_id ? ` by ${exclusionAudit.user_id}` : ''}
          {exclusionAudit.event_ts ? ` on ${String(exclusionAudit.event_ts).replace('T', ' ').slice(0, 19)}` : ''}
          {exclusionAudit.justification ? ` — ${exclusionAudit.justification}` : ''}
        </div>
      )}
    </>
  )
}
