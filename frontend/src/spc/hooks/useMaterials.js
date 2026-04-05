import { useState } from 'react'

export function useValidateMaterial() {
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const validateMaterial = async (materialId) => {
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
        throw new Error(b.detail ?? `Error ${res.status}`)
      }
      const data = await res.json()
      setResult(data)
      return data
    } catch (err) {
      setError(String(err))
      return null
    } finally {
      setValidating(false)
    }
  }

  return { validateMaterial, validating, error, result }
}
