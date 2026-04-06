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
    setCharacteristics([])
    setAttrCharacteristics([])
    if (!materialId) return

    let cancelled = false
    setLoading(true)
    setError(null)

    fetch('/api/spc/characteristics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ material_id: materialId, plant_id: plantId ?? null }),
    })
      .then(res => {
        if (!res.ok) return res.json().then(b => Promise.reject(b.detail ?? `Error ${res.status}`))
        return res.json()
      })
      .then(data => {
        if (!cancelled) {
          setCharacteristics((data.characteristics ?? []) as MicRef[])
          setAttrCharacteristics((data.attr_characteristics ?? []) as MicRef[])
        }
      })
      .catch(err => {
        if (!cancelled) setError(String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [materialId, plantId])

  return { characteristics, attrCharacteristics, loading, error }
}
