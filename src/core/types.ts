/**
 * Corkei Core Type Definitions
 * 
 * This file defines the fundamental data structures for Corkei's
 * multi-agent system with graph-based context.
 */

// =============================================================================
// Context Graph Types
// =============================================================================

/**
 * Unique identifier for a context node.
 * Using branded type for type safety.
 */
export type NodeId = string & { readonly __brand: 'NodeId' };

/**
 * Creates a NodeId from a string.
 */
export function nodeId(id: string): NodeId {
  return id as NodeId;
}

/**
 * A node in the context graph.
 * Contains markdown text, children, and links to related nodes.
 */
export interface ContextNode {
  /** Unique identifier for this node */
  id: NodeId;

  /**
   * Main text content in Markdown format.
   * Contains properties, description, and summaries of child nodes.
   * For agents, the root node text serves as the system instruction.
   */
  text: string;

  /** Ordered list of child node IDs */
  children: NodeId[];

  /** Links to related nodes (graph edges, not just tree edges) */
  links: NodeId[];

  /** Metadata for the node */
  metadata: NodeMetadata;
}

/**
 * Metadata associated with a context node.
 */
export interface NodeMetadata {
  /** When the node was created */
  createdAt: Date;

  /** When the node was last modified */
  updatedAt: Date;

  /** Optional title for display */
  title?: string;

  /** Optional tags for categorization */
  tags?: string[];
}

/**
 * The context graph: a map from NodeId to ContextNode.
 */
export type ContextGraph = Map<NodeId, ContextNode>;

// =============================================================================
// Conversation Types
// =============================================================================

/**
 * Role in a conversation turn.
 */
export type TurnRole = 'user' | 'model';

/**
 * Unique identifier for a conversation turn.
 */
export type TurnId = string & { readonly __brand: 'TurnId' };

/**
 * Creates a TurnId from a string.
 */
export function turnId(id: string): TurnId {
  return id as TurnId;
}

/**
 * Types of content parts in a turn.
 */
export type ContentPart =
  | TextPart
  | ThoughtPart;
// | ToolCallPart | ToolResultPart (Future)

/**
 * Basic text message part.
 */
export interface TextPart {
  type: 'text';
  content: string;
  /** Duration in milliseconds it took to generate this part */
  durationMs?: number;
}

/**
 * Model reasoning/thought process part.
 */
export interface ThoughtPart {
  type: 'thought';
  content: string;
  /** Duration in milliseconds it took to generate this part */
  durationMs?: number;
}

/**
 * A single turn in a conversation.
 * 
 * Turns form a linked list (chain) and can reference nodes in the context graph.
 * Content is stored as an ordered array of parts to preserve CoT sequence.
 */
export interface Turn {
  /** Unique identifier for this turn */
  id: TurnId;

  /** Role of the participant (user or assistant) */
  role: TurnRole;

  /** 
   * The message content as ordered parts.
   * Preserves model's original output sequence (e.g., thoughts before answer).
   */
  parts: ContentPart[];

  /** When this turn occurred */
  timestamp: Date;

  /** Link to the previous turn in the chain (null for first turn) */
  previousTurnId: TurnId | null;

  /**
   * Links to related nodes in the context tree.
   * This mapping is done by the agent as part of its output.
   */
  relatedNodes: NodeId[];

  /** Whether this turn is currently being generated/streamed */
  isStreaming?: boolean;

  /** When the first token (chunk) of the model response arrived */
  firstTokenTimestamp?: Date;

  /** Total time in milliseconds from user message to full response */
  responseTime?: number;
}

// =============================================================================
// Agent Types
// =============================================================================

/**
 * Configuration for an agent.
 */
export interface AgentConfig {
  /** Name of this agent */
  name: string;

  /** Root node ID for this agent's context tree */
  rootNodeId: NodeId;

  /** Model to use for this agent */
  model: string;

  /** Optional generation config */
  generationConfig?: GenerationConfig;

  /** 
   * Number of recent turns to include in context & display.
   * Default: 100
   */
  maxRecentTurns?: number;
}

/**
 * Generation configuration for the model.
 */
export interface GenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
  thinkingLevel?: null | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'dynamic';
}

/**
 * Result from processing a turn.
 * The response to user is optional (can return "void").
 */
export interface TurnResult {
  /** Optional response text to the user */
  response?: string;

  /** Updates to node contents */
  nodeUpdates: NodeUpdate[];

  /** Updates to links in the current turn */
  linkUpdates: LinkUpdate[];

  /** The created turn record */
  turn: Turn;
}

/**
 * An update to a node's content.
 */
export interface NodeUpdate {
  nodeId: NodeId;
  newText?: string;
  newChildren?: NodeId[];
  newLinks?: NodeId[];
}

/**
 * An update to add links from the current turn to related nodes.
 */
export interface LinkUpdate {
  nodeId: NodeId;
}

// =============================================================================
// Model Provider Types
// =============================================================================

/**
 * Input for a model generation request.
 */
export interface ModelInput {
  /** System instruction (root node text for context) */
  systemInstruction: string;

  /** Current user input or conversation turns */
  input: ModelTurn[];

  /** Generation configuration */
  generationConfig?: GenerationConfig;
}

/**
 * A turn in the model input format.
 */
export interface ModelTurn {
  role: TurnRole;
  parts: ContentPart[];
}

/**
 * Result from a model generation.
 */
export interface ModelResult {
  /** 
   * The generated content as ordered parts.
   * Preserves model's original output sequence.
   */
  parts: ContentPart[];

  /** Token usage statistics */
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

/**
 * A chunk of a model streaming response.
 */
export type ModelStreamChunk =
  | { type: 'text'; text: string }
  | { type: 'thought'; text: string }
  | { type: 'usage'; usage: ModelResult['usage'] };

/**
 * Abstract interface for AI model providers.
 * Designed for extension to local models (Ollama, etc.).
 */
export interface ModelProvider {
  /** Generate a response from the model */
  generate(input: ModelInput): Promise<ModelResult>;

  /** Generate a streaming response */
  generateStream?(input: ModelInput): AsyncIterable<ModelStreamChunk>;
}
