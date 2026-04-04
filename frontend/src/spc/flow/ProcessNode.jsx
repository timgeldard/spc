import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import SparklineMini from './SparklineMini.jsx'
import { CPK_THRESHOLDS } from '../spcConstants'

const STATUS_COLORS = {
  green:  'var(--spc-green)',
  amber:  'var(--spc-amber)',
  red:    'var(--spc-red)',
  grey:   'var(--spc-grey)',
}

const STATUS_LABELS = {
  green:  'Capable',
  amber:  'Marginal',
  red:    'Incapable',
  grey:   'No Data',
}

function cpkLabel(cpk) {
  if (cpk === null || cpk === undefined) return null
  const cls = cpk >= CPK_THRESHOLDS.CAPABLE ? 'green' : cpk >= CPK_THRESHOLDS.MARGINAL ? 'amber' : 'red'
  return <span className={`spc-node-cpk spc-node-cpk--${cls}`}>Cpk {cpk.toFixed(2)}</span>
}

function ProcessNode({ data, selected }) {
  const status = data.status ?? 'grey'
  const color  = STATUS_COLORS[status]

  const shortName = data.material_name && data.material_name.length > 20
    ? data.material_name.substring(0, 19) + '…'
    : (data.material_name || data.material_id)

  return (
    <div
      className={`spc-process-node spc-process-node--${status}${selected ? ' spc-process-node--selected' : ''}${data.is_root ? ' spc-process-node--root' : ''}`}
      style={{ '--node-status-color': color }}
    >
      <Handle type="target" position={Position.Left} style={{ background: color }} />

      {/* Status indicator bar at top */}
      <div className="spc-node-status-bar" style={{ background: color }} />

      <div className="spc-node-body">
        <div className="spc-node-header">
          <span className="spc-node-name" title={data.material_name || data.material_id}>
            {shortName}
          </span>
          {data.is_root && <span className="spc-node-root-badge">ROOT</span>}
        </div>

        <SparklineMini values={data.sparkline_values ?? []} width={90} height={32} />

        <div className="spc-node-meta">
          <div className="spc-node-meta-row">
            {cpkLabel(data.estimated_cpk)}
            <span className="spc-node-status-label" style={{ color }}>
              {STATUS_LABELS[status]}
            </span>
          </div>
          <div className="spc-node-meta-row">
            <span className="spc-node-batches">
              {data.total_batches ?? 0} batches
            </span>
            {data.rejected_batches > 0 && (
              <span className="spc-node-rejected">
                {data.rejected_batches} rejected
              </span>
            )}
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Right} style={{ background: color }} />
    </div>
  )
}

export default memo(ProcessNode)
