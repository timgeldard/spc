import { useState } from 'react'
import type { ExportPayload } from '../types'

interface UseExportResult {
  exportData: (payload: ExportPayload) => Promise<void>
  exporting: boolean
  exportError: string | null
}

export function useExport(): UseExportResult {
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  async function exportData(payload: ExportPayload) {
    setExporting(true)
    setExportError(null)
    try {
      const res = await fetch('/api/spc/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail ?? `Export failed (${res.status})`)
      }
      const blob = await res.blob()
      const contentDisposition = res.headers.get('Content-Disposition') ?? ''
      const match = contentDisposition.match(/filename[^;=\n]*=([^;\n]*)/)
      const filename = match ? match[1].trim().replace(/['"]/g, '') : 'spc_export'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setExportError(String(e))
    } finally {
      setExporting(false)
    }
  }

  return { exportData, exporting, exportError }
}
