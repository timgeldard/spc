import { useCallback, useState } from 'react'
import Tree from 'react-d3-tree'

/**
 * TraceNode — Custom SVG node with status-based coloring
 *
 * Node colors by status:
 *   - green: Released
 *   - red: Blocked/Rejected
 *   - yellow: QI Hold/Restricted
 *   - gray: Unknown
 */
function TraceNode({ nodeDatum, toggleNode, isLeaf, onNodeSelect }) {
  const hasChildren =
    nodeDatum.__rd3t?.collapsed === true ||
    (Array.isArray(nodeDatum.children) && nodeDatum.children.length > 0)

  const nodeColor = nodeDatum.nodeColor || 'gray'
  const showWarningIcon = ['Critical', 'Warning'].includes(nodeDatum.riskTier)

  const handleClick = () => {
    toggleNode()
    // Notify parent of selection
    if (onNodeSelect) {
      onNodeSelect({
        materialId: nodeDatum.name,
        batchId: nodeDatum.attributes?.Batch,
        status: nodeDatum.status,
      })
    }
  }

  return (
    <g
      onClick={handleClick}
      className={`trace-node trace-node--${nodeColor}`}
      role="button"
      tabIndex={0}
    >
      {/* Node circle with status color */}
      <circle
        r={22}
        className={`node-circle node-circle--${nodeColor}`}
      />

      {/* Collapse indicator */}
      {hasChildren && (
        <text y={1} textAnchor="middle" className="node-collapse-indicator">
          {nodeDatum.__rd3t?.collapsed ? '▶' : '▼'}
        </text>
      )}

      {/* Material ID — above the circle */}
      <text
        x={0}
        y={-34}
        textAnchor="middle"
        className="node-label node-label--primary"
      >
        {nodeDatum.name}
      </text>

      {/* Warning icon for elevated risk tiers */}
      {showWarningIcon && (
        <text
          x={20}
          y={-16}
          textAnchor="middle"
          className="node-label node-label--secondary"
        >
          ⚠
        </text>
      )}

      {/* Batch ID — below the circle */}
      {nodeDatum.attributes?.Batch && (
        <text
          x={0}
          y={40}
          textAnchor="middle"
          className="node-label node-label--secondary"
        >
          {nodeDatum.attributes.Batch}
        </text>
      )}

      {/* Optional description */}
      {nodeDatum.attributes?.Description && (
        <text
          x={0}
          y={55}
          textAnchor="middle"
          className="node-label node-label--description"
        >
          {nodeDatum.attributes.Description}
        </text>
      )}
    </g>
  )
}

/**
 * TraceTree renders a react-d3-tree collapsible tree inside a responsive
 * container.  The tree is centered on first render and supports pan + zoom.
 *
 * @param {{ data: object, onNodeSelect?: (node) => void }} props
 *   - react-d3-tree node hierarchy
 *   - onNodeSelect callback when user clicks a node
 */
export default function TraceTree({ data, onNodeSelect }) {
  // Measure the container so we can centre the tree root correctly.
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

  const containerRef = useCallback((el) => {
    if (el) {
      const rect = el.getBoundingClientRect()
      setDimensions({ width: rect.width, height: rect.height })
    }
  }, [])

  return (
    <div className="tree-container" ref={containerRef}>
      <Tree
        data={data}
        dimensions={dimensions}
        orientation="vertical"
        translate={{ x: dimensions.width / 2, y: 80 }}
        nodeSize={{ x: 220, y: 160 }}
        separation={{ siblings: 1.4, nonSiblings: 1.8 }}
        pathFunc="diagonal"
        zoom={0.8}
        collapsible
        initialDepth={2}
        renderCustomNodeElement={(rd3tProps) => (
          <TraceNode
            {...rd3tProps}
            isLeaf={
              !rd3tProps.nodeDatum.children ||
              rd3tProps.nodeDatum.children.length === 0
            }
            onNodeSelect={onNodeSelect}
          />
        )}
      />
    </div>
  )
}
