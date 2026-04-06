import type { ProcessFlowEdgeData, ProcessFlowNodeRecord } from '../types'

interface PositionedFlowNode extends ProcessFlowNodeRecord {
  position: {
    x: number
    y: number
  }
}

export function layoutFlowGraph(
  nodes: ProcessFlowNodeRecord[],
  edges: ProcessFlowEdgeData[],
): PositionedFlowNode[] {
  if (!nodes || nodes.length === 0) return []

  const NODE_W = 240   // horizontal spacing
  const NODE_H = 160   // vertical spacing

  const nodeIds = new Set(nodes.map(n => n.id))

  // Build adjacency: successors and predecessors
  const successors = new Map<string, string[]>(nodes.map(n => [n.id, []]))
  const predecessors = new Map<string, string[]>(nodes.map(n => [n.id, []]))

  for (const e of edges) {
    if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
      successors.get(e.source)?.push(e.target)
      predecessors.get(e.target)?.push(e.source)
    }
  }

  // Kahn's algorithm for topological sort + layer assignment
  // Layer = longest path from any source
  const layer = new Map<string, number>()
  const inDegree = new Map<string, number>(nodes.map(n => [n.id, predecessors.get(n.id)?.length ?? 0]))
  const queue: string[] = []

  for (const [id, deg] of inDegree) {
    if (deg === 0) {
      queue.push(id)
      layer.set(id, 0)
    }
  }

  while (queue.length > 0) {
    const curr = queue.shift()
    if (!curr) continue
    const currLayer = layer.get(curr) ?? 0
    for (const succ of successors.get(curr) ?? []) {
      const proposed = currLayer + 1
      if (!layer.has(succ) || (layer.get(succ) ?? 0) < proposed) {
        layer.set(succ, proposed)
      }
      const newDeg = (inDegree.get(succ) || 1) - 1
      inDegree.set(succ, newDeg)
      if (newDeg <= 0) queue.push(succ)
    }
  }

  // Assign any remaining nodes (cycles or disconnected) to layer 0
  for (const n of nodes) {
    if (!layer.has(n.id)) layer.set(n.id, 0)
  }

  // Group nodes by layer
  const byLayer = new Map<number, string[]>()
  for (const [id, l] of layer) {
    if (!byLayer.has(l)) byLayer.set(l, [])
    byLayer.get(l)?.push(id)
  }

  // Assign positions: x = layer * NODE_W, y = position_in_layer * NODE_H
  // Centre each layer vertically
  const maxLayerSize = Math.max(...[...byLayer.values()].map(arr => arr.length))
  const positions = new Map<string, { x: number; y: number }>()

  for (const [l, ids] of byLayer) {
    const layerSize = ids.length
    const offsetY = ((maxLayerSize - layerSize) / 2) * NODE_H
    ids.forEach((id, i) => {
      positions.set(id, {
        x: l * NODE_W,
        y: offsetY + i * NODE_H,
      })
    })
  }

  return nodes.map(n => ({
    ...n,
    position: positions.get(n.id) ?? { x: 0, y: 0 },
  }))
}
