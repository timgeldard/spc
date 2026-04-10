import { InlineNotification } from '~/lib/carbon-feedback'
import type { ExclusionAuditSnapshot } from '../types'

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
        <InlineNotification
          kind="error"
          title="Locked limits error:"
          subtitle={lockedLimitsError}
          hideCloseButton
          lowContrast
        />
      )}
      {exclusionsError && (
        <InlineNotification
          kind="error"
          title="Exclusions audit error:"
          subtitle={exclusionsError}
          hideCloseButton
          lowContrast
        />
      )}
      {exclusionsLoading && (
        <InlineNotification
          kind="info"
          title="Loading persisted exclusions…"
          hideCloseButton
          lowContrast
        />
      )}
      {dataTruncated && (
        <InlineNotification
          kind="warning"
          title="Data limit reached."
          subtitle="Only the first 10,000 points are displayed. Please narrow your Date Range for a complete analysis."
          hideCloseButton
          lowContrast
        />
      )}
      {exclusionAudit && (
        <InlineNotification
          kind="info"
          title={`${exclusionAudit.excluded_count ?? 0} point${(exclusionAudit.excluded_count ?? 0) !== 1 ? 's' : ''} excluded`}
          subtitle={[
            exclusionAudit.user_id ? `by ${exclusionAudit.user_id}` : '',
            exclusionAudit.event_ts ? `on ${String(exclusionAudit.event_ts).replace('T', ' ').slice(0, 19)}` : '',
            exclusionAudit.justification ? `— ${exclusionAudit.justification}` : '',
          ].filter(Boolean).join(' ')}
          hideCloseButton
          lowContrast
        />
      )}
    </>
  )
}
