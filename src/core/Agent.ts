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
  nodeId,
  type TurnId,
  turnId,
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
      this.history.addTurn('human', userMessage);
    }

    // 2. Build context
    const systemInstruction = this.getSystemInstruction();
    // 3. Create a placeholder model turn for waiting indicator
    const modelTurn = this.history.addTurn('self', []);
    const turnStartTime = Date.now();
    try {
      const allAccumulatedParts: ContentPart[] = [];
      let lastResponse = '';
      let shouldContinue = true;

      while (shouldContinue) {
        // 2. Build context
        const systemInstruction = this.getSystemInstruction();
        const input = this.history.getRecentTurnsForModel(this.config.maxRecentTurns || 100);

        // 4. Call model
        const result = await this.modelProvider.generate({
          systemInstruction,
          input,
          generationConfig: this.config.generationConfig,
        });

        // 5. Parse actor response
        const fullText = result.parts
          .filter(p => p.type === 'text')
          .map(p => p.content)
          .join('');
        const parsed = this.parseResponse(fullText);

        // shouldContinue if we have any graph action payload
        const hasGraphActions = !!parsed.graphActionPayload;

        // 6. Accumulate parts for turn
        if (parsed.thought) {
          allAccumulatedParts.push({ type: 'thought', content: parsed.thought });
        }
        if (parsed.response) {
          allAccumulatedParts.push({ type: 'text', content: parsed.response });
          lastResponse = parsed.response;
        } else if (!parsed.thought && fullText.trim() && !hasGraphActions) {
          // Fallback for unexpected content only if no actions were found
          allAccumulatedParts.push({ type: 'text', content: fullText });
          lastResponse = fullText;
        }

        // Update model turn with accumulated parts
        this.history.updateTurnParts(modelTurn.id, [...allAccumulatedParts]);
        if (result.metadata) {
          this.history.updateTurnMetadata(modelTurn.id, result.metadata);
        }

        if (hasGraphActions) {
          const results = this.executeGraphActions(parsed.graphActionPayload);
          if (results.length > 0) {
            this.history.addTurn('system', results.join('\n') + '\n\nNew content reloaded in System Instructions.');
          }
        }

        shouldContinue = hasGraphActions;
      }

      this.history.updateTurnStreaming(modelTurn.id, false);
      this.history.updateTurnResponseTime(modelTurn.id, Date.now() - turnStartTime);
      this.history.updateTurnTimestamp(modelTurn.id, new Date());
      this.history.saveHistory();

      return {
        response: lastResponse || '',
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
      this.history.addTurn('human', userMessage);
    }
    return this._processTurnStreamInner(userMessage);
  }

  /**
   * Internal implementation of the streaming process with tool loop.
   */
  private async * _processTurnStreamInner(userMessage: string): AsyncIterable<{ type: 'text' | 'thought', content: string }> {
    const systemInstruction = this.getSystemInstruction();
    const modelTurn = this.history.addTurn('self', []);
    const turnStartTime = Date.now();
    const parts: ContentPart[] = [];
    let currentPartIndex = -1;
    let shouldContinue = true;
    const allIterationParts: ContentPart[] = [];

    try {
      let retryCount = 0;
      const maxRetries = 3;

      while (shouldContinue) {
        let lastVerbalResponse: string | undefined;
        let iterationParts: ContentPart[] = [];
        let innerPartIndex = -1;
        let accumulatedText = '';
        let formatError: string | null = null;

        const abortController = new AbortController();
        const recentTurns = this.history.getRecentTurnsForModel(this.config.maxRecentTurns || 100);

        const stream = this.modelProvider.generateStream({
          systemInstruction,
          input: recentTurns,
          generationConfig: this.config.generationConfig,
          abortSignal: abortController.signal,
        });

        let firstTokenTime: number | null = null;
        let partStartTime = Date.now();

        try {
          for await (const chunk of stream) {
            if (chunk.type === 'text' || chunk.type === 'thought') {
              const now = Date.now();
              if (firstTokenTime === null) {
                firstTokenTime = now;
                this.history.updateTurnFirstTokenTimestamp(modelTurn.id, new Date(firstTokenTime));
              }

              if (innerPartIndex === -1 || iterationParts[innerPartIndex].type !== chunk.type) {
                partStartTime = now;
                iterationParts.push({ type: chunk.type, content: chunk.text, durationMs: 0, metadata: chunk.metadata } as any);
                innerPartIndex = iterationParts.length - 1;
              } else {
                const p = iterationParts[innerPartIndex] as any;
                p.content += chunk.text;
                p.durationMs = now - partStartTime;
                if (chunk.metadata) p.metadata = { ...(p.metadata || {}), ...chunk.metadata };
              }

              if (chunk.metadata?.thoughtSignature) {
                this.history.updateTurnMetadata(modelTurn.id, { ...((modelTurn.metadata as any) || {}), thoughtSignature: chunk.metadata.thoughtSignature });
              }

              // Real-time Format Validation
              accumulatedText += chunk.text;
              formatError = this.checkFormatting(accumulatedText);
              if (formatError) {
                console.warn('[Agent] Format violation detected. Aborting stream.', formatError);
                abortController.abort();
                break;
              }

              this.history.updateTurnParts(modelTurn.id, [...allIterationParts, ...iterationParts]);
              yield { type: chunk.type, content: chunk.text };
            }
          }
        } catch (err) {
          // If we have a formatError, it means we aborted on purpose.
          // We catch the error so we can proceed to the retry logic below.
          if (!formatError) {
            throw err;
          }
          console.debug('[Agent] Caught expected abortion error after format violation.');
        }

        // Final Format Validation (checks for unclosed tags)
        if (!formatError) {
          formatError = this.checkFormatting(accumulatedText, true);
          if (formatError) {
            console.warn('[Agent] Final format violation detected:', formatError);
            // No need to abort as stream is already done, but we trigger the retry loop
          }
        }

        if (formatError) {
          if (retryCount < maxRetries) {
            retryCount++;
            console.warn(`[Agent] Format violation detected. Retrying (${retryCount}/${maxRetries})... Error: ${formatError}`);

            this.history.addTurn('system', `FORMAT ERROR: ${formatError}

Your previous response FAILED the formatting check:
<pre>
${accumulatedText}
</pre>

CRITICAL RULES:
1. You MUST wrap ALL your output in <think>...</think> or <act>...</act> blocks.
2. NO text is allowed outside of <think>...</think> or <act>...</act> blocks.
3. To talk to the user, you MUST use <act type='response'>...</act>.

Please REWRITE your entire last response correctly now.`);

            this.history.updateTurnParts(modelTurn.id, [...allIterationParts]); // Revert to previous clean state
            continue; // Loop back for another attempt
          } else {
            // Hard fail after retries
            throw new Error(`Model persistent format violation: ${formatError}`);
          }
        }

        // Final processing for this iteration: Parse for tags/actions
        const fullIterationText = iterationParts.filter(p => p.type === 'text').map(p => p.content).join('');
        const parsed = this.parseResponse(fullIterationText);

        // shouldContinue if any graph action payload exists
        const hasGraphActions = !!parsed.graphActionPayload;

        // Create iteration fragments
        if (parsed.thought) {
          allIterationParts.push({ type: 'thought', content: parsed.thought });
        }
        if (parsed.response) {
          allIterationParts.push({ type: 'text', content: parsed.response });
          lastVerbalResponse = parsed.response;
        } else if (!parsed.thought && fullIterationText.trim() && !hasGraphActions) {
          allIterationParts.push({ type: 'text', content: fullIterationText });
        }

        this.history.updateTurnParts(modelTurn.id, [...allIterationParts]);

        if (hasGraphActions) {
          const results = this.executeGraphActions(parsed.graphActionPayload);
          if (results.length > 0) {
            this.history.addTurn('system', results.join('\n') + '\n\nNew content reloaded in System Instructions.');
          }
        }

        shouldContinue = hasGraphActions;
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

  public getHistory(): ConversationHistory {
    return this.history;
  }

  public abstract checkFormatting(text: string, isFinal?: boolean): string | null;

  protected abstract parseResponse(responseText: string): {
    thought?: string;
    response?: string;
    graphActionPayload?: any;
  };

  /**
   * Dispatches graph actions from the model's payload.
   */
  protected executeGraphActions(payload: any): string[] {
    const results: string[] = [];
    if (!payload) return results;

    // 1. Handle Node Updates (the "good old update JSON")
    if (Array.isArray(payload.updates)) {
      for (const update of payload.updates) {
        if (!update.id) continue;
        const id = nodeId(update.id);
        const node = this.graph.get(id);
        if (!node) {
          results.push(`Error: Node #${id} not found`);
          continue;
        }

        let changed = false;
        if (update.text !== undefined) { node.text = update.text; changed = true; }
        if (Array.isArray(update.children)) { node.children = update.children.map((c: any) => nodeId(String(c))); changed = true; }
        if (Array.isArray(update.links)) { node.links = update.links.map((l: any) => nodeId(String(l))); changed = true; }

        if (changed) {
          node.metadata.updatedAt = new Date();
          results.push(`Successfully updated node #${id}`);
        }
      }
    }

    // 2. Handle Read/Load (shortcuts)
    const readIds = Array.isArray(payload.read) ? payload.read : (Array.isArray(payload.load) ? payload.load : []);
    for (const rId of readIds) {
      const id = nodeId(String(rId));
      const node = this.graph.get(id);
      if (node) {
        const root = this.graph.get(this.config.rootNodeId);
        if (root && !root.children.includes(id)) {
          root.children.push(id);
          root.metadata.updatedAt = new Date();
          results.push(`Node #${id} successfully loaded into context`);
        } else {
          results.push(`Node #${id} is already in context`);
        }
      } else {
        results.push(`Error: Node #${id} not found for loading`);
      }
    }

    // 3. Handle Zoom
    if (Array.isArray(payload.zoom)) {
      for (const zId of payload.zoom) {
        const id = nodeId(String(zId));
        if (this.graph.has(id)) {
          this.config.rootNodeId = id;
          results.push(`Zoomed into node #${id}; context tree re-projected`);
        } else {
          results.push(`Error: Cannot zoom into #${id} (not found)`);
        }
      }
    }

    // 4. Handle Links (shortcuts)
    if (Array.isArray(payload.links)) {
      for (const lId of payload.links) {
        results.push(`Marked node #${lId} as relevant to discussion`);
      }
    }

    return results;
  }
}
