/**
 * Agent - Base class for Corkei agents.
 * 
 * Each agent has a context tree (projected from a root node) and can
 * process conversation turns by sending context + history to the model.
 */

import {
  type ContextGraph,
  type NodeId,
  type TurnResult,
  type NodeUpdate,
  type LinkUpdate,
  type ModelProvider,
  type AgentConfig,
  type ModelStreamChunk,
  type GenerationConfig,
  type Turn,
  type ContentPart,
  type TextPart,
  type ThoughtPart,
  type ToolCallPart,
  nodeId,
  type TurnId,
  turnId,
} from './types';
import { generateTextualContext } from './ContextGraph';
import { ConversationHistory } from './Conversation';
import { parse } from 'best-effort-json-parser';

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
    console.debug('[Agent] Generating system instruction from graph:', this.graph);
    return generateTextualContext(this.graph, this.config.rootNodeId);
  }

  /**
   * Processes a user message and returns the result.
   * Handles tool call loops automatically.
   * 
   * @param userMessage - The user's input message
   * @returns The turn result with response and updates
   */
  async processTurn(userMessage: string): Promise<TurnResult> {
    // 0. Clean up previous empty turns (required for the API)
    this.history.removeEmptyTurns();

    // 1. Record user turn
    // Skip if empty, effectively a "continue" command
    if (userMessage.trim()) {
      this.history.addTurn('user', userMessage);
    }

    // 2. Build context
    const systemInstruction = this.getSystemInstruction();

    // 3. Create a placeholder model turn for waiting indicator
    const modelTurn = this.history.addTurn('model', []);
    const turnStartTime = Date.now();
    const displayParts: ContentPart[] = [];
    let lastResponse: string | undefined;

    try {
      let shouldContinue = true;
      let loopCount = 0;

      while (shouldContinue && loopCount < 5) {
        // 4. Call model
        const recentTurns = this.history.getRecentTurnsForModel(this.config.maxRecentTurns || 100);
        const result = await this.modelProvider.generate({
          systemInstruction,
          input: recentTurns,
          generationConfig: this.config.generationConfig,
        });

        // 5. Parse the response
        const fullText = result.parts
          .filter(p => p.type === 'text')
          .map(p => p.content)
          .join('');
        const parsed = this.parseResponse(fullText);

        // 6. Process parts
        const toolCalsToExecute: ToolCallPart[] = [];
        let hasNewNativeToolCalls = false;

        for (const p of result.parts) {
          if (p.type === 'text') {
            const { thought, response } = this.extractThoughtAndResponse(p.content);
            if (thought !== undefined) displayParts.push({ type: 'thought', content: thought, durationMs: p.durationMs, metadata: p.metadata });
            if (response !== undefined) {
              displayParts.push({ type: 'text', content: response, durationMs: p.durationMs, metadata: p.metadata });
              lastResponse = response;
            }

            if (thought === undefined && response === undefined) {
              displayParts.push(p);
            }
          } else if (p.type === 'tool_call') {
            displayParts.push(p);
            hasNewNativeToolCalls = true;
            if (p.toolCall.name === 'updateNodeText') {
              toolCalsToExecute.push(p);
            }
          } else {
            displayParts.push(p);
          }
        }

        // Execute native tool calls
        for (const part of toolCalsToExecute) {
          const update = {
            nodeId: nodeId(String(part.toolCall.args.id)),
            newText: String(part.toolCall.args.text)
          };
          const [resultMsg] = this.applyNodeUpdates([update]);
          displayParts.push({
            type: 'tool_result',
            toolCallId: part.toolCall.id,
            result: resultMsg
          });
        }

        // Apply updates from JSON (legacy/fallback)
        if (parsed.nodeUpdates.length > 0) {
          const updateResults = this.applyNodeUpdates(parsed.nodeUpdates);
          this.injectToolParts(displayParts, parsed.nodeUpdates, updateResults);
          // Legacy updates don't trigger automatic continuation in the same way native tools do
        }

        // Update history for next iteration
        this.history.updateTurnParts(modelTurn.id, displayParts);
        if (result.metadata) {
          this.history.updateTurnMetadata(modelTurn.id, result.metadata);
        }
        this.history.updateTurnLinks(modelTurn.id, parsed.linkUpdates.map(u => u.nodeId));

        // Only continue if we had native tool calls and no final verbal response yet
        shouldContinue = hasNewNativeToolCalls && !lastResponse;
        loopCount++;
      }

      this.history.updateTurnStreaming(modelTurn.id, false);
      this.history.updateTurnResponseTime(modelTurn.id, Date.now() - turnStartTime);
      this.history.updateTurnTimestamp(modelTurn.id, new Date());
      this.history.saveHistory();

      return {
        response: lastResponse || '',
        nodeUpdates: [], // Already applied
        linkUpdates: [], // Already applied
        turn: modelTurn,
      };
    } catch (err) {
      console.error('[Agent] Model turn failed:', err);
      this.history.updateTurnStreaming(modelTurn.id, false);
      this.history.removeEmptyTurns();
      throw err;
    }
  }

  /**
   * Processes a user message with streaming.
   */
  processTurnStream(userMessage: string): AsyncIterable<{ type: 'text' | 'thought', content: string }> {
    this.history.removeEmptyTurns();
    if (userMessage.trim()) {
      this.history.addTurn('user', userMessage);
    }
    return this._processTurnStreamInner(userMessage);
  }

  /**
   * Internal implementation of the streaming process with tool loop.
   */
  private async * _processTurnStreamInner(userMessage: string): AsyncIterable<{ type: 'text' | 'thought', content: string }> {
    const systemInstruction = this.getSystemInstruction();
    const modelTurn = this.history.addTurn('model', []);
    const turnStartTime = Date.now();
    const parts: ContentPart[] = [];
    let currentPartIndex = -1;
    let loopCount = 0;
    let shouldContinue = true;

    try {
      while (shouldContinue && loopCount < 5) {
        let hasNewNativeToolCalls = false;
        let lastVerbalResponse: string | undefined;

        const recentTurns = this.history.getRecentTurnsForModel(this.config.maxRecentTurns || 100);

        if (!this.modelProvider.generateStream) {
          // Non-streaming fallback... (omitted for brevity, or implement inline)
          const result = await this.modelProvider.generate({ systemInstruction, input: recentTurns, generationConfig: this.config.generationConfig });
          // ... (simplified handle result)
          for (const p of result.parts) {
            parts.push(p);
            if (p.type === 'tool_call') hasNewNativeToolCalls = true;
            if (p.type === 'text') lastVerbalResponse = p.content;
          }
        } else {
          const stream = this.modelProvider.generateStream({
            systemInstruction,
            input: recentTurns,
            generationConfig: this.config.generationConfig,
          });

          let firstTokenTime: number | null = null;
          let partStartTime = Date.now();

          for await (const chunk of stream) {
            if (chunk.type === 'text' || chunk.type === 'thought') {
              const now = Date.now();
              if (firstTokenTime === null) {
                firstTokenTime = now;
                this.history.updateTurnFirstTokenTimestamp(modelTurn.id, new Date(firstTokenTime));
              }

              if (currentPartIndex === -1 || parts[currentPartIndex].type !== chunk.type) {
                partStartTime = now;
                parts.push({ type: chunk.type, content: chunk.text, durationMs: 0, metadata: chunk.metadata } as any);
                currentPartIndex = parts.length - 1;
              } else {
                const p = parts[currentPartIndex] as TextPart | ThoughtPart;
                p.content += chunk.text;
                p.durationMs = now - partStartTime;
                if (chunk.metadata) p.metadata = { ...(p.metadata || {}), ...chunk.metadata };
              }

              if (chunk.metadata?.thoughtSignature) {
                this.history.updateTurnMetadata(modelTurn.id, { ...((modelTurn.metadata as any) || {}), thoughtSignature: chunk.metadata.thoughtSignature });
              }

              // Update history parts for UI
              this.updateDisplayParts(modelTurn.id, parts);
              yield { type: chunk.type, content: chunk.text };
            } else if (chunk.type === 'tool_call') {
              parts.push({ type: 'tool_call', toolCall: chunk.toolCall, metadata: chunk.metadata });
              currentPartIndex = parts.length - 1;
              hasNewNativeToolCalls = true;
              this.updateDisplayParts(modelTurn.id, parts);
            }
          }
        }

        // Execute tool calls found in the current output
        const toolCalls = parts.filter(p => p.type === 'tool_call' && !parts.some(r => r.type === 'tool_result' && r.toolCallId === p.toolCall.id)) as ToolCallPart[];
        for (const call of toolCalls) {
          if (call.toolCall.name === 'updateNodeText') {
            const update = { nodeId: nodeId(String(call.toolCall.args.id)), newText: String(call.toolCall.args.text) };
            const [resultMsg] = this.applyNodeUpdates([update]);
            parts.push({ type: 'tool_result', toolCallId: call.toolCall.id, result: resultMsg });
          }
        }

        // Final parse of this iteration
        const fullText = parts.filter(p => p.type === 'text').map(p => p.content).join('');
        const parsed = this.parseResponse(fullText);
        if (parsed.response) lastVerbalResponse = parsed.response;

        if (parsed.nodeUpdates.length > 0) {
          const results = this.applyNodeUpdates(parsed.nodeUpdates);
          this.injectToolParts(parts, parsed.nodeUpdates, results);
        }

        this.history.updateTurnParts(modelTurn.id, parts);
        this.history.updateTurnLinks(modelTurn.id, parsed.linkUpdates.map(u => u.nodeId));

        shouldContinue = hasNewNativeToolCalls && !lastVerbalResponse;
        loopCount++;
        currentPartIndex = -1; // Reset for next iteration if continuing
      }

      this.history.updateTurnStreaming(modelTurn.id, false);
      this.history.updateTurnResponseTime(modelTurn.id, Date.now() - turnStartTime);
      this.history.updateTurnTimestamp(modelTurn.id, new Date());
      this.history.saveHistory();
    } catch (err) {
      console.error('[Agent] Model turn failed:', err);
      this.history.updateTurnStreaming(modelTurn.id, false);
      this.history.removeEmptyTurns();
      throw err;
    }
  }

  /**
   * Helper to update display parts in history while keeping thought extraction alive.
   */
  private updateDisplayParts(turnId: TurnId, parts: ContentPart[]) {
    const displayParts: ContentPart[] = [];
    for (const p of parts) {
      if (p.type === 'text') {
        const { thought, response } = this.extractThoughtAndResponse(p.content);
        if (thought !== undefined) displayParts.push({ type: 'thought', content: thought, durationMs: p.durationMs, metadata: p.metadata });
        if (response !== undefined) displayParts.push({ type: 'text', content: response, durationMs: p.durationMs, metadata: p.metadata });
        if (thought === undefined && response === undefined) displayParts.push(p);
      } else {
        displayParts.push(p);
      }
    }
    this.history.updateTurnParts(turnId, displayParts);
  }

  protected abstract parseResponse(responseText: string): {
    thought?: string;
    response?: string;
    nodeUpdates: NodeUpdate[];
    linkUpdates: LinkUpdate[];
  };

  protected injectToolParts(parts: ContentPart[], updates: NodeUpdate[], results: string[]): void {
    updates.forEach((update, index) => {
      const callId = `update_${Date.now()}_${index}`;
      parts.push({
        type: 'tool_call',
        toolCall: { id: callId, name: 'updateNodeText', args: { id: update.nodeId, text: update.newText } }
      });
      parts.push({ type: 'tool_result', toolCallId: callId, result: results[index] });
    });
  }

  protected applyNodeUpdates(updates: NodeUpdate[]): string[] {
    return updates.map(update => {
      const node = this.graph.get(update.nodeId);
      if (!node) return `Error: Node "${update.nodeId}" not found`;
      let changed = false;
      if (update.newText !== undefined) { node.text = update.newText; changed = true; }
      if (update.newChildren !== undefined) { node.children = update.newChildren; changed = true; }
      if (update.newLinks !== undefined) { node.links = update.newLinks; changed = true; }
      if (changed) {
        node.metadata.updatedAt = new Date();
        return `Successfully updated node "${update.nodeId}"`;
      }
      return `No changes needed for node "${update.nodeId}"`;
    });
  }

  protected extractThoughtAndResponse(text: string): { thought?: string; response?: string } {
    if (!text.trim()) return {};
    let jsonText = this.stripCodeFences(text);
    try {
      const parsed = parse(jsonText);
      if (typeof parsed !== 'object' || parsed === null) return { response: text };
      return {
        thought: 'thought' in parsed ? String(parsed.thought) : undefined,
        response: 'response' in parsed ? String(parsed.response) : undefined,
      };
    } catch {
      return { response: text };
    }
  }

  protected stripCodeFences(text: string): string {
    const cleaned = text.trim();
    const match = cleaned.match(/```(?:[a-z]*)\s*([\s\S]*?)(?:```|$)/i);
    if (match) return match[1].trim();
    return cleaned;
  }

  public getHistory(): ConversationHistory {
    return this.history;
  }
}
