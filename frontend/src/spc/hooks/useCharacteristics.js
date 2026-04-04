import { useState, useEffect } from 'react'

export function useCharacteristics(materialId, plantId) {
  const [characteristics, setCharacteristics] = useState([])
  const [attrCharacteristics, setAttrCharacteristics] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

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
          setCharacteristics(data.characteristics ?? [])
          setAttrCharacteristics(data.attr_characteristics ?? [])
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
