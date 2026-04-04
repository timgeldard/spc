import { useState } from 'react'

export function useExport() {
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(null)

  async function exportData(payload) {
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
