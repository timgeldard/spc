import { memo, useState } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import SparklineMini from './SparklineMini'
import NodeTooltip from './NodeTooltip'
import type { ProcessFlowNodeData } from '../types'

// Labels reflect rejection-rate semantics — Carbon support tokens
const STATUS = {
  green: { dot: 'var(--cds-support-success)', text: 'var(--cds-text-primary)', bg: 'var(--cds-notification-background-success)', border: 'var(--cds-support-success)', label: 'Low rejection rate' },
  amber: { dot: 'var(--cds-support-warning)', text: 'var(--cds-text-primary)', bg: 'var(--cds-notification-background-warning)', border: 'var(--cds-support-warning)', label: 'Elevated rejection rate' },
  red:   { dot: 'var(--cds-support-error)',   text: 'var(--cds-support-error)', bg: 'var(--cds-notification-background-error)', border: 'var(--cds-support-error)', label: 'High rejection rate' },
  grey:  { dot: 'var(--cds-text-placeholder)', text: 'var(--cds-text-secondary)', bg: 'var(--cds-layer)', border: 'var(--cds-border-subtle-01)', label: 'Insufficient data' },
}

type ProcessNodeStatus = keyof typeof STATUS

type ProcessFlowGraphNode = Node<ProcessFlowNodeData, 'processNode'>

function ProcessNode({ data, selected }: NodeProps<ProcessFlowGraphNode>) {
  const statusKey = (data.status ?? 'grey') as ProcessNodeStatus
  const s = STATUS[statusKey] ?? STATUS.grey
  const rejectionRate = data.rejection_rate_pct
  const hasSignal = Boolean(data.has_ooc_signal || data.last_ooc)
  const [hovered, setHovered] = useState(false)

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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
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

      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--cds-text-primary)', paddingRight: 20, lineHeight: 1.3 }}
        title={data.material_name || String(data.material_id)}>
        {shortName}
      </div>

      {data.plant_name && (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          marginTop: 3,
          background: 'var(--cds-layer-accent-01)',
          borderRadius: 4,
          padding: '1px 5px',
          fontSize: '0.625rem',
          fontWeight: 500,
          color: 'var(--cds-text-secondary)',
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
          background: 'var(--cds-background-inverse)',
          borderRadius: 4,
          padding: '1px 5px',
          fontSize: '0.625rem',
          fontWeight: 700,
          color: 'var(--cds-text-inverse)',
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
          color: 'var(--cds-support-error)',
          background: 'var(--cds-notification-background-error)',
          border: '1px solid var(--cds-support-error)',
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
            background: 'var(--cds-layer-accent-01)',
            borderRadius: 4,
            padding: '1px 5px',
          }}>
            Cpk {data.estimated_cpk.toFixed(2)}
          </span>
        )}
        <span style={{ fontSize: '0.65rem', color: 'var(--cds-text-placeholder)', marginLeft: 'auto' }}>
          {data.total_batches ?? 0}b
          {(data.rejected_batches ?? 0) > 0 && (
            <span style={{ color: 'var(--cds-support-error)', marginLeft: 3 }}>·{data.rejected_batches}r</span>
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
        visible={hovered}
      />

      <Handle type="source" position={Position.Right} style={{ background: s.dot }} />
    </div>
  )
}

export default memo(ProcessNode)
