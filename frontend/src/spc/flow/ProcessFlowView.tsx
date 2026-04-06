import { useEffect, useMemo, useCallback } from 'react'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type BackgroundVariant,
  type Edge,
  type Node,
  type NodeMouseHandler,
  useNodesState,
  useEdgesState,
} from '@xyflow/react'
import { useSPC } from '../SPCContext'
import { useSPCFlow } from '../hooks/useSPCFlow'
import { layoutFlowGraph } from './layoutFlowGraph'
import ProcessNode from './ProcessNode'
import type { ProcessFlowEdgeData, ProcessFlowNodeData, ProcessFlowNodeRecord } from '../types'
import {
  emptyIconClass,
  emptyStateClass,
  emptySubClass,
  flowCanvasClass,
  flowLegendClass,
  legendDotClass,
  legendHintClass,
  legendItemClass,
  loadingClass,
  spinnerClass,
} from '../uiClasses'

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

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildFlowElements(flowData?.nodes, flowData?.edges),
    [flowData],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Sync when flow data changes
  useEffect(() => {
    const { nodes: n, edges: e } = buildFlowElements(flowData?.nodes, flowData?.edges)
    setNodes(n)
    setEdges(e)
  }, [flowData, setEdges, setNodes])

  const onNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    const nodeData = node.data as ProcessFlowNodeData
    dispatch({
      type: 'SELECT_MATERIAL_AND_CHARTS',
      payload: {
        material_id: String(nodeData.material_id),
        material_name: typeof nodeData.material_name === 'string' ? nodeData.material_name : undefined,
      },
    })
  }, [dispatch])

  if (!state.selectedMaterial) {
    return (
      <div className={emptyStateClass}>
        <div className={emptyIconClass}>⬡</div>
        <p>Select a material above to view its process flow map.</p>
        <p className={emptySubClass}>Each node shows SPC health status. Click a node to drill into control charts.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className={loadingClass}>
        <div className={spinnerClass} />
        <p>Loading process flow…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="banner banner--error">
        Failed to load process flow: {error}
      </div>
    )
  }

  if (!nodes.length) {
    return (
      <div className={emptyStateClass}>
        <p>No process flow data found for <strong>{state.selectedMaterial.material_name}</strong>.</p>
        <p className={emptySubClass}>This material may not have lineage data in the selected date range.</p>
      </div>
    )
  }

  return (
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
        <span className={legendHintClass}>Click a node to open control charts</span>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
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
  )
}
