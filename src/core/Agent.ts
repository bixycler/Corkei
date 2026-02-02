/**
 * Agent - Base class for Corkei agents.
 * 
 * Each agent has a context tree (projected from a root node) and can
 * process conversation turns by sending context + history to the model.
 */

import type {
  ContextGraph,
  NodeId,
  TurnResult,
  NodeUpdate,
  LinkUpdate,
  ModelProvider,
  AgentConfig,
  ModelStreamChunk,
} from './types';
import { generateTextualContext } from './ContextGraph';
import { ConversationHistory } from './Conversation';

/**
 * Base class for Corkei agents.
 * Provides context tree projection and turn processing.
 */
export abstract class Agent {
  /** Agent configuration */
  protected config: AgentConfig;

  /** The context graph */
  protected graph: ContextGraph;

  /** Conversation history for this agent */
  protected history: ConversationHistory;

  /** The model provider */
  protected modelProvider: ModelProvider;

  /** Number of recent turns to include in context */
  protected recentTurnsCount: number = 10;

  constructor(
    config: AgentConfig,
    graph: ContextGraph,
    modelProvider: ModelProvider,
    history?: ConversationHistory
  ) {
    this.config = config;
    this.graph = graph;
    this.modelProvider = modelProvider;
    this.history = history || new ConversationHistory();
  }

  /**
   * Gets the root node ID for this agent's context tree.
   */
  get rootNodeId(): NodeId {
    return this.config.rootNodeId;
  }

  /**
   * Generates the textual context from the agent's context tree.
   * This becomes the system_instruction for the model.
   */
  protected getSystemInstruction(): string {
    return generateTextualContext(this.graph, this.config.rootNodeId);
  }

  /**
   * Processes a user message and returns the result.
   * 
   * The main work flow:
   * 1. Build textual context from context tree (system_instruction)
   * 2. Get recent conversation history
   * 3. Send to model
   * 4. Parse response to extract node updates, link updates, and optional reply
   * 5. Apply updates to the graph
   * 6. Record the turn
   * 
   * @param userMessage - The user's input message
   * @returns The turn result with response and updates
   */
  async processTurn(userMessage: string): Promise<TurnResult> {
    // 1. Record user turn
    const userTurn = this.history.addTurn('user', userMessage);

    // 2. Build context
    const systemInstruction = this.getSystemInstruction();
    const recentTurns = this.history.getRecentTurnsForModel(this.recentTurnsCount);

    // 3. Call model
    const result = await this.modelProvider.generate({
      systemInstruction,
      input: recentTurns,
      previousInteractionId: this.history.getLastInteractionId() || undefined,
      generationConfig: this.config.generationConfig,
    });

    // 4. Parse the response
    const parsed = this.parseResponse(result.text);

    // 5. Apply updates to graph
    this.applyNodeUpdates(parsed.nodeUpdates);

    // 6. Record model turn with links
    const modelTurn = this.history.addTurn(
      'model',
      parsed.response || '',
      parsed.linkUpdates.map(u => u.nodeId),
      result.interactionId
    );

    return {
      response: parsed.response,
      nodeUpdates: parsed.nodeUpdates,
      linkUpdates: parsed.linkUpdates,
      turn: modelTurn,
    };
  }

  /**
   * Processes a user message with streaming.
   * 
   * @param userMessage - The user message
   * @yields Text chunks as they arrive
   */
  async *processTurnStream(userMessage: string): AsyncIterable<string> {
    // 1. Record user turn
    const userTurn = this.history.addTurn('user', userMessage);

    // 2. Build context
    const systemInstruction = this.getSystemInstruction();
    const recentTurns = this.history.getRecentTurnsForModel(this.recentTurnsCount);

    // 3. Call model stream (fallback to generate if not supported)
    if (!this.modelProvider.generateStream) {
      console.warn('ModelProvider does not support streaming, falling back to non-streaming');
      const result = await this.processTurn(userMessage);
      yield result.response || '';
      return;
    }

    const stream = this.modelProvider.generateStream({
      systemInstruction,
      input: recentTurns,
      previousInteractionId: this.history.getLastInteractionId() || undefined,
      generationConfig: this.config.generationConfig,
    });

    let fullText = '';
    let interactionId = '';
    let usage: any;

    for await (const chunk of stream) {
      if (chunk.type === 'text') {
        fullText += chunk.text;
        yield chunk.text;
      } else if (chunk.type === 'interaction_id') {
        interactionId = chunk.interactionId;
      } else if (chunk.type === 'usage') {
        usage = chunk.usage;
      }
    }

    // 4. Parse the FINAL response
    const parsed = this.parseResponse(fullText);

    // 5. Apply updates to graph
    this.applyNodeUpdates(parsed.nodeUpdates);

    // 6. Record model turn with links
    this.history.addTurn(
      'model',
      parsed.response || '',
      parsed.linkUpdates.map(u => u.nodeId),
      interactionId || this.history.getLastInteractionId() || undefined
    );

    // Note: Usage is currently not saved in Turn history but could be
  }

  /**
   * Parses the model's response to extract structured updates.
   * Override in subclasses for custom parsing logic.
   * 
   * @param responseText - Raw response from the model
   * @returns Parsed response with updates
   */
  protected abstract parseResponse(responseText: string): {
    response?: string;
    nodeUpdates: NodeUpdate[];
    linkUpdates: LinkUpdate[];
  };

  /**
   * Applies node updates to the graph.
   */
  protected applyNodeUpdates(updates: NodeUpdate[]): void {
    for (const update of updates) {
      const node = this.graph.get(update.nodeId);
      if (node) {
        if (update.newText !== undefined) {
          node.text = update.newText;
        }
        if (update.newChildren !== undefined) {
          node.children = update.newChildren;
        }
        if (update.newLinks !== undefined) {
          node.links = update.newLinks;
        }
        node.metadata.updatedAt = new Date();
      }
    }
  }

  /**
   * Gets the conversation history.
   */
  getHistory(): ConversationHistory {
    return this.history;
  }
}
