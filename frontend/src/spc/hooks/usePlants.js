import { useState, useEffect } from 'react'

export function usePlants(materialId) {
  const [plants, setPlants] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

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
        if (!cancelled) setPlants(data.plants ?? [])
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
