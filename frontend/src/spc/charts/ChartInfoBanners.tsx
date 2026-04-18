import { InlineNotification } from '~/lib/carbon-feedback'
import type { AutocorrelationResult, ExclusionAuditSnapshot, SpecDriftWarning } from '../types'

interface ChartInfoBannersProps {
  lockedLimitsError?: string | null
  lockedLimitsWarning?: string | null
  exclusionsError?: string | null
  exclusionsLoading?: boolean
  dataTruncated?: boolean
  exclusionAudit?: ExclusionAuditSnapshot | null
  specDrift?: SpecDriftWarning | null
  autocorrelation?: AutocorrelationResult | null
}

function formatAutocorrelationSubtitle(ac: AutocorrelationResult): string {
  const basisLabel = ac.basis === 'subgroup_means' ? 'subgroup means' : 'individual values'
  return `Lag-1 autocorrelation on ${basisLabel} is ${ac.rho.toFixed(2)} (n=${ac.n}). Shewhart charts assume independence; consider EWMA, CUSUM, or a time-series model before acting on signals.`
}

export default function ChartInfoBanners({
  lockedLimitsError,
  lockedLimitsWarning,
  exclusionsError,
  exclusionsLoading = false,
  dataTruncated = false,
  exclusionAudit,
  specDrift,
  autocorrelation,
}: ChartInfoBannersProps) {
  return (
    <>
      {autocorrelation?.suspected && (
        <InlineNotification
          kind="warning"
          title="Autocorrelation suspected."
          subtitle={formatAutocorrelationSubtitle(autocorrelation)}
          hideCloseButton
          lowContrast
        />
      )}
      {specDrift?.detected && (
        <InlineNotification
          kind="warning"
          title="Specification drift detected."
          subtitle={
            specDrift.change_references && specDrift.change_references.length > 0
              ? `${specDrift.message} Change orders: ${specDrift.change_references.join(', ')}.`
              : specDrift.message
          }
          hideCloseButton
          lowContrast
        />
      )}
      {lockedLimitsError && (
        <InlineNotification
          kind="error"
          title="Locked limits error:"
          subtitle={lockedLimitsError}
          hideCloseButton
          lowContrast
        />
      )}
      {lockedLimitsWarning && (
        <InlineNotification
          kind="warning"
          title="Locked limits warning:"
          subtitle={lockedLimitsWarning}
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
            exclusionAudit.event_ts ? `on ${new Date(String(exclusionAudit.event_ts)).toISOString().replace('T', ' ')}` : '',
            exclusionAudit.justification ? `— ${exclusionAudit.justification}` : '',
          ].filter(Boolean).join(' ')}
          hideCloseButton
          lowContrast
        />
      )}
    </>
  )
}
