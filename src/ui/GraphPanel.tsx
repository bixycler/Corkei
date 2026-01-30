/**
 * GraphPanel - D3 force-directed graph visualization for the context graph.
 * 
 * Displays nodes and edges with:
 * - Force-directed layout
 * - Draggable nodes
 * - Click to select
 * - Highlight active path
 */

import { type Component, createEffect, onMount, onCleanup } from 'solid-js';
import * as d3 from 'd3';
import type { ContextGraph, NodeId, ContextNode } from '../core/types';

// Styles are in Corkei.css

export interface GraphPanelProps {
  /** The context graph to visualize */
  graph: ContextGraph;

  /** The root node ID for highlighting */
  rootNodeId: NodeId;

  /** Currently selected node ID */
  selectedNodeId?: NodeId;

  /** Callback when a node is clicked */
  onNodeClick?: (nodeId: NodeId) => void;
}

/** D3 node data with simulation properties */
interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  title: string;
  isRoot: boolean;
  isSelected: boolean;
}

/** D3 link data */
interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  isChild: boolean; // true for parent-child, false for link references
}

/**
 * Context graph visualization using D3 force-directed layout.
 */
const GraphPanel: Component<GraphPanelProps> = (props) => {
  let svgRef: SVGSVGElement | undefined;
  let simulation: d3.Simulation<GraphNode, GraphLink> | undefined;

  // Convert ContextGraph to D3 format
  const convertToD3Data = (): { nodes: GraphNode[], links: GraphLink[] } => {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    const nodeMap = new Map<string, GraphNode>();

    // Create nodes
    for (const [id, node] of props.graph.entries()) {
      const graphNode: GraphNode = {
        id: id as string,
        title: node.metadata.title || id.slice(0, 12) + '...',
        isRoot: id === props.rootNodeId,
        isSelected: id === props.selectedNodeId,
      };
      nodes.push(graphNode);
      nodeMap.set(id as string, graphNode);
    }

    // Create links
    for (const [id, node] of props.graph.entries()) {
      // Child relationships
      for (const childId of node.children) {
        if (nodeMap.has(childId as string)) {
          links.push({
            source: id as string,
            target: childId as string,
            isChild: true,
          });
        }
      }
      // Reference links
      for (const linkId of node.links) {
        if (nodeMap.has(linkId as string)) {
          links.push({
            source: id as string,
            target: linkId as string,
            isChild: false,
          });
        }
      }
    }

    return { nodes, links };
  };

  // Initialize and update the graph
  const renderGraph = () => {
    if (!svgRef) return;

    const svg = d3.select(svgRef);
    const width = svgRef.clientWidth || 400;
    const height = svgRef.clientHeight || 400;

    // Clear previous content
    svg.selectAll('*').remove();

    const { nodes, links } = convertToD3Data();

    if (nodes.length === 0) {
      // Show empty state
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#666')
        .text('No nodes in graph');
      return;
    }

    // Container group for zoom
    const g = svg.append('g');

    // Add zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    svg.call(zoom);

    // Create force simulation
    simulation = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(links)
        .id(d => d.id)
        .distance(80))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    // Draw links
    const link = g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('class', d => d.isChild ? 'link child' : 'link reference')
      .attr('stroke', d => d.isChild ? '#666' : '#448')
      .attr('stroke-width', d => d.isChild ? 2 : 1)
      .attr('stroke-dasharray', d => d.isChild ? 'none' : '4,4');

    // Draw nodes
    const node = g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .call(d3.drag<SVGGElement, GraphNode>()
        .on('start', (event, d) => {
          if (!event.active) simulation?.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation?.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }));

    // Node circles
    node.append('circle')
      .attr('r', d => d.isRoot ? 20 : 15)
      .attr('fill', d => {
        if (d.isSelected) return '#6cf';
        if (d.isRoot) return '#f80';
        return '#4a6';
      })
      .attr('stroke', d => d.isSelected ? '#fff' : '#333')
      .attr('stroke-width', d => d.isSelected ? 3 : 1)
      .on('click', (event, d) => {
        props.onNodeClick?.(d.id as NodeId);
      });

    // Node labels
    node.append('text')
      .attr('dy', 4)
      .attr('text-anchor', 'middle')
      .attr('fill', '#fff')
      .attr('font-size', '10px')
      .attr('pointer-events', 'none')
      .text(d => d.title.slice(0, 8));

    // Update positions on tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as GraphNode).x!)
        .attr('y1', d => (d.source as GraphNode).y!)
        .attr('x2', d => (d.target as GraphNode).x!)
        .attr('y2', d => (d.target as GraphNode).y!);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });
  };

  // Render on mount
  onMount(() => {
    renderGraph();
  });

  // Re-render when graph changes
  createEffect(() => {
    // Access props to track changes
    const _ = props.graph.size;
    const __ = props.selectedNodeId;
    renderGraph();
  });

  // Cleanup simulation on unmount
  onCleanup(() => {
    simulation?.stop();
  });

  return (
    <div class="graph-panel">
      <div class="graph-header">
        <h3>Context Graph</h3>
        <span class="node-count">{props.graph.size} nodes</span>
      </div>
      <svg ref={svgRef} class="graph-svg" />
    </div>
  );
};

export default GraphPanel;
