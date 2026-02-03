/**
 * ConversationPanel - Chat interface component.
 * 
 * Displays the conversation history with user/assistant messages
 * and provides an input field for new messages.
 */

import { type Component, For, createSignal, createEffect, Show, createMemo } from 'solid-js';
import type { Turn, GenerationConfig } from '../core/types';
import { SUPPORTED_MODELS } from '../core/GeminiClient';
import * as d3 from 'd3';

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

  /** Currently selected temperature */
  temperature: number;

  /** Callback when temperature is changed */
  onTemperatureChange: (temp: number) => void;
}

/**
 * Chat interface component with message list and input.
 */
const ConversationPanel: Component<ConversationPanelProps> = (props) => {
  const [inputText, setInputText] = createSignal('');
  const [showTempDropdown, setShowTempDropdown] = createSignal(false);
  let messagesEndRef: HTMLDivElement | undefined;
  let inputRef: HTMLTextAreaElement | undefined;

  // Calculate temperature color using D3
  const tempColor = createMemo(() => {
    const scale = d3.scaleLinear<string>()
      .domain([0, 1, 2])
      .range(['#6cf', '#8f8', '#f66'])
      .interpolate(d3.interpolateRgb);
    return scale(props.temperature);
  });

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

        <label class="streaming-toggle" title="Toggle Real-time Streaming">
          <input
            type="checkbox"
            checked={props.streamingEnabled}
            onChange={(e) => props.onStreamingToggle(e.currentTarget.checked)}
            disabled={props.isLoading}
          />
          <span>Stream</span>
        </label>

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

          {/* Thinking level selection */}
          <Show when={(SUPPORTED_MODELS[props.selectedModel]?.thinkingLevels?.length ?? 0) > 0}>
            <span title="Thinking Level">🧠</span>
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

          {/* Temperature input with slider dropdown */}
          <div class="temperature-control-container" style={{ "--temp-color": tempColor() }}>
            <div
              class="temperature-trigger"
              onClick={() => setShowTempDropdown(!showTempDropdown())}
              title="Temperature: Click to adjust"
            >
              <span>🌡️</span>
              <span class="temp-value">{props.temperature.toFixed(1)}</span>
            </div>

            <Show when={showTempDropdown()}>
              <div class="temperature-dropdown">
                <div class="dropdown-header">
                  <span>Temperature</span>
                  <button onClick={() => setShowTempDropdown(false)}>×</button>
                </div>
                <div class="slider-container">
                  <div class="slider-labels">
                    <span>Creative</span>
                    <span>Standard</span>
                    <span>Precise</span>
                  </div>
                  <datalist id="temp-ticks">
                    <option value="0.0"></option>
                    <option value="1.0"></option>
                    <option value="2.0"></option>
                  </datalist>
                  <input type="range"
                    min="0" max="2" step="0.1" value={props.temperature}
                    onInput={(e) => props.onTemperatureChange(parseFloat(e.currentTarget.value))}
                    disabled={props.isLoading}
                    class="temp-slider"
                    list="temp-ticks"
                  />
                </div>
              </div>
              {/* Click-away overlay */}
              <div class="dropdown-overlay" onClick={() => setShowTempDropdown(false)} />
            </Show>
          </div>
        </div>
      </div>

      {/* Message list */}
      <div class="message-list">
        <For each={props.turns}>
          {(turn) => (
            <div class={`message ${turn.role} ${turn.id === 'streaming' ? 'streaming' : ''}`}>
              <div class="message-header">
                <span class="message-role">
                  {turn.role === 'user' ? 'You' : 'Corkei'}
                </span>
                <span class="message-time">
                  {turn.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })}
                </span>
              </div>
              <div class="message-content">
                {turn.content}
              </div>
              <Show when={turn.thoughts}>
                <details class="message-thoughts" open={turn.id === 'streaming'}>
                  <summary class="thoughts-header">Thought process</summary>
                  <div class="thoughts-content">{turn.thoughts}</div>
                </details>
              </Show>
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
