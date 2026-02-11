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
 * Participant position in a conversation.
 * Determines UI alignment and identity in the history.
 */
export type TurnPosition = 'human' | 'system' | 'agent' | 'self';

/**
 * Role in a conversation turn (mapped to Gemini API).
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
 * Model-specific metadata for a content part.
 */
export interface ContentPartMetadata {
  /** 
   * For Gemini 3 / Gemini 2.0+ Thinking models.
   * Required for thought coherence across turns.
   */
  thoughtSignature?: string;

  /** Allow for other model-specific fields */
  [key: string]: any;
}

/**
 * Types of content parts in a turn.
 */
export type ContentPart =
  | TextPart
  | ThoughtPart
  | ToolCallPart
  | ToolResultPart;

/**
 * Basic text message part.
 */
export interface TextPart {
  type: 'text';
  content: string;
  /** Duration in milliseconds it took to generate this part */
  durationMs?: number;
  /** Model-specific metadata */
  metadata?: ContentPartMetadata;
}

/**
 * Model reasoning/thought process part.
 */
export interface ThoughtPart {
  type: 'thought';
  content: string;
  /** Duration in milliseconds it took to generate this part */
  durationMs?: number;
  /** Model-specific metadata */
  metadata?: ContentPartMetadata;
}

/**
 * A tool/function call requested by the model.
 */
export interface ToolCall {
  /** Tool/function name */
  name: string;
  /** Arguments for the tool */
  args: Record<string, any>;
  /** Optional ID for matching results */
  id?: string;
}

/**
 * A tool call part in the conversation.
 */
export interface ToolCallPart {
  type: 'tool_call';
  toolCall: ToolCall;
  /** Duration in milliseconds (if timed) */
  durationMs?: number;
  /** Model-specific metadata */
  metadata?: ContentPartMetadata;
}

/**
 * Result of a tool call execution.
 */
export interface ToolResultPart {
  type: 'tool_result';
  toolCallId: string;
  result: any;
  /** Duration in milliseconds (if timed) */
  durationMs?: number;
  /** Model-specific metadata */
  metadata?: ContentPartMetadata;
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

  /** Position of the participant (human, system, agent, or self) */
  position: TurnPosition;

  /** Role mapped to model expectations (user or model) */
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

  /** Model-specific metadata for the turn */
  metadata?: ModelTurnMetadata;
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
 * Model-specific metadata for a conversation turn.
 */
export interface ModelTurnMetadata {
  /** Allow for model-specific fields at turn level */
  [key: string]: any;
}

/**
 * A turn in the model input format.
 */
export interface ModelTurn {
  role: TurnRole;
  parts: ContentPart[];
  /** Model-specific metadata for the turn */
  metadata?: ModelTurnMetadata;
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

  /** Model-specific metadata for the entire generation */
  metadata?: ModelTurnMetadata;
}

/**
 * A chunk of a model streaming response.
 */
export type ModelStreamChunk =
  | { type: 'text'; text: string; metadata?: ContentPartMetadata }
  | { type: 'thought'; text: string; metadata?: ContentPartMetadata }
  | { type: 'tool_call'; toolCall: ToolCall; metadata?: ContentPartMetadata }
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

// =============================================================================
// Response Schema (Zod)
// =============================================================================

import { z } from 'zod/v3';

/**
 * Schema for structured model responses.
 * Used with Gemini's responseJsonSchema for enforced JSON output.
 */
export const ResponseSchema = z.object({
  /** Model's thinking process */
  thought: z.string().optional(),
  /** Response to the user */
  response: z.string().optional(),
  /** Related node IDs */
  links: z.array(z.string()).optional(),
});

export type ResponseOutput = z.infer<typeof ResponseSchema>;
