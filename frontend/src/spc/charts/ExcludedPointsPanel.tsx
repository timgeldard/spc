import type { ExcludedPoint, ExclusionAuditSnapshot } from '../types'
import {
  auditDiffCardActiveClass,
  auditDiffCardClass,
  auditDiffClass,
  auditDiffLabelClass,
  auditEmptyClass,
  auditHeaderClass,
  auditItemClass,
  auditItemMainClass,
  auditListClass,
  auditMetaClass,
  auditPanelClass,
  auditSubtitleClass,
  auditTitleClass,
  buttonBaseClass,
  buttonGhostClass,
  buttonSecondaryClass,
  buttonSmClass,
} from '../uiClasses'

function formatLimit(value: number | null | undefined) {
  return value == null ? '—' : Number(value).toFixed(4)
}

interface ExcludedPointsPanelProps {
  snapshot: ExclusionAuditSnapshot | null
  currentPoints?: ExcludedPoint[]
  onRestorePoint?: (point: ExcludedPoint) => void
  onRestoreAll: () => void
  saving: boolean
}

export default function ExcludedPointsPanel({
  snapshot,
  currentPoints = [],
  onRestorePoint,
  onRestoreAll,
  saving,
}: ExcludedPointsPanelProps) {
  const pointCount = snapshot?.excluded_count ?? currentPoints.length ?? 0
  const points = currentPoints.length > 0 ? currentPoints : (snapshot?.excluded_points ?? [])
  const before = snapshot?.before_limits ?? null
  const after = snapshot?.after_limits ?? null

  return (
    <section className={auditPanelClass}>
      <div className={auditHeaderClass}>
        <div>
          <h3 className={auditTitleClass}>Excluded Points</h3>
          <p className={auditSubtitleClass}>
            {pointCount} active exclusion{pointCount === 1 ? '' : 's'} for this chart scope
          </p>
        </div>
        <button
          className={`${buttonBaseClass} ${buttonSmClass} ${buttonSecondaryClass}`}
          type="button"
          onClick={onRestoreAll}
          disabled={saving || pointCount === 0}
        >
          Restore All
        </button>
      </div>

      {snapshot?.user_id || snapshot?.event_ts ? (
        <div className={auditMetaClass}>
          {snapshot?.user_id && <span>By {snapshot.user_id}</span>}
          {snapshot?.event_ts && <span>{String(snapshot.event_ts).replace('T', ' ').slice(0, 19)}</span>}
          {snapshot?.justification && <span>{snapshot.justification}</span>}
        </div>
      ) : null}

      <div className={auditDiffClass}>
        <div className={auditDiffCardClass}>
          <span className={auditDiffLabelClass}>Before</span>
          <strong>CL {formatLimit(before?.cl)}</strong>
          <span>UCL {formatLimit(before?.ucl)} · LCL {formatLimit(before?.lcl)}</span>
        </div>
        <div className={`${auditDiffCardClass} ${auditDiffCardActiveClass}`}>
          <span className={auditDiffLabelClass}>After</span>
          <strong>CL {formatLimit(after?.cl)}</strong>
          <span>UCL {formatLimit(after?.ucl)} · LCL {formatLimit(after?.lcl)}</span>
        </div>
      </div>

      {points.length === 0 ? (
        <div className={auditEmptyClass}>
          No persisted exclusions for this chart yet. Excluded points will appear here with their audit trail.
        </div>
      ) : (
        <div className={auditListClass}>
          {points.map((point, index) => {
            const pointKey = `${point.batch_id}-${point.sample_seq}-${point.plant_id ?? ''}-${point.stratify_value ?? ''}-${point.original_index ?? `saved-${index}`}`
            return (
              <div key={pointKey} className={auditItemClass}>
                <div className={auditItemMainClass}>
                  <strong>{point.batch_id ?? 'Point'}</strong>
                  <span>Sample {point.sample_seq ?? '—'}</span>
                  {point.batch_date && <span>{String(point.batch_date).slice(0, 10)}</span>}
                  {point.value != null && <span>Value {Number(point.value).toFixed(4)}</span>}
                </div>
                <button
                  className={`${buttonBaseClass} ${buttonSmClass} ${buttonGhostClass}`}
                  type="button"
                  onClick={() => onRestorePoint?.(point)}
                  disabled={saving}
                >
                  Restore
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
