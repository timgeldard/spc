import { useEffect, useState } from 'react'
import {
  Select,
  SelectItem,
  TextArea,
  TextInput,
} from '~/lib/carbon-forms'
import { InlineNotification, Modal } from '~/lib/carbon-feedback'
import { Stack } from '~/lib/carbon-layout'

interface PointExclusionModalProps {
  isOpen: boolean
  onClose: () => void
  chartTitle?: string
  pointDetails?: string
  onConfirm?: (payload: { reason: string; justification: string; signature: string }) => void
}

const EXCLUSION_REASONS = [
  { value: 'measurement-error', label: 'Measurement / Gage Error'   },
  { value: 'special-cause',     label: 'Known Special Cause'         },
  { value: 'setup-change',      label: 'Setup or Tool Change'        },
  { value: 'other',             label: 'Other'                       },
]

export default function PointExclusionModal({
  isOpen,
  onClose,
  chartTitle = 'Selected Point',
  pointDetails = 'Sample #14 • Value: 15.67',
  onConfirm,
}: PointExclusionModalProps) {
  const [reason,        setReason]        = useState('')
  const [justification, setJustification] = useState('')
  const [signature,     setSignature]     = useState('')
  const [error,         setError]         = useState<string | null>(null)

  // Reset form state whenever the modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setReason('')
      setJustification('')
      setSignature('')
      setError(null)
    }
  }, [isOpen])

  const handleSubmit = () => {
    if (!reason || !justification.trim() || !signature.trim()) {
      setError('All fields are required for compliance.')
      return
    }

    console.log('Point exclusion audit trail', {
      chartTitle,
      pointDetails,
      reason,
      justification: justification.trim(),
      signature: signature.trim(),
      recordedAt: new Date().toISOString(),
    })

    onConfirm?.({ reason, justification: justification.trim(), signature: signature.trim() })
    onClose()
  }

  return (
    // Carbon Modal handles portal, backdrop, focus-trap, and Escape key natively.
    // 'danger' kind turns the primary button red — appropriate for a destructive audit action.
    <Modal
      open={isOpen}
      onRequestClose={onClose}
      onRequestSubmit={handleSubmit}
      modalHeading="Exclude Point"
      modalLabel={`${chartTitle} — ${pointDetails}`}
      primaryButtonText="Confirm Exclusion"
      secondaryButtonText="Cancel"
      danger
      size="sm"
    >
      <Stack gap={6}>
        <Select
          id="exclusion-reason"
          labelText="Reason for Exclusion"
          value={reason}
          onChange={e => { setReason(e.target.value); setError(null) }}
          required
        >
          <SelectItem value="" text="Select reason…" />
          {EXCLUSION_REASONS.map(r => (
            <SelectItem key={r.value} value={r.value} text={r.label} />
          ))}
        </Select>

        <TextArea
          id="exclusion-justification"
          labelText="Justification / Comments"
          helperText="Detailed explanation required for the audit trail."
          placeholder="Detailed explanation required for audit…"
          value={justification}
          onChange={e => { setJustification(e.target.value); setError(null) }}
          rows={4}
          required
        />

        <TextInput
          id="exclusion-signature"
          labelText="Electronic Signature"
          helperText="Type your full name to sign this exclusion."
          placeholder="Type your full name to sign"
          value={signature}
          onChange={e => { setSignature(e.target.value); setError(null) }}
          required
        />

        {error && (
          <InlineNotification
            kind="error"
            title={error}
            hideCloseButton
            lowContrast
          />
        )}
      </Stack>
    </Modal>
  )
}
