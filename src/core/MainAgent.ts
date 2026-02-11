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
    // Line-anchored to leverage "Tags MUST be on their own line" rule.
    const tagRegex = /^<(think|act)(?:\s+type=['"](\w+)['"])?(?:\s+id=['"]([^'"]+)['"])?\s*>([\s\S]*?)^<\/\1>/gim;

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
   * Validates that the response text adheres to the strict tag-based format.
   * Returns an error message if invalid, or null if valid (or potentially valid if unclosed).
   * This is designed to be called during streaming.
   */
  public checkFormatting(text: string, isFinal: boolean = false): string | null {
    if (!text.trim()) return null;

    const lines = text.split('\n');
    let isInsideTag = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (isInsideTag) {
        // Look for closing tag
        if (trimmed.match(/^<\/(think|act)>/)) {
          isInsideTag = false;
          // After a closing tag on the same line, there should be no other content
          const afterClosing = trimmed.replace(/^<\/(think|act)>/, '').trim();
          if (afterClosing.length > 0 && !afterClosing.startsWith('<')) {
            return `Content detected after closing tag on line ${i + 1}.`;
          }
          if (afterClosing.startsWith('<')) {
            return `Multiple tags detected on line ${i + 1}. Each tag must be on its own line.`;
          }
        }
      } else {
        if (trimmed.length === 0) continue;

        // Must be the start of a tag
        if (trimmed.startsWith('<')) {
          if (trimmed.match(/^<(think|act)/)) {
            isInsideTag = true;
            // If the line contains a closing tag too, it's a one-liner
            if (trimmed.match(/<\/(think|act)>/)) {
              isInsideTag = false;
              const afterClosing = trimmed.replace(/^<(?:think|act)[\s\S]*?>[\s\S]*?<\/(?:think|act)>/, '').trim();
              if (afterClosing.length > 0) {
                return `Content detected after one-line tag on line ${i + 1}.`;
              }
            }
          } else {
            // It starts with < but not a valid tag
            if (i === lines.length - 1) {
              if (trimmed === '<') return null;
              const partialMatch = trimmed.match(/^<(t|th|thi|thin|think|a|ac|act)/i);
              if (partialMatch) return null; // Potentially valid
            }
            return `Invalid tag start detected on line ${i + 1}: ${trimmed}`;
          }
        } else {
          // Non-empty line that doesn't start with <
          return `Text detected outside of tags on line ${i + 1}.`;
        }
      }
    }

    if (isFinal && isInsideTag) {
      return 'Response ended with an unclosed tag. All tags must be properly closed.';
    }

    return null;
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
