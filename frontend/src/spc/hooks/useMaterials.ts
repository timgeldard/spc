import { useState } from 'react'
import type { ValidateMaterialResult } from '../types'

function getErrorMessage(body: any, status: number) {
  const detail = body?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  if (detail && typeof detail === 'object') {
    if (typeof detail.message === 'string' && detail.message.trim()) return detail.message
    if (typeof detail.error_id === 'string' && detail.error_id.trim()) return `Request failed (${detail.error_id})`
  }
  return `Error ${status}`
}

interface UseValidateMaterialResult {
  validateMaterial: (materialId: string) => Promise<ValidateMaterialResult | null>
  validating: boolean
  error: string | null
  result: ValidateMaterialResult | null
}

export function useValidateMaterial(): UseValidateMaterialResult {
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ValidateMaterialResult | null>(null)

  const validateMaterial = async (materialId: string) => {
    setValidating(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/spc/validate-material', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ material_id: materialId }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(getErrorMessage(b, res.status))
      }
      const data = await res.json() as ValidateMaterialResult
      setResult(data)
      return data
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return null
    } finally {
      setValidating(false)
    }
  }

  return { validateMaterial, validating, error, result }
}
