import { memo, useMemo } from 'react'
import { ReactFlow, Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { layoutFlowGraph } from './layoutFlowGraph'
import type { ProcessFlowResult } from '../types'

// ── Status tokens ─────────────────────────────────────────────────────────────

const STATUS_STYLE = {
  green: { dot: 'var(--cds-support-success)',  bg: 'var(--cds-notification-background-success)', border: 'var(--cds-support-success)'  },
  amber: { dot: 'var(--cds-support-warning)',  bg: 'var(--cds-notification-background-warning)', border: 'var(--cds-support-warning)'  },
  red:   { dot: 'var(--cds-support-error)',    bg: 'var(--cds-notification-background-error)',   border: 'var(--cds-support-error)'    },
  grey:  { dot: 'var(--cds-text-placeholder)', bg: 'var(--cds-layer)',                           border: 'var(--cds-border-subtle-01)' },
} as const

type StatusKey = keyof typeof STATUS_STYLE

// ── Mini node ─────────────────────────────────────────────────────────────────

interface MiniNodeData extends Record<string, unknown> {
  label: string
  status: StatusKey
  hasSignal: boolean
  cpk: number | null
}

type MiniFlowNode = Node<MiniNodeData, 'miniNode'>

const MiniNode = memo(function MiniNode({ data }: NodeProps<MiniFlowNode>) {
  const s = STATUS_STYLE[data.status] ?? STATUS_STYLE.grey

  return (
    <div
      style={{
        background: s.bg,
        border: `1.5px solid ${s.border}`,
        borderRadius: 6,
        width: 140,
        padding: '7px 10px 6px',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: s.dot, width: 6, height: 6 }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {/* Status dot */}
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />

        {/* Node name */}
        <span
          style={{
            fontSize: '0.72rem',
            fontWeight: 600,
            color: 'var(--cds-text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0,
          }}
        >
          {data.label}
        </span>

        {/* OOC badge */}
        {data.hasSignal && (
          <span
            style={{
              fontSize: '0.55rem',
              fontWeight: 700,
              color: 'var(--cds-support-error)',
              background: 'var(--cds-notification-background-error)',
              border: '1px solid var(--cds-support-error)',
              borderRadius: 3,
              padding: '0 3px',
              flexShrink: 0,
              lineHeight: '1.4',
            }}
          >
            OOC
          </span>
        )}
      </div>

      {/* Cpk sub-label */}
      {data.cpk != null && (
        <div
          style={{
            fontSize: '0.625rem',
            color: 'var(--cds-text-secondary)',
            marginTop: 3,
            marginLeft: 12,
          }}
        >
          Cpk {data.cpk.toFixed(2)}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        style={{ background: s.dot, width: 6, height: 6 }}
      />
    </div>
  )
})

// nodeTypes MUST be stable (defined outside the component) to prevent remounting
const NODE_TYPES = { miniNode: MiniNode }

// ── Graph builder ─────────────────────────────────────────────────────────────

function buildMiniElements(flowData: ProcessFlowResult | null) {
  if (!flowData?.nodes?.length) return { nodes: [] as MiniFlowNode[], edges: [] as object[] }

  const positioned = layoutFlowGraph(flowData.nodes, flowData.edges ?? [])

  const nodes: MiniFlowNode[] = positioned.map(n => {
    const rawName = n.material_name || n.material_id || n.id
    const label = rawName.length > 18 ? rawName.substring(0, 17) + '…' : rawName

    return {
      id: n.id,
      type: 'miniNode' as const,
      position: n.position,
      selectable: false,
      draggable: false,
      data: {
        label,
        status: ((n.status ?? 'grey') in STATUS_STYLE ? n.status : 'grey') as StatusKey,
        hasSignal: Boolean(n.has_ooc_signal || n.last_ooc),
        cpk: typeof n.estimated_cpk === 'number' ? n.estimated_cpk : null,
      },
    }
  })

  const edges = (flowData.edges ?? []).map((e, i) => {
    const sourceNode = flowData.nodes.find(n => n.id === e.source)
    const isRed = sourceNode?.status === 'red'
    return {
      id: `mini-${e.source}-${e.target}-${i}`,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      animated: isRed,
      style: {
        stroke: isRed ? 'var(--cds-support-error)' : 'var(--cds-border-subtle-01)',
        strokeWidth: isRed ? 2 : 1.5,
      },
    }
  })

  return { nodes, edges }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ProcessFlowMiniMapProps {
  flowData: ProcessFlowResult | null
  loading: boolean
}

export default function ProcessFlowMiniMap({ flowData, loading }: ProcessFlowMiniMapProps) {
  const { nodes, edges } = useMemo(() => buildMiniElements(flowData), [flowData])

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
          Loading process flow…
        </span>
      </div>
    )
  }

  if (!nodes.length) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-placeholder)' }}>
          No flow data for selected scope
        </span>
      </div>
    )
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      fitView
      fitViewOptions={{ padding: 0.18 }}
      panOnDrag={false}
      zoomOnScroll={false}
      zoomOnPinch={false}
      zoomOnDoubleClick={false}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      proOptions={{ hideAttribution: true }}
    />
  )
}
