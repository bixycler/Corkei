/**
 * MainAgent - The main orchestrator agent for Corkei.
 * 
 * This is the primary agent that:
 * - Uses its root node text as the system instruction
 * - Handles node link updates and content modifications
 * - Serves as the entry point for user interactions
 * 
 * The response format is designed to allow the agent to:
 * 1. Update links in the current turn to related nodes
 * 2. Modify contents of related nodes
 * 3. Optionally respond to the user (can return "void")
 */

import type {
  ContextGraph,
  NodeId,
  NodeUpdate,
  LinkUpdate,
  ModelProvider,
  AgentConfig,
} from './types';
import { nodeId } from './types';
import { Agent } from './Agent';
import { ConversationHistory } from './Conversation';
import { parse } from 'best-effort-json-parser';

/**
 * MainAgent - The primary orchestrator agent.
 */
export class MainAgent extends Agent {
  constructor(
    config: AgentConfig,
    graph: ContextGraph,
    modelProvider: ModelProvider,
    history?: ConversationHistory
  ) {
    super(config, graph, modelProvider, history);
  }

  /**
   * Parses the model's response to extract structured updates.
   * 
   * Expected JSON format:
   * {
   *   "thought": "Thinking about this...",
   *   "response": "Response to user...",
   *   "links": ["node_id_1", "node_id_2"],
   *   "updates": [{"id": "node_id", "text": "New content..."}]
   * }
   */
  protected parseResponse(responseText: string): {
    thought?: string;
    response?: string;
    nodeUpdates: NodeUpdate[];
    linkUpdates: LinkUpdate[];
  } {
    const nodeUpdates: NodeUpdate[] = [];
    const linkUpdates: LinkUpdate[] = [];
    let response: string | undefined;
    let thought: string | undefined;

    if (!responseText.trim()) {
      return { thought, response, nodeUpdates, linkUpdates };
    }

    const jsonText = this.stripCodeFences(responseText);

    try {
      // Use best-effort-json-parser for streaming compatibility
      const parsed = parse(jsonText);

      // Extract thought
      if (parsed.thought) {
        thought = String(parsed.thought);
      }

      // Extract response
      if (parsed.response) {
        response = String(parsed.response);
      }

      // Extract links
      if (Array.isArray(parsed.links)) {
        for (const link of parsed.links) {
          if (link) {
            linkUpdates.push({ nodeId: nodeId(String(link)) });
          }
        }
      }

      // Extract node updates
      if (Array.isArray(parsed.updates)) {
        for (const update of parsed.updates) {
          if (update?.id && update?.text) {
            nodeUpdates.push({
              nodeId: nodeId(String(update.id)),
              newText: String(update.text),
            });
          }
        }
      }
    } catch (err) {
      // Fallback: treat entire text as response if JSON parsing fails
      console.warn('[MainAgent] Failed to parse JSON response, using as plain text:', err);
      response = jsonText;
    }

    return { thought, response, nodeUpdates, linkUpdates };
  }

  /**
   * Gets the expected output format description for the system instruction.
   */
  static getOutputFormatInstructions(): string {
    return `
## Output Format

Respond with a JSON object containing any combination of these fields:

\`\`\`json
{
  "thought": "Your reasoning and planning process",
  "response": "Your verbal response to the user",
  "links": ["node_id_1", "node_id_2"],
  "updates": [{"id": "node_id", "text": "New content..."}]
}
\`\`\`

Notes:
- All fields are optional. Only include what's needed
- \`thought\`: Your thinking process including reasoning, planning, and any other internal monologue (for your own consistency)
- \`response\`: Your response to the user
- \`links\`: Node IDs related to this turn
- \`updates\`: Node content updates with \`id\` and \`text\`
`.trim();
  }
}
