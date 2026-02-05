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

/**
 * Response format markers for parsing model output.
 * 
 * The model is expected to output in a structured format:
 * 
 * [LINKS]
 * node_id_1
 * node_id_2
 * 
 * [UPDATE:node_id]
 * New content for the node...
 * [/UPDATE]
 * 
 * [RESPONSE]
 * Optional response text to the user...
 */
const MARKERS = {
  LINKS_START: '[LINKS]',
  LINKS_END: '[/LINKS]',
  UPDATE_START: /\[UPDATE:([^\]]+)\]/,
  UPDATE_END: '[/UPDATE]',
  RESPONSE_START: '[RESPONSE]',
  RESPONSE_END: '[/RESPONSE]',
};

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
   * Expected format:
   * [LINKS]
   * node_id_1
   * node_id_2
   * [/LINKS]
   * 
   * [UPDATE:node_id]
   * New content...
   * [/UPDATE]
   * 
   * [RESPONSE]
   * Response to user...
   * [/RESPONSE]
   */
  protected parseResponse(responseText: string): {
    response?: string;
    nodeUpdates: NodeUpdate[];
    linkUpdates: LinkUpdate[];
  } {
    const nodeUpdates: NodeUpdate[] = [];
    const linkUpdates: LinkUpdate[] = [];
    let response: string | undefined;

    // Parse [LINKS] section
    const linksMatch = responseText.match(
      /\[LINKS\]([\s\S]*?)\[\/LINKS\]/
    );
    if (linksMatch) {
      const linkLines = linksMatch[1].trim().split('\n');
      for (const line of linkLines) {
        const trimmed = line.trim();
        if (trimmed) {
          linkUpdates.push({ nodeId: nodeId(trimmed) });
        }
      }
    }

    // Parse [UPDATE:node_id] sections
    const updateRegex = /\[UPDATE:([^\]]+)\]([\s\S]*?)\[\/UPDATE\]/g;
    let updateMatch;
    while ((updateMatch = updateRegex.exec(responseText)) !== null) {
      const id = updateMatch[1].trim();
      const content = updateMatch[2].trim();
      nodeUpdates.push({
        nodeId: nodeId(id),
        newText: content,
      });
    }

    // Parse [RESPONSE] section
    const responseMatch = responseText.match(
      /\[RESPONSE\]([\s\S]*?)\[\/RESPONSE\]/
    );
    if (responseMatch) {
      response = responseMatch[1].trim();
    } else {
      // If no structured response, check if there's plain text outside markers
      // that could be the response
      let plainText = responseText
        .replace(/\[LINKS\][\s\S]*?\[\/LINKS\]/g, '')
        .replace(/\[UPDATE:[^\]]+\][\s\S]*?\[\/UPDATE\]/g, '')
        .trim();

      if (plainText) {
        response = plainText;
      }
    }

    return { response, nodeUpdates, linkUpdates };
  }

  /**
   * Gets the expected output format description for the system instruction.
   * This can be appended to the root node text to guide the model.
   */
  static getOutputFormatInstructions(): string {
    return `
## Output Format

When responding, output **only** the sections defined **in the fenced code blocks** below.

### To link related nodes:

Output a \`[LINKS]\` section as shown in the fenced code block below.
\`\`\`
[LINKS]
node_id_1
node_id_2
[/LINKS]
\`\`\`

### To update a node's content:

Output an \`[UPDATE:node_id]\` section as shown in the fenced code block below.
\`\`\`
[UPDATE:node_id]
New markdown content for the node...
[/UPDATE]
\`\`\`

### To respond to the user (optional):

Output a \`[RESPONSE]\` section as shown in the fenced code block below.
\`\`\`
[RESPONSE]
Your response to the user...
[/RESPONSE]
\`\`\`

If you have no response for the user, omit the \`[RESPONSE]\` section.
`.trim();
  }
}
