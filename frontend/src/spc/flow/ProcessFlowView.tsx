import React, { useCallback, useEffect, useMemo, useState } from 'react'
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
import { ArrowRight, Focus, GitBranch, Network, ScanSearch, X } from 'lucide-react'
import { useSPC } from '../SPCContext'
import { useSPCFlow } from '../hooks/useSPCFlow'
import { layoutFlowGraph } from './layoutFlowGraph'
import ProcessNode from './ProcessNode'
import ProcessFlowLegend from './ProcessFlowLegend'
import type { ProcessFlowEdgeData, ProcessFlowNodeData, ProcessFlowNodeRecord } from '../types'
import {
  cardSubClass,
  cardTitleClass,
  flowCanvasClass,
  heroCardDenseClass,
  moduleEyebrowClass,
  moduleHeaderCardClass,
  splitPanelClass,
} from '../uiClasses'
import InfoBanner from '../components/InfoBanner'
import LoadingSkeleton from '../components/LoadingSkeleton'
import ModuleEmptyState from '../components/ModuleEmptyState'

type FlowNode = Node<ProcessFlowNodeData, 'processNode'>
type FlowEdge = Edge
type TraceDirection = 'upstream' | 'downstream' | null
const nodeTypes = { processNode: ProcessNode }

// Kerry brand palette — matches ProcessNode STATUS
const STATUS_COLOR = {
  green: '#44CF93',  // Jade
  amber: '#F9C20A',  // Sunrise
  red:   '#F24A00',  // Sunset
  grey:  '#99BCC8',  // Slate 40
}

function buildFlowElements(
  rawNodes?: ProcessFlowNodeRecord[] | null,
  rawEdges?: ProcessFlowEdgeData[] | null,
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  if (!rawNodes?.length) return { nodes: [], edges: [] }

  // Layout positions
  const positioned = layoutFlowGraph(rawNodes, rawEdges ?? [])

  const nodes: FlowNode[] = positioned.map(n => {
    const totalBatches = n.total_batches ?? 0
    const rejectedBatches = n.rejected_batches ?? 0
    const rejectionRate = totalBatches > 0 ? Number(((rejectedBatches / totalBatches) * 100).toFixed(1)) : null
    const inferredSignal = Boolean(
      n.last_ooc
      || n.has_ooc_signal
      || n.status === 'red'
      || (typeof n.estimated_cpk === 'number' && n.estimated_cpk < 1),
    )

    return {
      id: n.id,
      type: 'processNode',
      position: n.position,
      data: {
        material_id: n.material_id,
        material_name: n.material_name,
        plant_name: n.plant_name,
        total_batches: totalBatches,
        rejected_batches: rejectedBatches,
        rejection_rate_pct: rejectionRate,
        mic_count: n.mic_count,
        mean_value: n.mean_value,
        stddev_value: n.stddev_value,
        estimated_cpk: n.estimated_cpk,
        has_ooc_signal: inferredSignal,
        last_ooc: typeof n.last_ooc === 'string' ? n.last_ooc : null,
        status: n.status,
        is_root: n.is_root,
        sparkline_values: n.sparkline_values ?? [],
      },
      selectable: true,
      draggable: true,
    }
  })

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
        stroke: animated ? '#F24A00' : '#CCDDE4',  // Sunset / Slate 20
        strokeWidth: animated ? 2 : 1.5,
      },
    }
  })

  return { nodes, edges }
}

function collectLinkedNodeIds(
  startId: string,
  direction: Exclude<TraceDirection, null>,
  edges: FlowEdge[],
): Set<string> {
  const visited = new Set<string>([startId])
  const queue = [startId]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue

    edges.forEach(edge => {
      const nextId = direction === 'upstream'
        ? (edge.target === current ? edge.source : null)
        : (edge.source === current ? edge.target : null)

      if (nextId && !visited.has(nextId)) {
        visited.add(nextId)
        queue.push(nextId)
      }
    })
  }

  return visited
}

export default function ProcessFlowView() {
  const { state, dispatch } = useSPC()
  const { flowData, loading, error } = useSPCFlow(
    state.selectedMaterial?.material_id,
    state.dateFrom,
    state.dateTo,
  )

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [traceDirection, setTraceDirection] = useState<TraceDirection>(null)

  // Sync when flow data changes
  useEffect(() => {
    const { nodes: n, edges: e } = buildFlowElements(flowData?.nodes, flowData?.edges)
    setNodes(n)
    setEdges(e)
    setSelectedNodeId(current => (current && n.some(node => node.id === current) ? current : null))
    setTraceDirection(null)
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
    setSelectedNodeId(node.id)
    setTraceDirection(null)
  }, [])

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const focused = nodes.find(n => n.selected)
    if (focused) {
      setSelectedNodeId(focused.id)
      setTraceDirection(null)
    }
  }, [nodes])

  const selectedNode = useMemo(
    () => nodes.find(node => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  )

  const highlightedIds = useMemo(() => {
    if (!selectedNodeId) return new Set<string>()
    if (!traceDirection) return new Set<string>([selectedNodeId])
    return collectLinkedNodeIds(selectedNodeId, traceDirection, edges)
  }, [edges, selectedNodeId, traceDirection])

  const renderedNodes = useMemo(
    () => nodes.map(node => {
      const isSelected = node.id === selectedNodeId
      const hasSelection = Boolean(selectedNodeId)
      const isHighlighted = highlightedIds.has(node.id)

      return {
        ...node,
        selected: isSelected,
        draggable: true,
        style: {
          ...node.style,
          opacity: hasSelection && !isHighlighted ? 0.35 : 1,
        },
      }
    }),
    [highlightedIds, nodes, selectedNodeId],
  )

  const renderedEdges = useMemo(
    () => edges.map(edge => {
      const hasSelection = Boolean(selectedNodeId)
      const isHighlighted = highlightedIds.has(edge.source) && highlightedIds.has(edge.target)
      const isIncident = edge.source === selectedNodeId || edge.target === selectedNodeId

      return {
        ...edge,
        animated: isHighlighted || isIncident,
        style: {
          ...edge.style,
          opacity: hasSelection && !isHighlighted && !isIncident ? 0.18 : 1,
          stroke: isHighlighted ? '#289BA2' : isIncident ? '#005776' : (edge.style?.stroke ?? '#CCDDE4'),  // Sage / Slate / Slate 20
          strokeWidth: isHighlighted ? 3 : isIncident ? 2.4 : (edge.style?.strokeWidth ?? 1.5),
        },
      }
    }),
    [edges, highlightedIds, selectedNodeId],
  )

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
          <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/92 px-3 py-2 text-xs shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/92">
            <span className="font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
              Flow Controls
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Drag to pan
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Scroll to zoom
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Click node to inspect
            </span>
          </div>

          <ReactFlow
            nodes={renderedNodes}
            edges={renderedEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onPaneClick={() => {
              setSelectedNodeId(null)
              setTraceDirection(null)
            }}
            onKeyDown={onKeyDown}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            minZoom={0.2}
            maxZoom={2.5}
            panOnScroll
            selectionOnDrag
            nodesConnectable={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={'dots' as BackgroundVariant} gap={24} color="#e2e8f0" />
            <Controls />
            <MiniMap
              nodeColor={n => STATUS_COLOR[(n.data?.status ?? 'grey') as keyof typeof STATUS_COLOR] ?? '#9ca3af'}
              maskColor="rgba(248,250,252,0.85)"
              pannable
              zoomable
            />
            <ProcessFlowLegend />
          </ReactFlow>
        </div>
        <aside className={`${heroCardDenseClass} space-y-4`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className={moduleEyebrowClass}>Node Inspector</div>
              <div className="text-sm text-[var(--c-text-muted)]">
                Select a node to inspect its quality posture, then trace the surrounding lineage.
              </div>
            </div>
            {selectedNode && (
              <button
                type="button"
                onClick={() => {
                  setSelectedNodeId(null)
                  setTraceDirection(null)
                }}
                className="rounded-full border border-[var(--c-border)] p-1.5 text-[var(--c-text-muted)] transition hover:border-slate-400 hover:text-[var(--c-text)]"
                aria-label="Clear node selection"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {!selectedNode && (
            <>
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                Click any process node to inspect rejection rate, capability, and path tracing controls.
              </div>
              <div className="space-y-2 text-xs text-[var(--c-text-muted)]">
                <p><span className="font-semibold" style={{ color: STATUS_COLOR.green }}>Green</span> nodes are operationally healthy.</p>
                <p><span className="font-semibold" style={{ color: STATUS_COLOR.amber }}>Amber</span> nodes should be monitored for drift.</p>
                <p><span className="font-semibold" style={{ color: STATUS_COLOR.red }}>Red</span> nodes are likely risk hotspots.</p>
                <p><span className="font-semibold" style={{ color: '#F24A00' }}>Red-orange</span> borders indicate inferred OOC attention from current rejection or capability posture.</p>
              </div>
            </>
          )}

          {selectedNode && (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/70">
                <div className="text-lg font-semibold text-[var(--c-text)]">
                  {selectedNode.data.material_name ?? selectedNode.data.material_id}
                </div>
                <div className="mt-1 text-xs text-[var(--c-text-muted)]">
                  {selectedNode.data.plant_name ?? 'Plant not specified'}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--c-text-muted)]">Rejection</div>
                    <div className="mt-1 font-medium text-[var(--c-text)]">
                      {selectedNode.data.rejection_rate_pct != null ? `${selectedNode.data.rejection_rate_pct.toFixed(1)}%` : 'Unavailable'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--c-text-muted)]">Estimated Cpk</div>
                    <div className="mt-1 font-medium text-[var(--c-text)]">
                      {selectedNode.data.estimated_cpk != null ? selectedNode.data.estimated_cpk.toFixed(2) : 'Unavailable'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--c-text-muted)]">Batches</div>
                    <div className="mt-1 font-medium text-[var(--c-text)]">{selectedNode.data.total_batches ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--c-text-muted)]">Rejected</div>
                    <div className="mt-1 font-medium text-[var(--c-text)]">{selectedNode.data.rejected_batches ?? 0}</div>
                  </div>
                </div>

                {selectedNode.data.has_ooc_signal && (
                  <div className="mt-4 rounded-xl bg-[#FCDBCC] px-3 py-2 text-sm font-medium text-[#F24A00] dark:bg-[#3D1200] dark:text-[#F56E33]">
                    {selectedNode.data.last_ooc
                      ? `Latest OOC signal ${selectedNode.data.last_ooc}`
                      : 'OOC attention inferred from current rejection or capability posture.'}
                  </div>
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setTraceDirection(current => current === 'upstream' ? null : 'upstream')}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                >
                  <GitBranch className="h-4 w-4" />
                  Trace Upstream
                </button>
                <button
                  type="button"
                  onClick={() => setTraceDirection(current => current === 'downstream' ? null : 'downstream')}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Network className="h-4 w-4" />
                  Trace Downstream
                </button>
              </div>

              <button
                type="button"
                onClick={() => activateNode(selectedNode.data)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#CCDDE4] bg-[#D4EBEC] px-4 py-3 text-sm font-medium text-[#005776] transition hover:bg-[#A9D7DA] dark:border-[#337991] dark:bg-[#337991]/40 dark:text-[#44CF93] dark:hover:bg-[#337991]/60"
              >
                <ScanSearch className="h-4 w-4" />
                Open In Control Charts
                <ArrowRight className="h-4 w-4" />
              </button>

              {traceDirection && (
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <Focus className="h-3.5 w-3.5" />
                  {traceDirection === 'upstream' ? 'Upstream path highlighted' : 'Downstream path highlighted'}
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
