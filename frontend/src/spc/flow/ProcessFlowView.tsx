import React, { useEffect, useCallback } from 'react'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type BackgroundVariant,
  type Edge,
  type Node,
  useNodesState,
  useEdgesState,
} from '@xyflow/react'
import { useSPC } from '../SPCContext'
import { useSPCFlow } from '../hooks/useSPCFlow'
import { layoutFlowGraph } from './layoutFlowGraph'
import ProcessNode from './ProcessNode'
import type { ProcessFlowEdgeData, ProcessFlowNodeData, ProcessFlowNodeRecord } from '../types'
import {
  cardSubClass,
  cardTitleClass,
  flowCanvasClass,
  flowLegendClass,
  heroCardDenseClass,
  legendDotClass,
  legendHintClass,
  legendItemClass,
  moduleEyebrowClass,
  moduleHeaderCardClass,
  splitPanelClass,
} from '../uiClasses'
import InfoBanner from '../components/InfoBanner'
import LoadingSkeleton from '../components/LoadingSkeleton'
import ModuleEmptyState from '../components/ModuleEmptyState'

type FlowNode = Node<ProcessFlowNodeData, 'processNode'>
type FlowEdge = Edge
const nodeTypes = { processNode: ProcessNode }

const STATUS_COLOR = {
  green: '#10b981',
  amber: '#f59e0b',
  red:   '#ef4444',
  grey:  '#9ca3af',
}

function buildFlowElements(
  rawNodes?: ProcessFlowNodeRecord[] | null,
  rawEdges?: ProcessFlowEdgeData[] | null,
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  if (!rawNodes?.length) return { nodes: [], edges: [] }

  // Layout positions
  const positioned = layoutFlowGraph(rawNodes, rawEdges ?? [])

  const nodes: FlowNode[] = positioned.map(n => ({
    id: n.id,
    type: 'processNode',
    position: n.position,
    data: {
      material_id:     n.material_id,
      material_name:   n.material_name,
      plant_name:      n.plant_name,
      total_batches:   n.total_batches,
      rejected_batches: n.rejected_batches,
      mic_count:       n.mic_count,
      mean_value:      n.mean_value,
      stddev_value:    n.stddev_value,
      estimated_cpk:   n.estimated_cpk,
      status:          n.status,
      is_root:         n.is_root,
      sparkline_values: n.sparkline_values ?? [],
    },
    selectable: true,
    draggable: true,
  }))

  const edges: FlowEdge[] = (rawEdges ?? []).map((e, i) => {
    // Animate edges that originate from red nodes
    const sourceNode = rawNodes.find(n => n.id === e.source)
    const animated = sourceNode?.status === 'red'
    return {
      id: `e-${e.source}-${e.target}-${i}`,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      animated,
      style: {
        stroke: animated ? '#ef4444' : '#94a3b8',
        strokeWidth: animated ? 2 : 1.5,
      },
    }
  })

  return { nodes, edges }
}

export default function ProcessFlowView() {
  const { state, dispatch } = useSPC()
  const { flowData, loading, error } = useSPCFlow(
    state.selectedMaterial?.material_id,
    state.dateFrom,
    state.dateTo,
  )

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  // Sync when flow data changes
  useEffect(() => {
    const { nodes: n, edges: e } = buildFlowElements(flowData?.nodes, flowData?.edges)
    setNodes(n)
    setEdges(e)
  }, [flowData, setEdges, setNodes])

  const activateNode = useCallback((nodeData: ProcessFlowNodeData) => {
    dispatch({
      type: 'SELECT_MATERIAL_AND_CHARTS',
      payload: {
        material_id: String(nodeData.material_id),
        material_name: typeof nodeData.material_name === 'string' ? nodeData.material_name : undefined,
      },
    })
  }, [dispatch])

  const onNodeClick = useCallback((_event: React.MouseEvent, node: FlowNode) => {
    activateNode(node.data as ProcessFlowNodeData)
  }, [activateNode])

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const focused = nodes.find(n => n.selected)
    if (focused) activateNode(focused.data as ProcessFlowNodeData)
  }, [activateNode, nodes])

  if (!state.selectedMaterial) {
    return (
      <ModuleEmptyState
        icon="⬡"
        title="Select a material to view its process flow"
        description="Each node shows batch rejection rate across the material network. Click or navigate to a node to drill into control charts."
      />
    )
  }

  if (loading) {
    return <LoadingSkeleton message="Loading process flow…" />
  }

  if (error) {
    return <InfoBanner variant="error">Failed to load process flow: {error}</InfoBanner>
  }

  if (!nodes.length) {
    return (
      <ModuleEmptyState
        title="No process flow data found"
        description={`${state.selectedMaterial.material_name ?? state.selectedMaterial.material_id} may not have lineage data in the selected date range.`}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={moduleHeaderCardClass}>
        <div className={moduleEyebrowClass}>Material lineage review</div>
        <h3 className={cardTitleClass}>Process Flow</h3>
        <p className={cardSubClass}>
          Review upstream and downstream lineage around {state.selectedMaterial.material_name}. Use this to trace where quality risk may propagate across the network.
        </p>
      </div>

      <div className={splitPanelClass}>
        <div className={flowCanvasClass}>
          <div className={flowLegendClass}>
            {Object.entries(STATUS_COLOR).map(([status, color]) => (
              <span key={status} className={legendItemClass}>
                <span className={legendDotClass} style={{ background: color }} />
                {status === 'green' ? 'Rejection rate < 2%' :
                 status === 'amber' ? '2% ≤ Rejection rate < 10%' :
                 status === 'red'   ? 'Rejection rate ≥ 10%' : 'Insufficient data (< 5 batches)'}
              </span>
            ))}
            <span className={legendHintClass}>
              Click a node — or Tab to focus, then Enter — to open control charts
            </span>
          </div>

          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onKeyDown={onKeyDown}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            minZoom={0.2}
            maxZoom={2.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={'dots' as BackgroundVariant} gap={24} color="#e2e8f0" />
            <Controls showInteractive={false} />
            <MiniMap
              nodeColor={n => STATUS_COLOR[(n.data?.status ?? 'grey') as keyof typeof STATUS_COLOR] ?? '#9ca3af'}
              maskColor="rgba(248,250,252,0.85)"
              pannable
              zoomable
            />
          </ReactFlow>
        </div>
        <aside className={`${heroCardDenseClass} space-y-3`}>
          <div className={moduleEyebrowClass}>How to read this map</div>
          <p className="text-sm text-[var(--c-text-muted)]">
            Node colour reflects <strong>batch rejection rate</strong>, not capability (Cpk). This is intentional — it surfaces
            where batches are being rejected across the lineage, regardless of spec limits.
          </p>
          <div className="space-y-2 text-xs">
            <p>
              <span className="font-semibold" style={{ color: STATUS_COLOR.green }}>Green (&lt;2%)</span>
              {' '}— rejection rate is low, operationally healthy.
            </p>
            <p>
              <span className="font-semibold" style={{ color: STATUS_COLOR.amber }}>Amber (2–10%)</span>
              {' '}— elevated rejection rate; monitor and investigate.
            </p>
            <p>
              <span className="font-semibold" style={{ color: STATUS_COLOR.red }}>Red (≥10%)</span>
              {' '}— high rejection rate; likely a risk hotspot. Drill in first.
            </p>
            <p>
              <span className="font-semibold" style={{ color: STATUS_COLOR.grey }}>Grey</span>
              {' '}— fewer than 5 batches in scope; insufficient data.
            </p>
          </div>
          <p className="text-xs text-[var(--c-text-muted)]">
            To check process capability, click a node to open its control charts and scorecard.
          </p>
        </aside>
      </div>
    </div>
  )
}
