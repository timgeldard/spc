import { useState, useEffect } from 'react'
import type { MicRef } from '../types'

interface AttributeCharacteristicsResponse {
  characteristics?: MicRef[]
}

interface UseAttributeCharacteristicsResult {
  characteristics: MicRef[]
  loading: boolean
  error: string | null
}

export function useAttributeCharacteristics(
  materialId?: string | null,
  plantId?: string | null,
): UseAttributeCharacteristicsResult {
  const [characteristics, setCharacteristics] = useState<MicRef[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    setCharacteristics([])
    if (!materialId) {
      setError(null)
      setLoading(false)
      return () => controller.abort()
    }

    setLoading(true)
    setError(null)

    fetch('/api/spc/attribute-characteristics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ material_id: materialId, plant_id: plantId ?? null }),
    })
      .then(res => {
        if (!res.ok) return res.json().then(b => Promise.reject(b.detail ?? `Error ${res.status}`))
        return res.json()
      })
      .then((data: AttributeCharacteristicsResponse) => {
        if (!controller.signal.aborted) setCharacteristics(data.characteristics ?? [])
      })
      .catch(err => {
        if (err?.name === 'AbortError' || controller.signal.aborted) return
        setError(String(err))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [materialId, plantId])

  return { characteristics, loading, error }
}
