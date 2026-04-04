/**
 * RiskWarning — Cross-batch exposure panel
 *
 * Shows other FG batches that used the same raw materials.
 * Data sourced from dataset d1fc0037.
 *
 * @param {{ crossBatchExposure: Array|null, loading: boolean }} props
 */
export default function RiskWarning({ crossBatchExposure, loading }) {
  if (loading) {
    return (
      <div className="card risk-warning-card">
        <h3 className="card-title">Recall Readiness</h3>
        <p className="card-loading">Loading exposure…</p>
      </div>
    )
  }

  if (!crossBatchExposure) {
    return (
      <div className="card risk-warning-card">
        <h3 className="card-title">Recall Readiness</h3>
        <p className="card-empty">Select a batch to view cross-batch exposure.</p>
      </div>
    )
  }

  const crossBatch = crossBatchExposure
  const hasRisk = crossBatch && crossBatch.length > 0

  return (
    <div className={`card risk-warning-card ${hasRisk ? 'risk-active' : ''}`}>
      <h3 className="card-title">Recall Readiness</h3>
      {hasRisk ? (
        <>
          <div className="risk-alert">
            <span className="risk-icon">⚠</span>
            <div>
              <p className="risk-title">Cross-Batch Exposure Detected</p>
              <p className="risk-description">
                This batch's raw materials were used in <strong>{crossBatch.length}</strong> other FG batch{crossBatch.length !== 1 ? 'es' : ''}.
              </p>
            </div>
          </div>

          <div className="cross-batch-list">
            {crossBatch.map((batch, idx) => (
              <div
                key={idx}
                className={`cross-batch-item risk-level-${(batch.risk_level || 'medium').toLowerCase()}`}
              >
                <div className="batch-header">
                  <span className="batch-id">{batch.other_batch_id}</span>
                  <span className={`risk-badge risk-${(batch.risk_level || 'medium').toLowerCase()}`}>
                    {batch.risk_level || 'Medium'}
                  </span>
                </div>
                {batch.shared_material_ids && (
                  <p className="batch-materials">
                    Shared: {batch.shared_material_ids}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="risk-clear">
          <p className="risk-title">✓ No Cross-Batch Exposure</p>
          <p className="risk-description">
            Raw materials for this batch were not used in other FG batches.
          </p>
        </div>
      )}
    </div>
  )
}
