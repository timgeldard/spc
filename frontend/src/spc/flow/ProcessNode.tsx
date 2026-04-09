import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import SparklineMini from './SparklineMini'
import NodeTooltip from './NodeTooltip'
import type { ProcessFlowNodeData } from '../types'

// Labels reflect rejection-rate semantics — colours follow the Kerry brand palette:
// Jade (green), Sunrise (amber), Sunset (red), Slate (grey)
const STATUS = {
  green: { dot: '#44CF93', text: '#143700', bg: '#DAF5E9', border: '#8FE2BE', label: 'Low rejection rate' },
  amber: { dot: '#F9C20A', text: '#005776', bg: '#FEF3CE', border: '#FDE79D', label: 'Elevated rejection rate' },
  red:   { dot: '#F24A00', text: '#F24A00', bg: '#FCDBCC', border: '#FAB799', label: 'High rejection rate' },
  grey:  { dot: '#99BCC8', text: '#4E7080', bg: '#F4F4EA', border: '#CCDDE4', label: 'Insufficient data' },
}

type ProcessNodeStatus = keyof typeof STATUS

type ProcessFlowGraphNode = Node<ProcessFlowNodeData, 'processNode'>

function ProcessNode({ data, selected }: NodeProps<ProcessFlowGraphNode>) {
  const statusKey = (data.status ?? 'grey') as ProcessNodeStatus
  const s = STATUS[statusKey] ?? STATUS.grey
  const rejectionRate = data.rejection_rate_pct
  const hasSignal = Boolean(data.has_ooc_signal || data.last_ooc)

  const shortName = data.material_name && data.material_name.length > 22
    ? data.material_name.substring(0, 21) + '…'
    : (data.material_name || data.material_id)

  const fullName = data.material_name || String(data.material_id)
  const ariaLabel = `${fullName} — ${s.label}${data.is_root ? ' (root node)' : ''}`

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      className="group"
      style={{
        background: s.bg,
        border: `1.5px solid ${selected ? s.dot : s.border}`,
        borderRadius: 18,
        width: 184,
        boxShadow: hasSignal
          ? '0 14px 32px rgba(109,40,217,0.18)'
          : selected
            ? `0 0 0 3px ${s.dot}40`
            : '0 10px 24px rgba(15,23,42,0.08)',
        position: 'relative',
        padding: '12px 14px 10px',
        fontFamily: "'Noto Sans', system-ui, sans-serif",
        transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
        transform: selected ? 'translateY(-1px)' : 'none',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: s.dot }} />

      <div
        role="img"
        aria-label={s.label}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: s.dot,
          boxShadow: `0 0 0 2px ${s.dot}30`,
        }}
        title={s.label}
      />

      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#111827', paddingRight: 20, lineHeight: 1.3 }}
        title={data.material_name || String(data.material_id)}>
        {shortName}
      </div>

      {data.plant_name && (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          marginTop: 3,
          background: 'rgba(0,0,0,0.05)',
          borderRadius: 4,
          padding: '1px 5px',
          fontSize: '0.625rem',
          fontWeight: 500,
          color: '#6b7280',
          letterSpacing: '0.02em',
        }}>
          {data.plant_name}
        </div>
      )}

      {data.is_root && (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          marginLeft: data.plant_name ? 4 : 0,
          marginTop: 3,
          background: '#1B3A4B',
          borderRadius: 4,
          padding: '1px 5px',
          fontSize: '0.625rem',
          fontWeight: 700,
          color: '#fff',
          letterSpacing: '0.04em',
        }}>
          ROOT
        </div>
      )}

      {hasSignal && (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          marginTop: 6,
          borderRadius: 999,
          padding: '2px 7px',
          fontSize: '0.625rem',
          fontWeight: 700,
          color: '#F24A00',
          background: '#FCDBCC',
          border: '1px solid #F56E33',
          letterSpacing: '0.04em',
        }}>
          OOC
        </div>
      )}

      <div style={{ margin: '6px 0 4px' }}>
        <SparklineMini values={data.sparkline_values ?? []} width={156} height={30} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        {data.estimated_cpk != null && (
          <span style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            color: s.text,
            background: `${s.dot}18`,
            borderRadius: 4,
            padding: '1px 5px',
          }}>
            Cpk {data.estimated_cpk.toFixed(2)}
          </span>
        )}
        <span style={{ fontSize: '0.65rem', color: '#9ca3af', marginLeft: 'auto' }}>
          {data.total_batches ?? 0}b
          {(data.rejected_batches ?? 0) > 0 && (
            <span style={{ color: '#ef4444', marginLeft: 3 }}>·{data.rejected_batches}r</span>
          )}
        </span>
      </div>

      {rejectionRate != null && (
        <div style={{ marginTop: 6, fontSize: '0.68rem', fontWeight: 600, color: s.text }}>
          Rejection {rejectionRate.toFixed(1)}%
        </div>
      )}

      <NodeTooltip
        label={fullName}
        plantName={data.plant_name}
        rejectionRate={rejectionRate}
        cpk={data.estimated_cpk}
        totalBatches={data.total_batches}
        rejectedBatches={data.rejected_batches}
        lastOoc={data.last_ooc}
        hasSignal={hasSignal}
      />

      <Handle type="source" position={Position.Right} style={{ background: s.dot }} />
    </div>
  )
}

export default memo(ProcessNode)
