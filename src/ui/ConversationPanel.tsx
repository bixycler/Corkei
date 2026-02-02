/**
 * ConversationPanel - Chat interface component.
 * 
 * Displays the conversation history with user/assistant messages
 * and provides an input field for new messages.
 */

import { type Component, For, createSignal, createEffect, Show } from 'solid-js';
import type { Turn, GenerationConfig } from '../core/types';
import { SUPPORTED_MODELS } from '../core/GeminiClient';

// Styles are in Corkei.css

export interface ConversationPanelProps {
  /** Conversation turns to display */
  turns: Turn[];

  /** Whether the agent is currently processing */
  isLoading: boolean;

  /** Callback when user sends a message */
  onSendMessage: (message: string) => void;

  /** Currently selected model */
  selectedModel: string;

  /** Callback when model is changed */
  onModelChange: (model: string) => void;

  /** Currently selected thinking level */
  thinkingLevel: GenerationConfig['thinkingLevel'];

  /** Callback when thinking level is changed */
  onThinkingLevelChange: (level: GenerationConfig['thinkingLevel']) => void;

  /** Whether streaming is enabled */
  streamingEnabled: boolean;

  /** Callback to toggle streaming */
  onStreamingToggle: (enabled: boolean) => void;
}

/**
 * Chat interface component with message list and input.
 */
const ConversationPanel: Component<ConversationPanelProps> = (props) => {
  const [inputText, setInputText] = createSignal('');
  let messagesEndRef: HTMLDivElement | undefined;
  let inputRef: HTMLTextAreaElement | undefined;

  // Auto-scroll to latest message
  createEffect(() => {
    if (props.turns.length > 0 && messagesEndRef) {
      messagesEndRef.scrollIntoView({ behavior: 'smooth' });
    }
  });

  // Handle send button click or Enter key
  const handleSend = () => {
    const message = inputText().trim();
    if (message && !props.isLoading) {
      props.onSendMessage(message);
      setInputText('');
    }
  };

  // Handle keyboard events
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div class="conversation-panel">
      {/* Panel header with model selection */}
      <div class="conversation-header">
        <div class="header-title">Conversation</div>
        <div class="model-selection">
          <select
            value={props.selectedModel}
            onChange={(e) => props.onModelChange(e.currentTarget.value)}
            disabled={props.isLoading}
            title="Select AI Model"
          >
            <For each={Object.entries(SUPPORTED_MODELS)}>
              {(model) => (
                <option value={model[0]}>{model[1].name}</option>
              )}
            </For>
          </select>

          <Show when={(SUPPORTED_MODELS[props.selectedModel]?.thinkingLevels?.length ?? 0) > 0}>
            <select
              value={props.thinkingLevel}
              onChange={(e) => props.onThinkingLevelChange(e.currentTarget.value as any)}
              disabled={props.isLoading}
              title="Select Thinking Level"
              class="thinking-level-select"
            >
              <For each={SUPPORTED_MODELS[props.selectedModel].thinkingLevels}>
                {(level) => (
                  <option value={level}>{level}</option>
                )}
              </For>
            </select>
          </Show>

          <label class="streaming-toggle" title="Toggle Real-time Streaming">
            <input
              type="checkbox"
              checked={props.streamingEnabled}
              onChange={(e) => props.onStreamingToggle(e.currentTarget.checked)}
              disabled={props.isLoading}
            />
            <span>Stream</span>
          </label>
        </div>
      </div>

      {/* Message list */}
      <div class="message-list">
        <For each={props.turns}>
          {(turn) => (
            <div class={`message ${turn.role} ${turn.id === 'streaming' ? 'streaming' : ''}`}>
              <div class="message-role">
                {turn.role === 'user' ? 'You' : 'Corkei'}
              </div>
              <div class="message-content">
                {turn.content}
              </div>
              {turn.relatedNodes.length > 0 && (
                <div class="message-links">
                  <span class="links-label">Related:</span>
                  <For each={turn.relatedNodes}>
                    {(nodeId) => (
                      <span class="node-link">{nodeId}</span>
                    )}
                  </For>
                </div>
              )}
            </div>
          )}
        </For>

        {/* Loading indicator */}
        {props.isLoading && (
          <div class="message assistant loading">
            <div class="message-role">Corkei</div>
            <div class="message-content">
              <span class="loading-dots">
                <span>.</span><span>.</span><span>.</span>
              </span>
            </div>
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div class="input-area">
        <textarea
          ref={inputRef}
          class="message-input"
          placeholder="Type a message..."
          value={inputText()}
          onInput={(e) => setInputText(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          disabled={props.isLoading}
          rows={2}
        />
        <button
          class="send-button"
          onClick={handleSend}
          disabled={props.isLoading || !inputText().trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default ConversationPanel;
