import { useState, useEffect } from 'react'
import InfoBanner from './spc/components/InfoBanner'
import TraceForm from './components/TraceForm'
import TraceTree from './components/TraceTree'
import CoACard from './components/CoACard'
import MassBalanceChart from './components/MassBalanceChart'
import CustomerList from './components/CustomerList'
import RiskWarning from './components/RiskWarning'

/**
 * Recall Command Center — 3-column master-detail layout
 *
 * Left:   Lineage tree (clickable, status-colored nodes)
 * Middle: Batch Intelligence (CoA + Mass Balance)
 * Right:  Recall Readiness (Customers + Risk Warning)
 */
export default function RecallPage() {
  const [treeData, setTreeData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [nodeCount, setNodeCount] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [batchDetails, setBatchDetails] = useState(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState(null)

  const handleTrace = async ({ materialId, batchId }) => {
    setLoading(true)
    setError(null)
    setTreeData(null)
    setNodeCount(null)
    setSelectedNode(null)

    try {
      const res = await fetch('/api/trace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ material_id: materialId, batch_id: batchId }),
      })

      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.detail ?? `Server error ${res.status}`)
      }

      const data = await res.json()
      setTreeData(data.tree)
      setNodeCount(data.total_nodes)
      if (data.tree) {
        setSelectedNode({
          materialId: data.tree.name,
          batchId: data.tree.attributes?.Batch,
          status: data.tree.status,
        })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!selectedNode?.batchId) {
      setBatchDetails(null)
      return
    }

    const fetchDetails = async () => {
      setDetailsLoading(true)
      setDetailsError(null)
      try {
        const res = await fetch('/api/batch-details', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            material_id: selectedNode.materialId,
            batch_id: selectedNode.batchId,
          }),
        })

        if (!res.ok) {
          const body = await res.json()
          throw new Error(body.detail ?? `Server error ${res.status}`)
        }

        const data = await res.json()
        setBatchDetails(data)
      } catch (err) {
        setDetailsError(err.message)
        setBatchDetails(null)
      } finally {
        setDetailsLoading(false)
      }
    }

    fetchDetails()
  }, [selectedNode?.batchId, selectedNode?.materialId])

  return (
    <>
      <TraceForm onSubmit={handleTrace} loading={loading} />

      {error && (
        <InfoBanner variant="error">{error}</InfoBanner>
      )}

      {nodeCount !== null && !error && (
        <p className="result-info">
          Trace complete — <strong>{nodeCount}</strong> node{nodeCount !== 1 ? 's' : ''} found.
        </p>
      )}

      {treeData && (
        <div className="layout-three-column">
          <div className="column column-left">
            <h2>Lineage Tree</h2>
            <TraceTree data={treeData} onNodeSelect={setSelectedNode} />
            {selectedNode && (
              <div className="selected-node-info">
                <p className="info-label">Selected:</p>
                <p className="info-value">{selectedNode.materialId}</p>
                <p className="info-subtext">Batch: {selectedNode.batchId}</p>
                <p className={`info-status status-${(selectedNode.status || 'unknown').toLowerCase().replace(/\s+/g, '-')}`}>
                  {selectedNode.status || 'Unknown'}
                </p>
              </div>
            )}
          </div>

          <div className="column column-middle">
            <h2>Batch Intelligence</h2>
            {selectedNode ? (
              <>
                {detailsError && (
                  <InfoBanner variant="error">{detailsError}</InfoBanner>
                )}
                <CoACard coaResults={batchDetails?.coa_results ?? null} loading={detailsLoading} />
                <MassBalanceChart
                  movementHistory={batchDetails?.movement_history ?? null}
                  summary={batchDetails?.summary ?? null}
                  loading={detailsLoading}
                />
              </>
            ) : (
              <p className="column-placeholder">Select a batch to view details.</p>
            )}
          </div>

          <div className="column column-right">
            <h2>Recall Readiness</h2>
            {selectedNode ? (
              <>
                <CustomerList customers={batchDetails?.customers ?? null} loading={detailsLoading} />
                <RiskWarning crossBatchExposure={batchDetails?.cross_batch_exposure ?? null} loading={detailsLoading} />
              </>
            ) : (
              <p className="column-placeholder">Select a batch to view impact analysis.</p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
