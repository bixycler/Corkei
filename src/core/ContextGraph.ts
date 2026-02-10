/**
 * ContextGraph - Graph management for Corkei's context system.
 * 
 * The context graph is the core data structure for Corkei.
 * Each node contains markdown text and child nodes.
 * A tree view is projected from a root node for each agent.
 */

import {
  type ContextGraph,
  type ContextNode,
  type NodeId,
  type NodeMetadata,
  nodeId,
} from './types';

/**
 * Creates an empty context graph.
 */
export function createContextGraph(): ContextGraph {
  return new Map<NodeId, ContextNode>();
}

/**
 * Creates a new context node with default metadata.
 */
export function createNode(
  id: string,
  text: string = '',
  title?: string
): ContextNode {
  const now = new Date();
  return {
    id: nodeId(id),
    text,
    children: [],
    links: [],
    metadata: {
      createdAt: now,
      updatedAt: now,
      title,
    },
  };
}

/**
 * Adds a node to the graph.
 * @returns The added node
 */
export function addNode(graph: ContextGraph, node: ContextNode): ContextNode {
  graph.set(node.id, node);
  return node;
}

/**
 * Gets a node by its ID.
 * @returns The node or undefined if not found
 */
export function getNode(graph: ContextGraph, id: NodeId): ContextNode | undefined {
  return graph.get(id);
}

/**
 * Updates a node's text content.
 */
export function updateNodeText(
  graph: ContextGraph,
  id: NodeId,
  text: string
): void {
  const node = graph.get(id);
  if (node) {
    node.text = text;
    node.metadata.updatedAt = new Date();
  }
}

/**
 * Adds a child to a node.
 */
export function addChildToNode(
  graph: ContextGraph,
  parentId: NodeId,
  childId: NodeId
): void {
  const parent = graph.get(parentId);
  if (parent && !parent.children.includes(childId)) {
    parent.children.push(childId);
    parent.metadata.updatedAt = new Date();
  }
}

/**
 * Adds a link from one node to another.
 */
export function addLinkToNode(
  graph: ContextGraph,
  fromId: NodeId,
  toId: NodeId
): void {
  const node = graph.get(fromId);
  if (node && !node.links.includes(toId)) {
    node.links.push(toId);
    node.metadata.updatedAt = new Date();
  }
}

/**
 * Removes a node from the graph.
 * Does not update parent references - caller must handle this.
 */
export function removeNode(graph: ContextGraph, id: NodeId): boolean {
  return graph.delete(id);
}

// =============================================================================
// Tree Projection and Traversal
// =============================================================================

/**
 * Visitor callback for tree traversal.
 * @param node - The current node being visited
 * @param depth - The depth in the tree (0 for root)
 * @param isTextChild - True when visiting the "0 child" (text content)
 */
export type TreeVisitor = (
  node: ContextNode,
  depth: number,
  isTextChild: boolean
) => void;

/**
 * Traverses the context tree in depth-first order from a root node.
 * 
 * The traversal follows Corkei's rule:
 * - The text content of a node is considered its "0 child" in traversal,
 *   hence expanded first before actual children.
 * 
 * @param graph - The context graph
 * @param rootId - The root node ID to start traversal from
 * @param visitor - Callback function for each node
 * @param maxDepth - Maximum depth to traverse (default: 10)
 */
export function traverseTree(
  graph: ContextGraph,
  rootId: NodeId,
  visitor: TreeVisitor,
  maxDepth: number = 10
): void {
  const visited = new Set<NodeId>();

  function traverse(nodeId: NodeId, depth: number): void {
    // Prevent infinite loops from cycles
    if (visited.has(nodeId) || depth > maxDepth) {
      return;
    }
    visited.add(nodeId);

    const node = graph.get(nodeId);
    if (!node) {
      return;
    }

    // Visit the node's text content first (the "0 child")
    visitor(node, depth, true);

    // Then visit each child node
    for (const childId of node.children) {
      visitor(graph.get(childId)!, depth + 1, false);
      traverse(childId, depth + 1);
    }
  }

  traverse(rootId, 0);
}

/**
 * Generates a textual representation of the context tree.
 * 
 * This is the format passed to the AI model as system instruction.
 * Each node's text is included with indentation indicating depth.
 * 
 * @param graph - The context graph
 * @param rootId - The root node ID
 * @param maxDepth - Maximum depth to include (default: 10)
 * @returns The textual context string
 */
export function generateTextualContext(
  graph: ContextGraph,
  rootId: NodeId,
  maxDepth: number = 10
): string {
  const lines: string[] = [];

  traverseTree(graph, rootId, (node, depth, isTextChild) => {
    if (isTextChild && node.text) {
      // Add node ID and text
      lines.push(`<meta id="${node.id}">\n${node.text}`);
    }
  }, maxDepth);

  return lines.join('\n\n');
}

/**
 * Gets all node IDs in the tree projection from a root.
 */
export function getTreeNodeIds(
  graph: ContextGraph,
  rootId: NodeId,
  maxDepth: number = 10
): NodeId[] {
  const nodeIds: NodeId[] = [];

  traverseTree(graph, rootId, (node) => {
    if (!nodeIds.includes(node.id)) {
      nodeIds.push(node.id);
    }
  }, maxDepth);

  return nodeIds;
}

// =============================================================================
// Serialization
// =============================================================================

/**
 * Serializes the graph to a JSON-compatible object.
 */
export function serializeGraph(graph: ContextGraph): object {
  const nodes: ContextNode[] = [];
  for (const node of graph.values()) {
    nodes.push({
      ...node,
      metadata: {
        ...node.metadata,
        createdAt: node.metadata.createdAt,
        updatedAt: node.metadata.updatedAt,
      },
    });
  }
  return { nodes };
}

/**
 * Deserializes a graph from a JSON object.
 */
export function deserializeGraph(data: { nodes: ContextNode[] }): ContextGraph {
  const graph = createContextGraph();
  for (const nodeData of data.nodes) {
    const node: ContextNode = {
      ...nodeData,
      id: nodeId(nodeData.id),
      children: nodeData.children.map(id => nodeId(id as string)),
      links: nodeData.links.map(id => nodeId(id as string)),
      metadata: {
        ...nodeData.metadata,
        createdAt: new Date(nodeData.metadata.createdAt),
        updatedAt: new Date(nodeData.metadata.updatedAt),
      },
    };
    graph.set(node.id, node);
  }
  return graph;
}
