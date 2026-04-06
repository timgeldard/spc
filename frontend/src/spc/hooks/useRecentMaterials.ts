import type { MaterialRef } from '../types'

const KEY = 'spc_recent_materials'
const MAX = 5

export function getRecentMaterials(): MaterialRef[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as MaterialRef[]
  } catch {
    return []
  }
}

export function addRecentMaterial(mat: MaterialRef): void {
  const prev = getRecentMaterials().filter(m => m.material_id !== mat.material_id)
  localStorage.setItem(KEY, JSON.stringify([mat, ...prev].slice(0, MAX)))
}
