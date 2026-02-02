/**
 * GeminiClient - Wrapper for the Gemini Interactions API.
 * 
 * Uses the @google/genai package with the Interactions API for:
 * - systemInstruction: Context tree text (root node)
 * - input: Conversation history / current turn
 * - previousInteractionId: Stateful multi-turn conversations
 * 
 * API Key loading priority:
 * 1. Runtime configuration (GeminiClientConfig)
 * 2. Environment variable GEMINI_API_KEY
 * 3. .env file (via Vite's import.meta.env)
 */

import { GoogleGenAI } from '@google/genai';
import type { ModelInput, ModelResult, GenerationConfig } from './types';
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
export const SUPPORTED_MODELS: Record<string, { name: string; thinkingLevels: string[] }> = {
  //'gemma-3-270m-it': { name: 'Gemma 3 270M', thinkingLevels: [] }, // Unsupported by Interactions API
  //'gemma-3-1b-it': { name: 'Gemma 3 1B', thinkingLevels: [] }, // Too small for agentic workflows
  //'gemma-3-2b-it': { name: 'Gemma 3 2B', thinkingLevels: [] }, // Unsupported by Interactions API
  'gemma-3-4b-it': { name: 'Gemma 3 4B', thinkingLevels: [] },
  'gemma-3-12b-it': { name: 'Gemma 3 12B', thinkingLevels: [] },
  'gemma-3-27b-it': { name: 'Gemma 3 27B', thinkingLevels: [] },
  //'gemini-2.5-flash-lite': { name: 'Gemini 2.5 Flash Lite', thinkingLevels: ['low', 'high'] }, // Conflicting settings: thinkingLevel = ['low'=256, 'high'=?] but 256 < min thinkingBudget = 512
  'gemini-2.5-flash': { name: 'Gemini 2.5 Flash', thinkingLevels: ['minimal', 'low', 'medium', 'high'] },
  'gemini-2.5-pro': { name: 'Gemini 2.5 Pro', thinkingLevels: ['low', 'high'] },
  'gemini-3-flash-preview': { name: 'Gemini 3 Flash', thinkingLevels: ['minimal', 'low', 'medium', 'high'] },
  'gemini-3-pro-preview': { name: 'Gemini 3 Pro', thinkingLevels: ['low', 'high'] },
};

/**
 * Default model for Gemini interactions.
 */
export const DEFAULT_MODEL = 'gemini-3-flash-preview';

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
 * Gemini Interactions API client implementation.
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
    const clientOptions: any = { apiKey };

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

  /**
   * Returns true if the current model is a Gemma model.
   */
  private isGemma(): boolean {
    return this.model.startsWith('gemma');
  }

  /**
   * Returns true if the current model is a Gemini 3 model.
   */
  private isGemini3(): boolean {
    return this.model.includes('gemini-3');
  }

  /**
   * Returns true if the current model is a Gemini 2 model.
   */
  private isGemini2(): boolean {
    return this.model.includes('gemini-2');
  }

  /**
   * Prepares the interaction request object.
   */
  private prepareRequest(input: ModelInput, isStream: boolean = false): any {
    const generationConfig = {
      ...this.defaultConfig,
      ...input.generationConfig,
    };

    const request: any = {
      model: this.model,
      input: input.input.slice(-1),
      stream: isStream,
    };

    // Add generation config if present
    if (Object.keys(generationConfig).length > 0) {
      request.generationConfig = {
        temperature: generationConfig.temperature,
        maxOutputTokens: generationConfig.maxOutputTokens,
      };
      if (generationConfig.thinkingLevel) {
        request.generationConfig.thinkingLevel = generationConfig.thinkingLevel;
        request.generationConfig.thinkingSummaries = 'auto';
      }
    }

    if (!this.isGemma()) {
      request.systemInstruction = input.systemInstruction;
    } else if (input.systemInstruction && !input.previousInteractionId) {
      // Gemma workaround: Prepend system instruction because the model doesn't support systemInstruction
      const systemPrep = `[SYSTEM_INSTRUCTION]\n${input.systemInstruction}\n[/SYSTEM_INSTRUCTION]\n\n`;

      // Prepend systemPrep to the first message if it's from user, or add a new one
      if (request.input.length > 0) {
        const firstTurn = request.input[0];
        if (firstTurn.role === 'user') {
          firstTurn.content = systemPrep + firstTurn.content;
        } else {
          request.input.unshift({ role: 'user', content: systemPrep + 'Hi' });
        }
      } else {
        request.input.push({ role: 'user', content: systemPrep + 'Hi' });
      }
    }

    // Chain to previous interaction for stateful conversation
    if (input.previousInteractionId) {
      request.previousInteractionId = input.previousInteractionId;
    }

    return request;
  }

  /**
   * Generate a response using the Gemini Interactions API.
   */
  async generate(input: ModelInput): Promise<ModelResult> {
    const request = this.prepareRequest(input, false);

    // Make the API call
    console.debug('[GeminiClient.generate()] API request:', request);
    const interaction = await this.client.interactions.create(request);

    // Extract the response text - outputs may contain different content types
    const outputs = interaction.outputs || [];
    console.debug('[GeminiClient.generate()] Interaction outputs:', outputs);
    let text = '';
    for (const output of outputs) {
      // Check if this is a text output (using 'any' to handle union types)
      if ((output as any).type === 'text' && (output as any).text) {
        text = (output as any).text;
        break;
      }
      // Also check for direct text property
      if ((output as any).text && typeof (output as any).text === 'string') {
        text = (output as any).text;
        break;
      }
    }

    return {
      text,
      interactionId: interaction.id || '',
      usage: interaction.usage ? {
        inputTokens: interaction.usage.total_input_tokens || 0,
        outputTokens: interaction.usage.total_output_tokens || 0,
        totalTokens: interaction.usage.total_tokens || 0,
      } : undefined,
    };
  }

  /**
   * Generate a streaming response using the Gemini Interactions API.
   */
  async *generateStream(input: ModelInput): AsyncIterable<string> {
    const request = this.prepareRequest(input, true);

    // Make the streaming API call
    console.debug('[GeminiClient.generateStream()] API request:', request);
    const stream = await this.client.interactions.create(request);

    // Yield text chunks as they arrive
    for await (const chunk of stream as any) {
      console.debug('[GeminiClient.generateStream()] API chunk:', chunk);
      if (chunk.eventType === 'content.delta') {
        if (chunk.delta?.type === 'text' && chunk.delta?.text) {
          yield chunk.delta.text;
        }
      }
    }
  }
}
