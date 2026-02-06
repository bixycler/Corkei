/**
 * Conversation - Manages conversation history as a linked list of turns.
 * 
 * The conversation history is stored as a chain (linked list) where each turn
 * links to its previous turn. Only the recent portion is fetched to the AI model.
 */

import { createStore, produce } from 'solid-js/store';
import {
  type Turn,
  type TurnId,
  type TurnRole,
  type NodeId,
  type ModelTurn,
  type ContentPart,
  turnId,
} from './types';

/**
 * Generates a unique turn ID.
 */
function generateTurnId(): TurnId {
  return turnId(`turn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
}

/**
 * Manages conversation history as a chain of turns.
 * Uses SolidJS Store for reactivity.
 */
export class ConversationHistory {
  /** Internal state managed by Solid Store */
  private state: {
    turns: Record<string, Turn>;
    latestTurnId: TurnId | null;
  };
  private setState: any;

  constructor() {
    const [state, setState] = createStore({
      turns: {} as Record<string, Turn>,
      latestTurnId: null as TurnId | null,
    });
    this.state = state;
    this.setState = setState;

    // Load from storage
    this.loadFromStorage();
  }

  /** Loads history from localStorage */
  private loadFromStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
      const data = localStorage.getItem('corkei_history');
      if (data) {
        const parsed = JSON.parse(data);
        const hydratedTurns: Record<string, Turn> = {};
        for (const [id, turn] of Object.entries(parsed.turns)) {
          hydratedTurns[id] = {
            ...(turn as any),
            timestamp: new Date((turn as any).timestamp),
            firstTokenTimestamp: (turn as any).firstTokenTimestamp ? new Date((turn as any).firstTokenTimestamp) : undefined,
          };
        }
        this.setState({
          turns: hydratedTurns,
          latestTurnId: parsed.latestTurnId,
        });
      }
    } catch (err) {
      console.warn('[ConversationHistory] Failed to load from storage:', err);
    }
  }

  /** Saves history to localStorage */
  private saveToStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem('corkei_history', JSON.stringify({
        turns: this.state.turns,
        latestTurnId: this.state.latestTurnId,
      }));
    } catch (err) {
      console.warn('[ConversationHistory] Failed to save to storage:', err);
    }
  }

  /**
   * Adds a new turn to the conversation.
   * 
   * @param role - 'user' or 'model'
   * @param contentOrParts - The message content as string or parts
   * @param relatedNodes - Links to related context nodes
   * @returns The created turn
   */
  addTurn(
    role: TurnRole,
    contentOrParts: string | ContentPart[],
    relatedNodes: NodeId[] = []
  ): Turn {
    const parts: ContentPart[] = typeof contentOrParts === 'string'
      ? [{ type: 'text', content: contentOrParts }]
      : contentOrParts;

    const turn: Turn = {
      id: generateTurnId(),
      role,
      parts,
      timestamp: new Date(),
      previousTurnId: this.state.latestTurnId,
      relatedNodes,
      isStreaming: role === 'model', // Default model turns to streaming until finalized
    };

    this.setState(produce((s: any) => {
      s.turns[turn.id] = turn;
      s.latestTurnId = turn.id;
    }));

    this.saveToStorage();
    return turn;
  }

  /**
   * Gets the most recent N turns for the AI model.
   * This is a reactive read from the store.
   * 
   * @param n - Number of recent turns to fetch
   * @returns Array of turns, oldest first
   */
  getRecentTurns(n: number): Turn[] {
    const result: Turn[] = [];
    let currentId = this.state.latestTurnId;

    // Walk backwards through the chain
    while (currentId && result.length < n) {
      const turn = this.state.turns[currentId as string];
      if (!turn) break;
      result.unshift(turn); // Add to front to maintain order
      currentId = turn.previousTurnId;
    }

    return result;
  }

  /**
   * Gets recent turns formatted for the model input.
   * 
   * @param n - Number of recent turns to fetch
   * @returns Array of ModelTurn objects
   */
  getRecentTurnsForModel(n: number): ModelTurn[] {
    return this.getRecentTurns(n).map(turn => ({
      role: turn.role,
      parts: turn.parts,
      metadata: turn.metadata,
    }));
  }

  /**
   * Gets the total number of turns.
   */
  get length(): number {
    return Object.keys(this.state.turns).length;
  }

  /**
   * Gets a turn by its ID.
   */
  getTurn(id: TurnId): Turn | undefined {
    return this.state.turns[id as string];
  }

  /**
   * Updates the related nodes for a turn.
   * This is called by the agent after processing the model output.
   */
  updateTurnLinks(id: TurnId, relatedNodes: NodeId[]): void {
    this.setState('turns', id as string, 'relatedNodes', relatedNodes);
    this.saveToStorage();
  }

  /**
   * Gets the ID of the latest turn in the conversation.
   */
  getLatestTurnId(): TurnId | null {
    return this.state.latestTurnId;
  }

  /**
   * Resets the conversation history.
   */
  clear(): void {
    this.setState({
      turns: {},
      latestTurnId: null,
    });
    this.saveToStorage();
  }

  /**
   * Updates the streaming status for a turn.
   */
  updateTurnStreaming(id: TurnId, isStreaming: boolean): void {
    this.setState('turns', id as string, 'isStreaming', isStreaming);
  }

  /**
   * Updates the first token timestamp for a turn.
   */
  updateTurnFirstTokenTimestamp(id: TurnId, timestamp: Date): void {
    this.setState('turns', id as string, 'firstTokenTimestamp', timestamp);
  }

  /**
   * Updates the main timestamp for a turn.
   */
  updateTurnTimestamp(id: TurnId, timestamp: Date): void {
    this.setState('turns', id as string, 'timestamp', timestamp);
  }

  /**
   * Updates the response time for a turn.
   */
  updateTurnResponseTime(id: TurnId, responseTime: number): void {
    this.setState('turns', id as string, 'responseTime', responseTime);
  }

  /**
   * Updates the parts for a turn.
   * Used for reactive updates during streaming.
   */
  updateTurnParts(id: TurnId, parts: ContentPart[]): void {
    this.setState('turns', id as string, 'parts', parts);
  }

  /**
   * Updates model-specific metadata for a turn.
   */
  updateTurnMetadata(id: TurnId, metadata: any): void {
    this.setState('turns', id as string, 'metadata', metadata);
  }

  /** Explicitly save to storage */
  saveHistory() {
    this.saveToStorage();
  }

  /**
   * Serializes the conversation history to a JSON-compatible object.
   */
  serialize(): object {
    return {
      turns: Object.values(this.state.turns),
      latestTurnId: this.state.latestTurnId,
    };
  }

  /**
   * Deserializes conversation history from a JSON object.
   */
  static deserialize(data: {
    turns: Turn[];
    latestTurnId: TurnId | null;
  }): ConversationHistory {
    const history = new ConversationHistory();
    for (const turnData of data.turns) {
      const turn: Turn = {
        ...turnData,
        id: turnId(turnData.id as string),
        timestamp: new Date(turnData.timestamp),
        previousTurnId: turnData.previousTurnId
          ? turnId(turnData.previousTurnId as string)
          : null,
      };
      history.setState('turns', turn.id as string, turn);
    }
    history.setState('latestTurnId', data.latestTurnId
      ? turnId(data.latestTurnId as string)
      : null);
    return history;
  }
}
