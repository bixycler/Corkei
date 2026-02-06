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
 * <links>
 * node_id_1
 * node_id_2
 * 
 * [update:node_id]
 * New content for the node...
 * [/update]
 * 
 * [response]
 * Optional response text to the user...
 */
const MARKERS = {
  LINKS_START: '<links>',
  LINKS_END: '</links>',
  UPDATE_START: /<update id="([^\]]+)">/,
  UPDATE_END: '</update>',
  RESPONSE_START: '<response>',
  RESPONSE_END: '</response>',
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
   * <links>
   * node_id_1
   * node_id_2
   * </links>
   * 
   * <update id="node_id">
   * New content...
   * </update>
   * 
   * <response>
   * Response to user...
   * </response>
   */
  protected parseResponse(responseText: string): {
    response?: string;
    nodeUpdates: NodeUpdate[];
    linkUpdates: LinkUpdate[];
  } {
    const nodeUpdates: NodeUpdate[] = [];
    const linkUpdates: LinkUpdate[] = [];
    let response: string | undefined;

    // Parse <links> section
    const linksMatch = responseText.match(
      /<links>([\s\S]*?)<\/links>/
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

    // Parse [update:node_id] sections
    const updateRegex = /<update id="([^\]]+)">([\s\S]*?)<\/update>/g;
    let updateMatch;
    while ((updateMatch = updateRegex.exec(responseText)) !== null) {
      const id = updateMatch[1].trim();
      const content = updateMatch[2].trim();
      nodeUpdates.push({
        nodeId: nodeId(id),
        newText: content,
      });
    }

    // Parse [response] section
    const responseMatch = responseText.match(
      /<response>([\s\S]*?)<\/response>/
    );
    if (responseMatch) {
      response = responseMatch[1].trim();
    } else {
      // If no structured response, check if there's plain text outside markers
      // that could be the response
      let plainText = responseText
        .replace(/<links>[\s\S]*?<\/links>/g, '')
        .replace(/<update id="[^\]]+">[\s\S]*?<\/update>/g, '')
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

When responding, think carefully with \`<think>\`...\`</think>\` tags to reason and plan your response, then output **only** the sections defined **in the fenced code blocks** below (do not output the triple-backtick fences themselves).

### To think:

**Always think out loud** using \`<think>\` sections as shown in the fenced code block below. There can be multiple \`<think>\` sections interleaved with other sections.
\`\`\`
<think>
Your reasoning and planning process...
</think>
\`\`\`

### To link related nodes:

Output a \`<links>\` section as shown in the fenced code block below.
\`\`\`
<links>
node_id_1
node_id_2
</links>
\`\`\`

### To update a node's content:

Output an \`<update>\` section for each node you want to update, as shown in the fenced code block below.
\`\`\`
<update id="node_id">
New markdown content for the node with id="node_id"...
</update>
\`\`\`

### To respond to the user (optional):

Output a \`<response>\` section as shown in the fenced code block below.
\`\`\`
<response>
Your response to the user...
</response>
\`\`\`

If you have no response for the user, omit the \`<response>\` section.
`.trim();
  }
}
