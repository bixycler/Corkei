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
  GenerationConfig,
  Turn,
  ContentPart,
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

  /** Gets the agent configuration */
  public getConfig(): AgentConfig {
    return this.config;
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
    // 1. Record user turn (skip if empty, effectively a "continue" command)
    const isContinue = !userMessage.trim();
    if (!isContinue) {
      this.history.addTurn('user', userMessage);
    }

    // 2. Build context
    const systemInstruction = this.getSystemInstruction();
    const recentTurns = this.history.getRecentTurnsForModel(this.config.maxRecentTurns || 100);

    // 3. Create a placeholder model turn for waiting indicator
    const modelTurn = this.history.addTurn('model', []);
    const turnStartTime = Date.now();

    // 4. Call model
    const result = await this.modelProvider.generate({
      systemInstruction,
      input: recentTurns,
      generationConfig: this.config.generationConfig,
    });

    // 5. Parse the response
    // Concatenate all text parts for parsing structured updates
    const fullText = result.parts
      .filter(p => p.type === 'text')
      .map(p => p.content)
      .join('');
    const parsed = this.parseResponse(fullText);

    // 6. Apply updates to graph
    this.applyNodeUpdates(parsed.nodeUpdates);

    // 7. Update model turn with real parts (preserving order, splitting thoughts, and stripping tags)
    const rawCleanParts: ContentPart[] = result.parts.map(p => ({
      ...p,
      content: p.type === 'text' ? this.stripTags(p.content) : p.content,
      metadata: p.metadata,
    }));
    const cleanParts = this.splitThoughtParts(rawCleanParts);

    this.history.updateTurnParts(modelTurn.id, cleanParts);
    if (result.metadata) {
      this.history.updateTurnMetadata(modelTurn.id, result.metadata);
    }
    this.history.updateTurnLinks(modelTurn.id, parsed.linkUpdates.map(u => u.nodeId));
    this.history.updateTurnStreaming(modelTurn.id, false);
    this.history.updateTurnResponseTime(modelTurn.id, Date.now() - turnStartTime);
    this.history.updateTurnTimestamp(modelTurn.id, new Date());
    this.history.saveHistory();

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
   * @returns An async iterable of structured chunks
   */
  processTurnStream(userMessage: string): AsyncIterable<{ type: 'text' | 'thought', content: string }> {
    // 1. Record user turn IMMEDIATELY (sync)
    // Skip if empty, effectively a "continue" command
    if (userMessage.trim()) {
      this.history.addTurn('user', userMessage);
    }

    // Return the generator that will handle the model interaction
    return this._processTurnStreamInner(userMessage);
  }

  /**
   * Internal implementation of the streaming process.
   */
  private async *_processTurnStreamInner(userMessage: string): AsyncIterable<{ type: 'text' | 'thought', content: string }> {
    // 2. Build context
    const systemInstruction = this.getSystemInstruction();
    const recentTurns = this.history.getRecentTurnsForModel(this.config.maxRecentTurns || 100);

    // 3. Create a placeholder turn IMMEDIATELY for waiting indicator
    const modelTurn = this.history.addTurn('model', []);
    const turnStartTime = Date.now();

    // 3. Call model stream (fallback to generate if not supported)
    if (!this.modelProvider.generateStream) {
      console.warn('ModelProvider does not support streaming, falling back to non-streaming');
      const result = await this.modelProvider.generate({
        systemInstruction,
        input: recentTurns,
        generationConfig: this.config.generationConfig,
      });
      // Building parts... handled by generate result directly
      const fullText = result.parts.filter(p => p.type === 'text').map(p => p.content).join('');
      const parsed = this.parseResponse(fullText);
      this.applyNodeUpdates(parsed.nodeUpdates);

      // Clean parts for history (splitting thoughts and stripping tags)
      const rawCleanParts = result.parts.map(p => ({
        ...p,
        content: p.type === 'text' ? this.stripTags(p.content) : p.content,
        metadata: p.metadata
      }));
      const cleanParts = this.splitThoughtParts(rawCleanParts);

      // 6. Update model turn with real parts
      this.history.updateTurnParts(modelTurn.id, cleanParts);
      this.history.updateTurnLinks(modelTurn.id, parsed.linkUpdates.map(u => u.nodeId));
      this.history.updateTurnStreaming(modelTurn.id, false);
      this.history.updateTurnResponseTime(modelTurn.id, Date.now() - turnStartTime);
      this.history.updateTurnTimestamp(modelTurn.id, new Date());
      yield { type: 'text', content: this.stripTags(parsed.response || '') };
      return;
    }

    const stream = this.modelProvider.generateStream({
      systemInstruction,
      input: recentTurns,
      generationConfig: this.config.generationConfig,
    });

    const parts: ContentPart[] = [];
    let currentPartIndex = -1;
    let firstTokenTime: number | null = null;
    let partStartTime: number = 0;

    for await (const chunk of stream) {
      if (chunk.type === 'text' || chunk.type === 'thought') {
        const now = Date.now();

        // Mark first token time
        if (firstTokenTime === null) {
          firstTokenTime = now;
          this.history.updateTurnFirstTokenTimestamp(modelTurn.id, new Date(firstTokenTime));
        }

        const chunkType = chunk.type;
        const chunkText = chunk.text;

        // Build parts list in order
        if (currentPartIndex === -1 || parts[currentPartIndex].type !== chunkType) {
          // Start a new part
          partStartTime = now;
          const newPart: ContentPart = {
            type: chunkType,
            content: chunkText,
            durationMs: 0, // Start at 0
            metadata: chunk.metadata,
          };
          parts.push(newPart);
          currentPartIndex = parts.length - 1;
        } else {
          // Append to existing part
          parts[currentPartIndex].content += chunkText;
          // Update duration of current part
          parts[currentPartIndex].durationMs = now - partStartTime;

          // Update metadata if it arrived in a later chunk (specifically for thoughtSignature)
          if (chunk.metadata) {
            parts[currentPartIndex].metadata = {
              ...(parts[currentPartIndex].metadata || {}),
              ...chunk.metadata
            };
          }
        }

        // Also sync to turn-level metadata for things like thoughtSignature that apply to the whole turn
        if (chunk.metadata?.thoughtSignature) {
          this.history.updateTurnMetadata(modelTurn.id, {
            ...((modelTurn.metadata as any) || {}),
            thoughtSignature: chunk.metadata.thoughtSignature
          });
        }

        // Push a DEEP CLONE with tags stripped to force Solid reactivity for nested properties
        // We also split thoughts here to ensure they fold correctly during streaming
        const rawCleanParts = parts.map(p => ({
          ...p,
          content: p.type === 'text' ? this.stripTags(p.content) : p.content
        }));
        this.history.updateTurnParts(modelTurn.id, this.splitThoughtParts(rawCleanParts));

        yield { type: chunkType, content: chunkText };
      }
    }

    // 5. Parse the FINAL answer for graph updates
    const fullText = parts
      .filter(p => p.type === 'text')
      .map(p => p.content)
      .join('');
    const parsed = this.parseResponse(fullText);

    // 6. Apply updates to graph
    this.applyNodeUpdates(parsed.nodeUpdates);

    // 7. Finalize turn links and save history
    this.history.updateTurnLinks(modelTurn.id, parsed.linkUpdates.map(u => u.nodeId));

    // Update parts one last time with FULL cleanup now that streaming is DONE
    const rawFinalParts = parts.map(p => ({
      ...p,
      content: p.type === 'text' ? this.stripTags(p.content) : p.content
    }));
    this.history.updateTurnParts(modelTurn.id, this.splitThoughtParts(rawFinalParts));

    this.history.updateTurnStreaming(modelTurn.id, false);
    this.history.updateTurnResponseTime(modelTurn.id, Date.now() - turnStartTime);
    this.history.saveHistory();
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
   * Strips internal markers like <response> and <links> from the text.
   * This is used for the user-facing history while keeping raw text for context.
   */
  protected stripTags(text: string): string {
    return text
      .replace(/<response>/g, '')
      .replace(/<\/response>/g, '')
      // Remove <links> block entirely as it is parsed into metadata
      .replace(/<links>[\s\S]*?<\/links>/g, '')
      .replace(/<links>/g, '')
      .replace(/<\/links>/g, '')
      .trim();
  }

  /**
   * Splits text parts containing <think>...</think> tags into separate ThoughtParts.
   * Handles both completed tags and open tags at the end of the string (for streaming).
   */
  protected splitThoughtParts(parts: ContentPart[]): ContentPart[] {
    const result: ContentPart[] = [];
    for (const part of parts) {
      if (part.type === 'text') {
        const regex = /<think>([\s\S]*?)(?:<\/think>|$)/g;
        let lastIndex = 0;
        let match;
        let found = false;

        while ((match = regex.exec(part.content)) !== null) {
          found = true;
          const before = part.content.slice(lastIndex, match.index);
          if (before.trim()) {
            result.push({ type: 'text', content: before.trim(), metadata: part.metadata });
          }

          const thoughtContent = match[1].trim();
          if (thoughtContent || !match[0].endsWith('</think>')) {
            result.push({ type: 'thought', content: thoughtContent, metadata: part.metadata });
          }

          lastIndex = regex.lastIndex;
          // If the tag was not closed, it means the rest of the string is the thought
          if (!match[0].endsWith('</think>')) {
            break;
          }
        }

        if (!found) {
          result.push(part);
        } else {
          const after = part.content.slice(lastIndex);
          if (after.trim()) {
            result.push({ type: 'text', content: after.trim(), metadata: part.metadata });
          }
        }
      } else {
        result.push(part);
      }
    }
    return result;
  }

  /**
   * Gets the conversation history.
   */
  getHistory(): ConversationHistory {
    return this.history;
  }
}
