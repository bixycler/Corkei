/**
 * GeminiClient - Wrapper for the Gemini generateContent API.
 * 
 * Uses the @google/genai package for:
 * - systemInstruction: Context tree text (root node)
 * - contents: Full conversation history (stateless)
 * 
 * API Key loading priority:
 * 1. Runtime configuration (GeminiClientConfig)
 * 2. Environment variable GEMINI_API_KEY
 * 3. .env file (via Vite's import.meta.env)
 */

import { GoogleGenAI } from '@google/genai';
import type { ModelInput, ModelResult, GenerationConfig, ModelStreamChunk, ContentPart } from './types';
import { ModelProvider } from './ModelProvider';

/**
 * Configuration for the Gemini client.
 */
export interface GeminiClientConfig {
  /** API key for Gemini (overrides env vars if provided) */
  apiKey?: string;

  /** Default model to use */
  model?: string;

  /** Default generation config */
  generationConfig?: GenerationConfig;
}

/**
 * Supported models for Gemini and Gemma.
 */
export const SUPPORTED_MODELS: Record<string, { name: string; thinkingLevels: string[]; thinkingBudgets: Record<string, number> }> = {
  //'gemma-3-270m-it': { name: 'Gemma 3 270M', thinkingLevels: [], thinkingBudgets: null }, // Unsupported by Interactions API
  'gemma-3-1b-it': { name: 'Gemma 3 1B', thinkingLevels: [], thinkingBudgets: null }, // Too small for agentic workflows
  //'gemma-3-2b-it': { name: 'Gemma 3 2B', thinkingLevels: [], thinkingBudgets: null }, // Unsupported by GenAI API
  'gemma-3-4b-it': { name: 'Gemma 3 4B', thinkingLevels: [], thinkingBudgets: null },
  'gemma-3-12b-it': { name: 'Gemma 3 12B', thinkingLevels: [], thinkingBudgets: null },
  'gemma-3-27b-it': { name: 'Gemma 3 27B', thinkingLevels: [], thinkingBudgets: null },
  'gemini-2.0-flash-lite': { name: 'Gemini 2.0 Flash Lite', thinkingLevels: [], thinkingBudgets: null }, // Free tier
  'gemini-2.0-flash': { name: 'Gemini 2.0 Flash', thinkingLevels: [], thinkingBudgets: null }, // Paid tier
  'gemini-2.5-flash-lite': {
    name: 'Gemini 2.5 Flash Lite', thinkingLevels: ['none', 'low', 'medium', 'high', 'dynamic'],
    thinkingBudgets: { 'none': NaN, 'low': 1 << 9, 'medium': 12 << 10, 'high': 24 << 10, 'dynamic': -1 }
  },
  'gemini-2.5-flash': {
    name: 'Gemini 2.5 Flash', thinkingLevels: ['none', 'low', 'medium', 'high', 'dynamic'],
    thinkingBudgets: { 'none': 0, 'low': 1 << 9, 'medium': 12 << 10, 'high': 24 << 10, 'dynamic': -1 }
  },
  'gemini-2.5-pro': {
    name: 'Gemini 2.5 Pro', thinkingLevels: ['low', 'medium', 'high', 'dynamic'],
    thinkingBudgets: { 'low': 1 << 7, 'medium': 16 << 10, 'high': 32 << 10, 'dynamic': -1 }
  },
  'gemini-3-flash-preview': {
    name: 'Gemini 3 Flash', thinkingLevels: ['minimal', 'low', 'medium', 'high'],
    thinkingBudgets: null
  },
  'gemini-3-pro-preview': {
    name: 'Gemini 3 Pro', thinkingLevels: ['low', 'high'],
    thinkingBudgets: null
  },
};

/**
 * Default model for Gemini interactions.
 */
export const DEFAULT_MODEL = 'gemini-2.5-flash'; // 'gemini-3-flash-preview' has too long TTFT > 10s!

/**
 * Gets the API key from various sources.
 * Priority: config > env var > Vite env
 */
function getApiKey(config?: GeminiClientConfig): string {
  // 1. Runtime config
  if (config?.apiKey) {
    return config.apiKey;
  }

  // 2. Environment variable (Node.js/SSR)
  const nodeProcess = (globalThis as any).process;
  if (nodeProcess?.env?.GEMINI_API_KEY) {
    return nodeProcess.env.GEMINI_API_KEY;
  }

  // 3. Vite environment variables (Browser)
  // Use an accessor that won't throw if import.meta.env is missing
  const viteEnv = (import.meta as any).env;
  if (viteEnv) {
    // High priority: VITE_ prefixed (Vite standard for client-side)
    if (viteEnv.VITE_GEMINI_API_KEY) {
      return viteEnv.VITE_GEMINI_API_KEY;
    }
    // Low priority: non-prefixed (might be available via 'define' in config)
    if (viteEnv.GEMINI_API_KEY) {
      return viteEnv.GEMINI_API_KEY;
    }
  }

  // If we reach here, we couldn't find the key
  const diagnostics = {
    hasImportMeta: typeof import.meta !== 'undefined',
    hasViteEnv: !!viteEnv,
    viteEnvKeys: viteEnv ? Object.keys(viteEnv).filter(k => k.startsWith('VITE_')) : [],
    hasNodeProcess: !!nodeProcess,
  };

  console.error('Gemini API key diagnostics:', diagnostics);

  throw new Error(
    'Gemini API key not found. Please ensure:\n' +
    '1. You have ".env" file in the project root\n' +
    '2. It contains VITE_GEMINI_API_KEY=your-key\n' +
    '3. You have restarted the dev server (npm run dev)\n' +
    `Detected environment: ${JSON.stringify(diagnostics, null, 2)}`
  );
}

/**
 * Gemini Client implementation using generateContent API.
 */
export class GeminiClient extends ModelProvider {
  private client: GoogleGenAI;
  private model: string;
  private defaultConfig: GenerationConfig;

  constructor(config?: GeminiClientConfig) {
    super();
    const apiKey = getApiKey(config);

    // Use proxy in development to avoid CORS
    // import.meta.env.DEV is Vite's way to check for development mode
    const isDev = (import.meta as any).env?.DEV;
    const clientOptions: any = {
      apiKey,
      //apiVersion: 'v1alpha'
    };

    if (isDev) {
      // This matches the proxy rule in vite.config.ts
      // SDK uses httpOptions.baseUrl (not baseURL)
      clientOptions.httpOptions = {
        baseUrl: window.location.origin + '/gemini-api',
      };
      console.log('GeminiClient: Using local proxy for API calls:', clientOptions.httpOptions.baseUrl);
    }

    this.client = new GoogleGenAI(clientOptions);
    this.model = config?.model || DEFAULT_MODEL;
    this.defaultConfig = config?.generationConfig || {};
    console.log(`GeminiClient: Initialized with model ${this.model}`);
  }

  private isGemma(): boolean { return this.model.startsWith('gemma'); }
  private isGemini3(): boolean { return this.model.includes('gemini-3'); }
  private isGemini2(): boolean { return this.model.includes('gemini-2'); }

  /**
   * Prepares the generateContent request object.
   */
  private prepareRequest(input: ModelInput): any {
    const generationConfigBase = {
      ...this.defaultConfig,
      ...input.generationConfig,
    };
    const model = SUPPORTED_MODELS[this.model];

    // Simplified config for tag-based interaction
    const config: any = {
      temperature: generationConfigBase.temperature,
      maxOutputTokens: generationConfigBase.maxOutputTokens,
      abortSignal: input.abortSignal, // Pass the signal to the internal config
    };

    // Add thinking config if present
    if (generationConfigBase.thinkingLevel) {
      config.thinkingConfig = {
        includeThoughts: true,
      };

      if (!model.thinkingBudgets) {
        config.thinkingConfig.thinkingLevel = generationConfigBase.thinkingLevel;
      } else {
        const thinkingBudget = model.thinkingBudgets[generationConfigBase.thinkingLevel];
        if (thinkingBudget || thinkingBudget === 0) config.thinkingConfig.thinkingBudget = thinkingBudget;
      }
    }

    // Add system instruction if present
    if (input.systemInstruction && !this.isGemma()) {
      config.systemInstruction = {
        parts: [{ text: input.systemInstruction }],
      };
    }

    // Pass conversation history as contents
    const request: any = {
      model: this.model,
      contents: input.input.map(turn => {
        const mapPart = (p: ContentPart) => {
          const part: any = {};
          if (p.type === 'thought') {
            // WORKAROUND: @google/genai seems to strip off parts with { thought: true }.
            // We use <think>...</think> tags injected to the text content instead.
            part.text = `<think>\n${p.content}\n</think>`;
          } else if (p.type === 'text') {
            part.text = p.content;
          }

          // Feed back thoughtSignature if present for thought coherence
          if (p.metadata?.thoughtSignature) {
            part.thoughtSignature = p.metadata.thoughtSignature;
          }
          return part;
        };

        return {
          role: turn.role,
          parts: turn.parts.map(mapPart).filter(p => p.text || p.thoughtSignature)
        };
      }),
      config,
    };

    // Gemma workaround: prepend to first user message
    if (input.systemInstruction && this.isGemma()) {
      if (request.contents.length > 0 && request.contents[0].role === 'user') {
        request.contents[0].parts[0].text = `[SYSTEM_INSTRUCTION]\n${input.systemInstruction}\n[/SYSTEM_INSTRUCTION]\n\n${request.contents[0].parts[0].text}`;
      }
    }

    return request;
  }

  /**
   * Generate a response using the Gemini generateContent API.
   */
  async generate(input: ModelInput): Promise<ModelResult> {
    const request = this.prepareRequest(input);

    // Make the API call
    console.debug('[GeminiClient.generate()] API request:', request);
    const result = await this.client.models.generateContent(request);
    console.debug('[GeminiClient.generate()] API response:', result);

    // Extract content parts in order
    const candidate = result.candidates?.[0];
    const rawParts = candidate?.content?.parts || [];
    const parts: ContentPart[] = [];

    for (const part of rawParts) {
      const partAny = part as any;
      const thought = partAny.thought;
      // Capture thoughtSignature from part level OR candidate level (Gemini 3 sometimes puts it on candidate metadata)
      const thoughtSignature = partAny.thoughtSignature || (candidate as any).thoughtSignature;

      const metadata: any = {};
      if (thoughtSignature) {
        metadata.thoughtSignature = thoughtSignature;
      }
      const hasMetadata = Object.keys(metadata).length > 0;

      if (thought) {
        // Handle both thought as string and thought as boolean with text
        const content = typeof thought === 'string' ? thought : (part.text || '');
        // Keep part if it has content OR metadata (coherence requires the signature)
        if (content || hasMetadata) {
          parts.push({
            type: 'thought',
            content,
            metadata: hasMetadata ? metadata : undefined
          });
        }
      } else if (part.text !== undefined || hasMetadata) {
        parts.push({
          type: 'text',
          content: part.text || '',
          metadata: hasMetadata ? metadata : undefined
        });
      }
    }

    return {
      parts,
      usage: result.usageMetadata ? {
        inputTokens: result.usageMetadata.promptTokenCount || 0,
        outputTokens: result.usageMetadata.candidatesTokenCount || 0,
        totalTokens: result.usageMetadata.totalTokenCount || 0,
      } : undefined,
      metadata: (candidate as any).thoughtSignature ? {
        thoughtSignature: (candidate as any).thoughtSignature
      } : undefined,
    };
  }

  /**
   * Generate a streaming response using the Gemini generateContent API.
   */
  async *generateStream(input: ModelInput): AsyncIterable<ModelStreamChunk> {
    const request = this.prepareRequest(input);

    // Make the streaming API call
    console.debug('[GeminiClient.generateStream()] API request:', request);
    const response = await this.client.models.generateContentStream(request);

    // Yield text chunks as they arrive
    for await (const chunk of response) {
      console.debug('[GeminiClient.generateStream()] chunk:', chunk);
      const candidate = chunk.candidates?.[0];
      const parts = candidate?.content?.parts || [];

      // Capture thoughtSignature from candidate level (Gemini 3 sometimes puts it here in streaming)
      const candidateSignature = (candidate as any)?.thoughtSignature;

      for (const part of parts) {
        const partAny = part as any;
        const thought = partAny.thought;
        // Capture thoughtSignature from part level OR candidate level
        const thoughtSignature = partAny.thoughtSignature || candidateSignature;

        const metadata: any = {};
        if (thoughtSignature) {
          metadata.thoughtSignature = thoughtSignature;
        }
        const hasMetadata = Object.keys(metadata).length > 0;

        if (thought) {
          if (typeof thought === 'string') {
            console.debug('[GeminiClient.generateStream()] chunk thought:', thought);
            yield { type: 'thought', text: thought, metadata: hasMetadata ? metadata : undefined };
          } else if (thought === true) {
            console.debug('[GeminiClient.generateStream()] chunk [thought]:', part.text);
            yield { type: 'thought', text: part.text || '', metadata: hasMetadata ? metadata : undefined };
          }
        } else if (part.text !== undefined || hasMetadata) {
          console.debug('[GeminiClient.generateStream()] chunk text:', part.text);
          yield { type: 'text', text: part.text || '', metadata: hasMetadata ? metadata : undefined };
        }
      }

      // If we have a signature but no parts were yielded, yield an empty text chunk with metadata
      // to ensure the signature is captured by the agent.
      if (candidateSignature && parts.length === 0) {
        console.debug('[GeminiClient.generateStream()] chunk metadata-only:', candidateSignature);
        yield {
          type: 'text',
          text: '',
          metadata: { thoughtSignature: candidateSignature }
        };
      }

      const usage = chunk.usageMetadata;
      if (usage) {
        yield {
          type: 'usage',
          usage: {
            inputTokens: usage.promptTokenCount || 0,
            outputTokens: usage.candidatesTokenCount || 0,
            totalTokens: usage.totalTokenCount || 0,
          }
        };
      }
    }
  }
}
