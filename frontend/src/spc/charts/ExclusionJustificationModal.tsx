import { useEffect, useState } from 'react'
import {
  Modal,
  Select,
  SelectItem,
  Stack,
  TextArea,
} from '@carbon/react'
import type { ExclusionDialogState } from '../types'

// ── Reasons ──────────────────────────────────────────────────────────────────

const REASONS = [
  'Special-cause investigation',
  'Sampling / transcription error',
  'Instrument or lab issue',
  'Phase I stabilization',
  'Manual review override',
]

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExclusionSubmitPayload {
  reason: string
  comment: string
  justification: string
}

interface ExclusionJustificationModalProps {
  dialog: ExclusionDialogState | null
  saving: boolean
  onCancel: () => void
  onSubmit: (payload: ExclusionSubmitPayload) => void
}

// ── Action-driven content map ─────────────────────────────────────────────────

function resolveContent(action: string) {
  switch (action) {
    case 'manual_restore':
      return {
        heading:           'Restore Point to Calculation Set',
        description:       'Restoring a point changes the active control limits and capability results. Provide an attributable reason before continuing.',
        primaryButtonText: 'Restore',
        danger:            false,
        defaultReason:     'Manual review override',
      }
    case 'clear_exclusions':
      return {
        heading:           'Restore All Excluded Points',
        description:       'This will restore every excluded point for the active chart scope. Provide a justification for the audit trail.',
        primaryButtonText: 'Restore All',
        danger:            true,
        defaultReason:     REASONS[0],
      }
    case 'auto_clean_phase_i':
      return {
        heading:           'Apply Phase I Auto-clean',
        description:       'This will persist the auto-cleaned exclusion set as the active baseline. Confirm the rationale before applying it.',
        primaryButtonText: 'Apply',
        danger:            false,
        defaultReason:     'Phase I stabilization',
      }
    default: // 'manual_exclude'
      return {
        heading:           'Exclude Point from Control Limits',
        description:       'Excluding a point changes the active control limits and capability results. Provide a justification before continuing.',
        primaryButtonText: 'Confirm',
        danger:            true,
        defaultReason:     REASONS[0],
      }
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExclusionJustificationModal({
  dialog,
  saving,
  onCancel,
  onSubmit,
}: ExclusionJustificationModalProps) {
  const [reason,  setReason]  = useState(REASONS[0])
  const [comment, setComment] = useState('')

  // Reset state and pre-fill reason whenever a new dialog opens
  useEffect(() => {
    if (!dialog) return
    const { defaultReason } = resolveContent(dialog.action)
    setReason(defaultReason)
    setComment('')
  }, [dialog])

  const handleSubmit = () => {
    const justification = comment.trim()
      ? `${reason} — ${comment.trim()}`
      : reason
    onSubmit({ reason, comment: comment.trim(), justification })
  }

  const content = dialog ? resolveContent(dialog.action) : null

  // Build the target label shown in the info box
  const targetLabel = dialog?.point
    ? `${dialog.point.batch_id ?? 'Point'} · sample ${dialog.point.sample_seq ?? '—'}`
    : `${dialog?.excludedCount ?? 0} point${dialog?.excludedCount === 1 ? '' : 's'}`

  const isOptionalComment =
    dialog?.action === 'manual_exclude' || dialog?.action === 'manual_restore'

  return (
    // Carbon Modal natively handles portal, backdrop, focus-trap, Escape key, and inert.
    // No createPortal, no manual keydown listener, no inert setAttribute needed.
    <Modal
      open={!!dialog}
      onRequestClose={onCancel}
      onRequestSubmit={handleSubmit}
      modalHeading={content?.heading ?? ''}
      primaryButtonText={saving ? 'Saving…' : (content?.primaryButtonText ?? 'Confirm')}
      primaryButtonDisabled={saving}
      secondaryButtonText="Cancel"
      danger={content?.danger}
      size="sm"
    >
      <Stack gap={5}>

        {/* Contextual description */}
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
          {content?.description}
        </p>

        {/* Target info box */}
        <div
          style={{
            padding: '0.75rem 1rem',
            background: 'var(--cds-layer-01)',
            borderLeft: '3px solid var(--cds-border-interactive)',
          }}
        >
          <span
            style={{
              display: 'block',
              marginBottom: '0.25rem',
              fontSize: '0.6875rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--cds-text-secondary)',
            }}
          >
            Target
          </span>
          <strong style={{ fontSize: '0.875rem', color: 'var(--cds-text-primary)' }}>
            {targetLabel}
          </strong>
          {dialog?.point?.value != null && (
            <span style={{ marginLeft: '0.75rem', fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
              Value {Number(dialog.point.value).toFixed(4)}
            </span>
          )}
          {dialog?.point?.batch_date && (
            <span style={{ marginLeft: '0.75rem', fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
              {String(dialog.point.batch_date).slice(0, 10)}
            </span>
          )}
        </div>

        {/* Reason select */}
        <Select
          id="exclusion-reason"
          labelText="Reason"
          value={reason}
          onChange={e => setReason(e.target.value)}
          disabled={saving}
        >
          {REASONS.map(option => (
            <SelectItem key={option} value={option} text={option} />
          ))}
        </Select>

        {/* Comment textarea */}
        <TextArea
          id="exclusion-comment"
          labelText={isOptionalComment ? 'Comment (optional)' : 'Comment'}
          helperText="Additional context for the audit trail."
          placeholder="Optional context for the audit trail"
          value={comment}
          onChange={e => setComment(e.target.value)}
          disabled={saving}
          rows={4}
        />

      </Stack>
    </Modal>
  )
}
