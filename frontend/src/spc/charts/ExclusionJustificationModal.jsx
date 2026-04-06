import { useEffect, useRef, useState } from 'react'
import {
  buttonBaseClass,
  buttonGhostClass,
  buttonPrimaryClass,
  buttonSecondaryClass,
  filterGroupClass,
  filterLabelClass,
  exclusionTargetClass,
  exclusionTargetLabelClass,
  modalActionsClass,
  modalBackdropClass,
  modalClass,
  modalFormClass,
  modalHeaderClass,
  selectClass,
  modalSubtitleClass,
  modalTextareaClass,
  modalTitleClass,
} from '../uiClasses.js'

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
  const dialogRef = useRef(null)
  const reasonRef = useRef(null)
  const previousFocusRef = useRef(null)

  useEffect(() => {
    if (!dialog) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setReason(
      dialog.action === 'manual_restore'
        ? 'Manual review override'
        : dialog.action === 'auto_clean_phase_i'
          ? 'Phase I stabilization'
          : REASONS[0],
    )
    setComment('')

    const frame = window.requestAnimationFrame(() => {
      reasonRef.current?.focus()
    })

    return () => {
      window.cancelAnimationFrame(frame)
      previousFocusRef.current?.focus?.()
    }
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

  const handleKeyDown = (event) => {
    if (!dialogRef.current) return

    if (event.key === 'Escape' && !saving) {
      event.preventDefault()
      onCancel()
      return
    }

    if (event.key !== 'Tab') return

    const focusables = [...dialogRef.current.querySelectorAll(
      'button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    )]
    if (focusables.length === 0) return

    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement

    if (event.shiftKey && active === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className={modalBackdropClass} role="presentation" onClick={saving ? undefined : onCancel}>
      <div
        className={modalClass}
        role="dialog"
        aria-modal="true"
        aria-labelledby="spc-exclusion-dialog-title"
        aria-describedby="spc-exclusion-dialog-description"
        onClick={event => event.stopPropagation()}
        onKeyDown={handleKeyDown}
        ref={dialogRef}
      >
        <div className={modalHeaderClass}>
          <div>
            <h3 id="spc-exclusion-dialog-title" className={modalTitleClass}>{title}</h3>
            <p id="spc-exclusion-dialog-description" className={modalSubtitleClass}>{description}</p>
          </div>
          <button className={`${buttonBaseClass} ${buttonGhostClass}`} type="button" onClick={onCancel} disabled={saving}>
            Close
          </button>
        </div>

        <div className={exclusionTargetClass}>
          <span className={exclusionTargetLabelClass}>Target</span>
          <strong>{targetLabel}</strong>
          {dialog.point?.value != null && <span>Value {Number(dialog.point.value).toFixed(4)}</span>}
          {dialog.point?.batch_date && <span>{String(dialog.point.batch_date).slice(0, 10)}</span>}
        </div>

        <form className={modalFormClass} onSubmit={handleSubmit}>
          <label className={filterGroupClass}>
            <span className={filterLabelClass}>Reason</span>
            <select
              className={selectClass}
              value={reason}
              onChange={event => setReason(event.target.value)}
              disabled={saving}
              ref={reasonRef}
            >
              {REASONS.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <label className={filterGroupClass}>
            <span className={filterLabelClass}>Comment</span>
            <textarea
              className={modalTextareaClass}
              rows={4}
              placeholder="Optional context for the audit trail"
              value={comment}
              onChange={event => setComment(event.target.value)}
              disabled={saving}
            />
          </label>

          <div className={modalActionsClass}>
            <button className={`${buttonBaseClass} ${buttonSecondaryClass}`} type="button" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
            <button className={`${buttonBaseClass} ${buttonPrimaryClass}`} type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Confirm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
