function formatLimit(value) {
  return value == null ? '—' : Number(value).toFixed(4)
}

export default function ExcludedPointsPanel({ snapshot, currentPoints = [], onRestorePoint, onRestoreAll, saving }) {
  const pointCount = snapshot?.excluded_count ?? currentPoints.length ?? 0
  const points = currentPoints.length > 0 ? currentPoints : (snapshot?.excluded_points ?? [])
  const before = snapshot?.before_limits ?? null
  const after = snapshot?.after_limits ?? null

  return (
    <section className="spc-audit-panel">
      <div className="spc-audit-panel-header">
        <div>
          <h3 className="spc-audit-panel-title">Excluded Points</h3>
          <p className="spc-audit-panel-subtitle">
            {pointCount} active exclusion{pointCount === 1 ? '' : 's'} for this chart scope
          </p>
        </div>
        <button
          className="spc-btn spc-btn--sm spc-btn--secondary"
          type="button"
          onClick={onRestoreAll}
          disabled={saving || pointCount === 0}
        >
          Restore All
        </button>
      </div>

      {snapshot?.user_id || snapshot?.event_ts ? (
        <div className="spc-audit-meta">
          {snapshot?.user_id && <span>By {snapshot.user_id}</span>}
          {snapshot?.event_ts && <span>{String(snapshot.event_ts).replace('T', ' ').slice(0, 19)}</span>}
          {snapshot?.justification && <span>{snapshot.justification}</span>}
        </div>
      ) : null}

      <div className="spc-audit-diff">
        <div className="spc-audit-diff-card">
          <span className="spc-audit-diff-label">Before</span>
          <strong>CL {formatLimit(before?.cl)}</strong>
          <span>UCL {formatLimit(before?.ucl)} · LCL {formatLimit(before?.lcl)}</span>
        </div>
        <div className="spc-audit-diff-card spc-audit-diff-card--active">
          <span className="spc-audit-diff-label">After</span>
          <strong>CL {formatLimit(after?.cl)}</strong>
          <span>UCL {formatLimit(after?.ucl)} · LCL {formatLimit(after?.lcl)}</span>
        </div>
      </div>

      {points.length === 0 ? (
        <div className="spc-audit-empty">
          No persisted exclusions for this chart yet. Excluded points will appear here with their audit trail.
        </div>
      ) : (
        <div className="spc-audit-list">
          {points.map(point => {
            const pointKey = `${point.batch_id}-${point.sample_seq}-${point.original_index ?? 'saved'}`
            return (
              <div key={pointKey} className="spc-audit-item">
                <div className="spc-audit-item-main">
                  <strong>{point.batch_id ?? 'Point'}</strong>
                  <span>Sample {point.sample_seq ?? '—'}</span>
                  {point.batch_date && <span>{String(point.batch_date).slice(0, 10)}</span>}
                  {point.value != null && <span>Value {Number(point.value).toFixed(4)}</span>}
                </div>
                <button
                  className="spc-btn spc-btn--sm spc-btn--ghost"
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
