import { useEffect, useState } from 'react'
import type { PlantRef } from '../types'
import { createRequestCache } from './requestCache'

interface UsePlantsResult {
  plants: PlantRef[]
  loading: boolean
  error: string | null
}

export function usePlants(materialId: string | null | undefined): UsePlantsResult {
  const cache = plantsCache
  const [plants, setPlants] = useState<PlantRef[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!materialId) {
      setPlants([])
      setLoading(false)
      setError(null)
      return
    }

    const controller = new AbortController()
    const cacheKey = materialId
    setLoading(true)
    setError(null)
    const cachedPlants = cache.get(cacheKey)
    if (cachedPlants) {
      setPlants(cachedPlants)
      setLoading(false)
      return () => controller.abort()
    }

    cache.load(cacheKey, controller.signal, async (signal) => {
      const res = await fetch(`/api/spc/plants?material_id=${encodeURIComponent(materialId)}`, { signal })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail ?? `Error ${res.status}`)
      }
      const data = await res.json()
      return (data.plants ?? []) as PlantRef[]
    })
      .then(nextPlants => {
        if (!controller.signal.aborted) setPlants(nextPlants)
      })
      .catch(err => {
        if (err?.name === 'AbortError' || controller.signal.aborted) return
        setError(String(err))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => { controller.abort() }
  }, [materialId])

  return { plants, loading, error }
}

const plantsCache = createRequestCache<PlantRef[]>()
