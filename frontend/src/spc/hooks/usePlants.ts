import { useEffect, useState } from 'react'
import type { PlantRef } from '../types'

interface UsePlantsResult {
  plants: PlantRef[]
  loading: boolean
  error: string | null
}

export function usePlants(materialId: string | null | undefined): UsePlantsResult {
  const [plants, setPlants] = useState<PlantRef[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!materialId) {
      setPlants([])
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/api/spc/plants?material_id=${encodeURIComponent(materialId)}`)
      .then(res => {
        if (!res.ok) return res.json().then(b => Promise.reject(b.detail ?? `Error ${res.status}`))
        return res.json()
      })
      .then(data => {
        if (!cancelled) setPlants((data.plants ?? []) as PlantRef[])
      })
      .catch(err => {
        if (!cancelled) setError(String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [materialId])

  return { plants, loading, error }
}
