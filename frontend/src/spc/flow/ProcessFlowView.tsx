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
import ArrowRight from '@carbon/icons-react/es/ArrowRight.js'
import Branch from '@carbon/icons-react/es/Branch.js'
import Close from '@carbon/icons-react/es/Close.js'
import Network_1 from '@carbon/icons-react/es/Network_1.js'
import SearchAdvanced from '@carbon/icons-react/es/SearchAdvanced.js'
import ZoomFit from '@carbon/icons-react/es/ZoomFit.js'
import { Button } from '~/lib/carbon-forms'
import { Stack, Tile } from '~/lib/carbon-layout'
import { shallowEqual, useSPCDispatch, useSPCSelector } from '../SPCContext'
import { useSPCFlow } from '../hooks/useSPCFlow'
import { layoutFlowGraph } from './layoutFlowGraph'
import ProcessNode from './ProcessNode'
import ProcessFlowLegend from './ProcessFlowLegend'
import type { ProcessFlowEdgeData, ProcessFlowNodeData, ProcessFlowNodeRecord } from '../types'
import InfoBanner from '../components/InfoBanner'
import LoadingSkeleton from '../components/LoadingSkeleton'
import ModuleEmptyState from '../components/ModuleEmptyState'

type FlowNode = Node<ProcessFlowNodeData, 'processNode'>
type FlowEdge = Edge
type TraceDirection = 'upstream' | 'downstream' | null
const nodeTypes = { processNode: ProcessNode }

// Status colours aligned to Carbon support tokens
const STATUS_COLOR = {
  green: 'var(--cds-support-success)',
  amber: 'var(--cds-support-warning)',
  red:   'var(--cds-support-error)',
  grey:  'var(--cds-icon-secondary)',
}

// Concrete hex fallbacks for MiniMap (cannot resolve CSS vars)
const STATUS_MINIMAP_COLOR: Record<string, string> = {
  green: '#24a148',   // IBM Green 50
  amber: '#f1c21b',   // IBM Yellow 30
  red:   '#da1e28',   // IBM Red 60
  grey:  '#697077',   // IBM Gray 50
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
        stroke: animated ? 'var(--cds-support-error)' : 'var(--cds-border-subtle-01)',
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
  const dispatch = useSPCDispatch()
  const state = useSPCSelector(
    current => ({
      selectedMaterial: current.selectedMaterial,
      dateFrom: current.dateFrom,
      dateTo: current.dateTo,
      processFlowUpstreamDepth: current.processFlowUpstreamDepth,
      processFlowDownstreamDepth: current.processFlowDownstreamDepth,
    }),
    shallowEqual,
  )
  const { flowData, loading, error } = useSPCFlow(
    state.selectedMaterial?.material_id,
    state.dateFrom,
    state.dateTo,
    state.processFlowUpstreamDepth,
    state.processFlowDownstreamDepth,
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
    return <InfoBanner variant="error">{`Failed to load process flow: ${error}`}</InfoBanner>
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
    <Stack gap={4}>
      <Tile>
        <div style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--cds-text-secondary)', marginBottom: '0.25rem' }}>
          Material lineage review
        </div>
        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--cds-text-primary)' }}>Process Flow</h3>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
          Review upstream and downstream lineage around {state.selectedMaterial.material_name}. Use this to trace where quality risk may propagate across the network.
        </p>
      </Tile>

      <div style={{ display: 'grid', gap: '1.25rem', gridTemplateColumns: 'minmax(0, 1.5fr) 320px', alignItems: 'start' }}>
        <div style={{ position: 'relative', minHeight: '500px', height: 'calc(100vh - 280px)', overflow: 'hidden', border: '1px solid var(--cds-border-subtle-01)', background: 'var(--cds-background)' }}>
          <div style={{ position: 'absolute', left: '0.75rem', top: '0.75rem', zIndex: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', border: '1px solid var(--cds-border-subtle-01)', background: 'var(--cds-layer)', padding: '0.5rem 0.75rem', fontSize: '0.75rem' }}>
            <span style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--cds-text-secondary)' }}>
              Flow Controls
            </span>
            <span style={{ background: 'var(--cds-layer-accent-01)', padding: '0.25rem 0.625rem', color: 'var(--cds-text-secondary)' }}>
              Drag to pan
            </span>
            <span style={{ background: 'var(--cds-layer-accent-01)', padding: '0.25rem 0.625rem', color: 'var(--cds-text-secondary)' }}>
              Scroll to zoom
            </span>
            <span style={{ background: 'var(--cds-layer-accent-01)', padding: '0.25rem 0.625rem', color: 'var(--cds-text-secondary)' }}>
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
            <Background variant={'dots' as BackgroundVariant} gap={24} color="var(--cds-border-subtle-01)" />
            <Controls />
            <MiniMap
              nodeColor={n => STATUS_MINIMAP_COLOR[(n.data?.status ?? 'grey') as string] ?? '#697077'}
              maskColor="rgba(0,0,0,0.05)"
              pannable
              zoomable
            />
            <ProcessFlowLegend />
          </ReactFlow>
        </div>
        <Tile>
          <Stack gap={4}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
              <div>
                <div style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--cds-text-secondary)' }}>
                  Node Inspector
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginTop: '0.25rem' }}>
                  Select a node to inspect its quality posture, then trace the surrounding lineage.
                </div>
              </div>
              {selectedNode && (
                <Button
                  kind="ghost"
                  size="sm"
                  hasIconOnly
                  renderIcon={() => <Close size={16} />}
                  iconDescription="Clear node selection"
                  onClick={() => {
                    setSelectedNodeId(null)
                    setTraceDirection(null)
                  }}
                />
              )}
            </div>

            {!selectedNode && (
              <Stack gap={3}>
                <div style={{ border: '1px dashed var(--cds-border-subtle-01)', background: 'var(--cds-layer-accent-01)', padding: '1.25rem', fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
                  Click any process node to inspect rejection rate, capability, and path tracing controls.
                </div>
                <Stack gap={2} style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                  <p style={{ margin: 0 }}><strong style={{ color: 'var(--cds-support-success)' }}>Green</strong> nodes are operationally healthy.</p>
                  <p style={{ margin: 0 }}><strong style={{ color: 'var(--cds-support-warning)' }}>Amber</strong> nodes should be monitored for drift.</p>
                  <p style={{ margin: 0 }}><strong style={{ color: 'var(--cds-support-error)' }}>Red</strong> nodes are likely risk hotspots.</p>
                </Stack>
              </Stack>
            )}

            {selectedNode && (
              <Stack gap={4}>
                <div style={{ border: '1px solid var(--cds-border-subtle-01)', padding: '1rem', background: 'var(--cds-layer)' }}>
                  <div style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>
                    {selectedNode.data.material_name ?? selectedNode.data.material_id}
                  </div>
                  <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                    {selectedNode.data.plant_name ?? 'Plant not specified'}
                  </div>

                  <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.875rem' }}>
                    {[
                      { label: 'Rejection', value: selectedNode.data.rejection_rate_pct != null ? `${selectedNode.data.rejection_rate_pct.toFixed(1)}%` : 'Unavailable' },
                      { label: 'Estimated Cpk', value: selectedNode.data.estimated_cpk != null ? selectedNode.data.estimated_cpk.toFixed(2) : 'Unavailable' },
                      { label: 'Batches', value: String(selectedNode.data.total_batches ?? 0) },
                      { label: 'Rejected', value: String(selectedNode.data.rejected_batches ?? 0) },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--cds-text-secondary)' }}>{label}</div>
                        <div style={{ marginTop: '0.25rem', fontWeight: 500, color: 'var(--cds-text-primary)' }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {selectedNode.data.has_ooc_signal && (
                    <div style={{ marginTop: '1rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', fontWeight: 500, background: 'var(--cds-notification-background-error)', color: 'var(--cds-support-error)', border: '1px solid var(--cds-support-error)' }}>
                      {selectedNode.data.last_ooc
                        ? `Latest OOC signal ${selectedNode.data.last_ooc}`
                        : 'OOC attention inferred from current rejection or capability posture.'}
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: '1fr 1fr' }}>
                  <Button
                    kind="primary"
                    size="md"
                    renderIcon={() => <Branch size={16} />}
                    onClick={() => setTraceDirection(current => current === 'upstream' ? null : 'upstream')}
                  >
                    Trace Upstream
                  </Button>
                  <Button
                    kind="secondary"
                    size="md"
                    renderIcon={() => <Network_1 size={16} />}
                    onClick={() => setTraceDirection(current => current === 'downstream' ? null : 'downstream')}
                  >
                    Trace Downstream
                  </Button>
                </div>

                <Button
                  kind="tertiary"
                  size="md"
                  renderIcon={() => <ArrowRight size={16} />}
                  style={{ width: '100%' }}
                  onClick={() => activateNode(selectedNode.data)}
                >
                  <SearchAdvanced size={16} style={{ marginRight: '0.5rem' }} />
                  Open In Control Charts
                </Button>

                {traceDirection && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0.75rem', fontSize: '0.75rem', fontWeight: 500, color: 'var(--cds-text-secondary)', background: 'var(--cds-layer-accent-01)' }}>
                    <ZoomFit size={14} />
                    {traceDirection === 'upstream' ? 'Upstream path highlighted' : 'Downstream path highlighted'}
                  </div>
                )}
              </Stack>
            )}
          </Stack>
        </Tile>
      </div>
    </Stack>
  )
}
