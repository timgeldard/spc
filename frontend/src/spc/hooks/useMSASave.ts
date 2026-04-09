import { useState } from 'react'

interface MSASavePayload {
  material_id: string
  mic_id: string
  n_operators: number
  n_parts: number
  n_replicates: number
  grr_pct: number
  repeatability: number
  reproducibility: number
  ndc: number
  results_json: string
}

interface UseMSASaveResult {
  saving: boolean
  error: string | null
  save: (payload: MSASavePayload) => Promise<void>
}

export function useMSASave(): UseMSASaveResult {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (payload: MSASavePayload): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/spc/msa/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail ?? `Save failed (${res.status})`)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return { saving, error, save }
}
