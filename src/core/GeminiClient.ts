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
import type { ModelInput, ModelResult, GenerationConfig, ModelStreamChunk } from './types';
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
    const generationConfig = {
      ...this.defaultConfig,
      ...input.generationConfig,
    };

    const request: any = {
      model: this.model,
      // Pass conversation history as contents
      contents: input.input.map(turn => ({
        role: turn.role === 'user' ? 'user' : 'model',
        parts: [{ text: turn.content }],
      })),
      config: {
        generationConfig: {
          temperature: generationConfig.temperature,
          maxOutputTokens: generationConfig.maxOutputTokens,
        }
      }
    };

    // Add thinking config if present and not a Gemma model
    if (generationConfig.thinkingLevel && !this.isGemma()) {
      request.config.thinkingConfig = {
        includeThoughts: true,
      };

      if (this.isGemini3()) {
        request.config.thinkingConfig.thinkingLevel = generationConfig.thinkingLevel;
      } else if (this.isGemini2()) {
        // High level = 16k tokens, Low/Minimal = 4k tokens
        const highBudget = (generationConfig.thinkingLevel === 'high' || generationConfig.thinkingLevel === 'medium');
        request.config.thinkingConfig.thinkingBudget = highBudget ? 16000 : 4000;
      }
    }

    // Add system instruction if present
    if (input.systemInstruction) {
      if (this.isGemma()) {
        // Gemma workaround: prepend to first user message
        if (request.contents.length > 0 && request.contents[0].role === 'user') {
          request.contents[0].parts[0].text = `[SYSTEM_INSTRUCTION]\n${input.systemInstruction}\n[/SYSTEM_INSTRUCTION]\n\n${request.contents[0].parts[0].text}`;
        }
      } else {
        request.config.systemInstruction = {
          parts: [{ text: input.systemInstruction }],
        };
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

    // Extract content and thoughts
    const candidate = result.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    let text = '';
    let thoughts = '';

    for (const part of parts) {
      const thought = (part as any).thought;
      if (thought) {
        // Handle both thought as string and thought as boolean with text
        if (typeof thought === 'string') {
          thoughts += thought;
        } else if (thought === true && part.text) {
          thoughts += part.text;
        }
      } else if (part.text) {
        text += part.text;
      }
    }
    // Log extracted components
    if (thoughts) {
      console.debug('[GeminiClient.generate()] Extracted thoughts:', thoughts);
    }
    console.debug('[GeminiClient.generate()] Extracted text:', text);

    const usage = result.usageMetadata;
    return {
      text,
      thoughts: thoughts || undefined,
      usage: usage ? {
        inputTokens: usage.promptTokenCount || 0,
        outputTokens: usage.candidatesTokenCount || 0,
        totalTokens: usage.totalTokenCount || 0,
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

      for (const part of parts) {
        const thought = (part as any).thought;
        if (thought) {
          if (typeof thought === 'string') {
            console.debug('[GeminiClient.generateStream()] chunk thought:', thought);
            yield { type: 'thought', text: thought };
          } else if (thought === true && part.text) {
            console.debug('[GeminiClient.generateStream()] chunk thought (flagged):', part.text);
            yield { type: 'thought', text: part.text };
          }
        } else if (part.text) {
          console.debug('[GeminiClient.generateStream()] chunk text:', part.text);
          yield { type: 'text', text: part.text };
        }
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
