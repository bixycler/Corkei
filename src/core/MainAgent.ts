import MarkdownIt from 'markdown-it';
import type {
  ContextGraph,
  NodeId,
  ModelProvider,
  AgentConfig,
} from './types';
import { nodeId } from './types';
import { Agent } from './Agent';
import { ConversationHistory } from './Conversation';

/**
 * MainAgent - The primary orchestrator agent.
 */
export class MainAgent extends Agent {
  private md: MarkdownIt;

  constructor(
    config: AgentConfig,
    graph: ContextGraph,
    modelProvider: ModelProvider,
    history?: ConversationHistory
  ) {
    super(config, graph, modelProvider, history);
    this.md = new MarkdownIt({
      html: true,
      linkify: true,
      breaks: false, // Standard Markdown behavior (p for \n\n, nothing for \n)
      typographer: true
    });
  }

  /**
   * Parses the model's response to extract structured updates using tags and registers.
   */
  protected parseResponse(responseText: string): {
    thought?: string;
    response?: string;
    graphActionPayload?: any;
  } {
    let response: string | undefined;
    let thought: string | undefined;
    let graphActionPayload: any = null;

    if (!responseText.trim()) {
      return { thought, response, graphActionPayload };
    }

    const thoughts: string[] = [];
    const acts: { type: string; id?: string; content: string }[] = [];
    const registers = new Map<string, string>();

    // Robust Tag Extraction using Regex
    // Fix: Separated tag name from attributes to allow correct backreference for closing tag.
    const tagRegex = /<(think|act)(?:\s+type=['"](\w+)['"])?(?:\s+id=['"]([^'"]+)['"])?\s*>([\s\S]*?)<\/\1>/gi;

    let match;
    while ((match = tagRegex.exec(responseText)) !== null) {
      const tagName = match[1].toLowerCase();
      const type = match[2];
      const id = match[3];
      const content = match[4];

      if (tagName === 'think') {
        thoughts.push(content.trim());
      } else if (tagName === 'act') {
        acts.push({ type: type || '', id, content });
      }
    }

    // Process Registers first
    for (const act of acts) {
      if (act.type === 'register' && act.id) {
        registers.set(act.id, act.content);
      }
    }

    // Process Actions
    for (const act of acts) {
      if (act.type === 'graph') {
        try {
          const jsonText = act.content.trim()
            .replace(/^```[a-z]*\s*/i, '') // Remove opening fence + optional lang
            .replace(/\s*```$/g, '');      // Remove closing fence

          let parsed = JSON.parse(jsonText);
          this.substituteRegisters(parsed, registers);

          if (!graphActionPayload) {
            graphActionPayload = parsed;
          } else {
            for (const key of Object.keys(parsed)) {
              if (Array.isArray(parsed[key])) {
                graphActionPayload[key] = [...(graphActionPayload[key] || []), ...parsed[key]];
              } else {
                graphActionPayload[key] = parsed[key];
              }
            }
          }
        } catch (err) {
          console.error('[MainAgent] Failed to parse act type="graph":', err, act.content);
        }
      } else if (act.type === 'response') {
        response = act.content;
      }
    }

    thought = thoughts.join('\n\n');

    // Final substitution for verbal response if it uses registers
    if (response) {
      response = response.replace(/\${(\w+)}/g, (_, id) => registers.get(id) || `${id}`);
    }

    return { thought, response, graphActionPayload };
  }

  /**
   * Recursively substitutes ${id} placeholders with register contents.
   */
  private substituteRegisters(obj: any, registers: Map<string, string>) {
    if (!obj || typeof obj !== 'object') return;

    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (typeof val === 'string') {
        // Replace ${id}
        obj[key] = val.replace(/\${(\w+)}/g, (_, id) => registers.get(id) || `${id}`);
      } else if (typeof val === 'object') {
        this.substituteRegisters(val, registers);
      }
    }
  }

  /**
   * Gets the expected output format description for the system instruction.
   */
  static getOutputFormatInstructions(): string {
    return `
## Tag-based Interaction Pattern

You must wrap ALL your output in either <think> or <act> blocks. No text is allowed outside these blocks.

### 1. Reasoning & Planning
Use <think> for your internal monologue, planning, and reasoning.
<think>
Your thoughts here...
</think>

### 2. Complex Content (Registers)
If you need to update a node with large content (especially text containing triple-backticks), first store it in a register:
<act type='register' id='reg1'>
# Markdown Content
\`\`\`python
print("Hello")
\`\`\`
</act>

### 3. Graph Actions
Use <act type='graph'> with a JSON payload to interact with the graph.
<act type='graph'>
\`\`\`json
{
  "updates": [
    { "id": "node_id", "text": "\${reg1}", "children": ["child1"] }
  ],
  "links": ["related_node1", "related_node2"]
}
\`\`\`
</act>

Actions:
- \`updates\`: Update nodes with new text and/or children.
- \`links\`: Mark nodes as relevant to the current turn.

### 4. Verbal Response
Use <act type='response'> for your message to the human user.
<act type='response'>
Your response text...
</act>

Rules:
- Tags MUST be on their own line.
- Content outside tags is strictly forbidden.
`.trim();
  }
}
