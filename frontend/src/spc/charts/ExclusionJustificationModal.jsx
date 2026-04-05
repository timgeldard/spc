import { useEffect, useState } from 'react'

const REASONS = [
  'Special-cause investigation',
  'Sampling / transcription error',
  'Instrument or lab issue',
  'Phase I stabilization',
  'Manual review override',
]

export default function ExclusionJustificationModal({ dialog, saving, onCancel, onSubmit }) {
  const [reason, setReason] = useState(REASONS[0])
  const [comment, setComment] = useState('')

  useEffect(() => {
    if (!dialog) return
    setReason(
      dialog.action === 'manual_restore'
        ? 'Manual review override'
        : dialog.action === 'auto_clean_phase_i'
          ? 'Phase I stabilization'
          : REASONS[0],
    )
    setComment('')
  }, [dialog])

  if (!dialog) return null

  const title = dialog.action === 'manual_restore'
    ? 'Restore Point to Calculation Set'
    : dialog.action === 'clear_exclusions'
      ? 'Restore All Excluded Points'
      : dialog.action === 'auto_clean_phase_i'
        ? 'Apply Phase I Auto-clean'
        : 'Exclude Point from Control Limits'

  const description = dialog.action === 'manual_restore'
    ? 'Restoring a point changes the active control limits and capability results. Provide an attributable reason before continuing.'
    : dialog.action === 'clear_exclusions'
      ? 'This will restore every excluded point for the active chart scope. Provide a justification for the audit trail.'
      : dialog.action === 'auto_clean_phase_i'
        ? 'This will persist the auto-cleaned exclusion set as the active baseline. Confirm the rationale before applying it.'
        : 'Excluding a point changes the active control limits and capability results. Provide a justification before continuing.'

  const targetLabel = dialog.point
    ? `${dialog.point.batch_id ?? 'Point'} · sample ${dialog.point.sample_seq ?? '—'}`
    : `${dialog.excludedCount ?? 0} point${dialog.excludedCount === 1 ? '' : 's'}`

  const handleSubmit = (event) => {
    event.preventDefault()
    const justification = comment.trim()
      ? `${reason} — ${comment.trim()}`
      : reason
    onSubmit({ reason, comment: comment.trim(), justification })
  }

  return (
    <div className="spc-modal-backdrop" role="presentation" onClick={saving ? undefined : onCancel}>
      <div
        className="spc-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="spc-exclusion-dialog-title"
        onClick={event => event.stopPropagation()}
      >
        <div className="spc-modal-header">
          <div>
            <h3 id="spc-exclusion-dialog-title" className="spc-modal-title">{title}</h3>
            <p className="spc-modal-subtitle">{description}</p>
          </div>
          <button className="spc-btn spc-btn--sm spc-btn--ghost" type="button" onClick={onCancel} disabled={saving}>
            Close
          </button>
        </div>

        <div className="spc-exclusion-target">
          <span className="spc-exclusion-target-label">Target</span>
          <strong>{targetLabel}</strong>
          {dialog.point?.value != null && <span>Value {Number(dialog.point.value).toFixed(4)}</span>}
          {dialog.point?.batch_date && <span>{String(dialog.point.batch_date).slice(0, 10)}</span>}
        </div>

        <form className="spc-modal-form" onSubmit={handleSubmit}>
          <label className="spc-filter-group">
            <span className="spc-filter-label">Reason</span>
            <select className="spc-select" value={reason} onChange={event => setReason(event.target.value)} disabled={saving}>
              {REASONS.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <label className="spc-filter-group">
            <span className="spc-filter-label">Comment</span>
            <textarea
              className="spc-modal-textarea"
              rows={4}
              placeholder="Optional context for the audit trail"
              value={comment}
              onChange={event => setComment(event.target.value)}
              disabled={saving}
            />
          </label>

          <div className="spc-modal-actions">
            <button className="spc-btn spc-btn--secondary" type="button" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
            <button className="spc-btn spc-btn--primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Confirm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
