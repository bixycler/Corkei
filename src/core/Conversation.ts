/**
 * Conversation - Manages conversation history as a linked list of turns.
 * 
 * The conversation history is stored as a chain (linked list) where each turn
 * links to its previous turn. Only the recent portion is fetched to the AI model.
 */

import {
  type Turn,
  type TurnId,
  type TurnRole,
  type NodeId,
  type ModelTurn,
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
 */
export class ConversationHistory {
  /** Map of turn IDs to turns */
  private turns: Map<TurnId, Turn> = new Map();

  /** The most recent turn in the chain */
  private latestTurnId: TurnId | null = null;

  /**
   * Adds a new turn to the conversation.
   * 
   * @param role - 'user' or 'model'
   * @param content - The message content
   * @param relatedNodes - Links to related context nodes
   * @returns The created turn
   */
  addTurn(
    role: TurnRole,
    content: string,
    relatedNodes: NodeId[] = [],
    thoughts?: string
  ): Turn {
    const turn: Turn = {
      id: generateTurnId(),
      role,
      content,
      timestamp: new Date(),
      previousTurnId: this.latestTurnId,
      relatedNodes,
      thoughts,
    };

    this.turns.set(turn.id, turn);
    this.latestTurnId = turn.id;

    return turn;
  }

  /**
   * Gets the most recent N turns for the AI model.
   * 
   * @param n - Number of recent turns to fetch
   * @returns Array of turns, oldest first
   */
  getRecentTurns(n: number): Turn[] {
    const result: Turn[] = [];
    let currentId = this.latestTurnId;

    // Walk backwards through the chain
    while (currentId && result.length < n) {
      const turn = this.turns.get(currentId);
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
      content: turn.content,
    }));
  }

  /**
   * Gets the total number of turns.
   */
  get length(): number {
    return this.turns.size;
  }

  /**
   * Gets a turn by its ID.
   */
  getTurn(id: TurnId): Turn | undefined {
    return this.turns.get(id);
  }

  /**
   * Updates the related nodes for a turn.
   * This is called by the agent after processing the model output.
   */
  updateTurnLinks(id: TurnId, relatedNodes: NodeId[]): void {
    const turn = this.turns.get(id);
    if (turn) {
      turn.relatedNodes = relatedNodes;
    }
  }

  /**
   * Serializes the conversation history to a JSON-compatible object.
   */
  serialize(): object {
    const turns: Turn[] = [];
    for (const turn of this.turns.values()) {
      turns.push(turn);
    }
    return {
      turns,
      latestTurnId: this.latestTurnId,
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
      history.turns.set(turn.id, turn);
    }
    history.latestTurnId = data.latestTurnId
      ? turnId(data.latestTurnId as string)
      : null;
    return history;
  }
}
