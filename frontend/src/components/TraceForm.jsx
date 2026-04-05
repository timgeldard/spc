import { useState } from 'react'

/**
 * TraceForm — collects Material ID and Batch ID then calls onSubmit.
 *
 * @param {{ onSubmit: (vals: {materialId: string, batchId: string}) => void, loading: boolean }} props
 */
export default function TraceForm({ onSubmit, loading }) {
  const [materialId, setMaterialId] = useState('')
  const [batchId, setBatchId] = useState('')

  const canSubmit = !loading && materialId.trim() !== '' && batchId.trim() !== ''

  const handleSubmit = (e) => {
    e.preventDefault()
    if (canSubmit) {
      onSubmit({ materialId: materialId.trim(), batchId: batchId.trim() })
    }
  }

  return (
    <form className="trace-form" onSubmit={handleSubmit} noValidate>
      <div className="form-group">
        <label htmlFor="material-id">Material ID</label>
        <input
          id="material-id"
          type="text"
          value={materialId}
          onChange={(e) => setMaterialId(e.target.value)}
          placeholder="e.g. MAT-001"
          autoComplete="off"
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="batch-id">Batch ID</label>
        <input
          id="batch-id"
          type="text"
          value={batchId}
          onChange={(e) => setBatchId(e.target.value)}
          placeholder="e.g. BATCH-2024-001"
          autoComplete="off"
          required
        />
      </div>

      <button type="submit" disabled={!canSubmit} className="btn-primary">
        {loading ? 'Tracing…' : 'Run Trace'}
      </button>
    </form>
  )
}
