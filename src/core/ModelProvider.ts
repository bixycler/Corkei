/**
 * ModelProvider - Abstract interface for AI model backends.
 * 
 * This abstraction allows Corkei to work with different model providers:
 * - Gemini Interactions API (primary)
 * - Local models (Ollama, etc.) - future extension
 */

import type { ModelInput, ModelResult } from './types';

/**
 * Abstract base class for model providers.
 */
export abstract class ModelProvider {
  /**
   * Generate a response from the model.
   * 
   * @param input - The model input containing system instruction and user input
   * @returns The model's response with interaction ID for chaining
   */
  abstract generate(input: ModelInput): Promise<ModelResult>;

  /**
   * Generate a streaming response from the model.
   * Optional - not all providers support streaming.
   * 
   * @param input - The model input
   * @yields Text chunks as they are generated
   */
  generateStream?(input: ModelInput): AsyncIterable<string>;
}
