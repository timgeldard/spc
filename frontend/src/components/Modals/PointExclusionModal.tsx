import { useEffect, useState, type FormEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

interface PointExclusionModalProps {
  isOpen: boolean
  onClose: () => void
  chartTitle?: string
  pointDetails?: string
  onConfirm?: (payload: { reason: string; justification: string; signature: string }) => void
}

export default function PointExclusionModal({
  isOpen,
  onClose,
  chartTitle = 'Selected Point',
  pointDetails = 'Sample #14 • Value: 15.67',
  onConfirm,
}: PointExclusionModalProps) {
  const [reason, setReason] = useState('')
  const [justification, setJustification] = useState('')
  const [signature, setSignature] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setReason('')
      setJustification('')
      setSignature('')
      setError(null)
    }
  }, [isOpen])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!reason || !justification.trim() || !signature.trim()) {
      setError('All fields are required for compliance.')
      return
    }

    const payload = {
      reason,
      justification: justification.trim(),
      signature: signature.trim(),
    }

    console.log('Point exclusion audit trail', {
      chartTitle,
      pointDetails,
      ...payload,
      recordedAt: new Date().toISOString(),
    })

    onConfirm?.(payload)
    onClose()
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={open => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white p-8 shadow-2xl dark:bg-gray-900">
          <Dialog.Title className="mb-1 text-2xl font-semibold text-gray-900 dark:text-white">Exclude Point</Dialog.Title>
          <Dialog.Description className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            {chartTitle} — {pointDetails}
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-white">Reason for Exclusion</label>
              <select
                value={reason}
                onChange={event => {
                  setReason(event.target.value)
                  setError(null)
                }}
                className="w-full rounded-2xl border border-gray-300 bg-transparent px-4 py-3 focus:border-blue-600 focus:outline-none dark:border-gray-700"
                required
              >
                <option value="">Select reason...</option>
                <option value="measurement-error">Measurement / Gage Error</option>
                <option value="special-cause">Known Special Cause</option>
                <option value="setup-change">Setup or Tool Change</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-white">Justification / Comments</label>
              <textarea
                value={justification}
                onChange={event => {
                  setJustification(event.target.value)
                  setError(null)
                }}
                rows={4}
                className="min-h-[100px] w-full resize-y rounded-3xl border border-gray-300 px-4 py-3 dark:border-gray-700"
                placeholder="Detailed explanation required for audit..."
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-white">Electronic Signature</label>
              <input
                type="text"
                value={signature}
                onChange={event => {
                  setSignature(event.target.value)
                  setError(null)
                }}
                placeholder="Type your full name to sign"
                className="w-full rounded-2xl border border-gray-300 px-4 py-3 dark:border-gray-700"
                required
              />
            </div>

            {error && <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}

            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-2xl border border-gray-300 py-3.5 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 rounded-2xl bg-red-600 py-3.5 font-medium text-white transition hover:bg-red-700"
              >
                Confirm Exclusion
              </button>
            </div>
          </form>

          <Dialog.Close asChild>
            <button className="absolute right-6 top-6 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="Close modal">
              <X className="h-5 w-5" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
