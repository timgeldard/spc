import { useEffect, useState } from 'react'
import type { MicRef } from '../types'

interface UseCharacteristicsResult {
  characteristics: MicRef[]
  attrCharacteristics: MicRef[]
  loading: boolean
  error: string | null
}

export function useCharacteristics(
  materialId: string | null | undefined,
  plantId: string | null | undefined,
): UseCharacteristicsResult {
  const [characteristics, setCharacteristics] = useState<MicRef[]>([])
  const [attrCharacteristics, setAttrCharacteristics] = useState<MicRef[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    setCharacteristics([])
    setAttrCharacteristics([])
    if (!materialId) {
      setError(null)
      setLoading(false)
      return () => controller.abort()
    }

    setLoading(true)
    setError(null)

    fetch('/api/spc/characteristics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ material_id: materialId, plant_id: plantId ?? null }),
    })
      .then(res => {
        if (!res.ok) return res.json().then(b => Promise.reject(b.detail ?? `Error ${res.status}`))
        return res.json()
      })
      .then(data => {
        if (!controller.signal.aborted) {
          setCharacteristics((data.characteristics ?? []) as MicRef[])
          setAttrCharacteristics((data.attr_characteristics ?? []) as MicRef[])
        }
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

  return { characteristics, attrCharacteristics, loading, error }
}
