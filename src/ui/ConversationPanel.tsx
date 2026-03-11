/**
 * ConversationPanel - Chat interface component.
 * 
 * Displays the conversation history with user/assistant messages
 * and provides an input field for new messages.
 */

import { type Component, For, createSignal, createEffect, Show, createMemo, Switch, Match } from 'solid-js';
import MarkdownIt from 'markdown-it';
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
  onClearHistory: () => void;
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false,
  typographer: true
});

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
    if (!props.isLoading) {
      props.onSendMessage(inputText().trim());
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

  const getRoleDisplay = (position: string) => {
    switch (position) {
      case 'human': return 'You';
      case 'self': return 'Corkei';
      case 'agent': return 'Agent';
      case 'system': return 'System';
      default: return position;
    }
  };

  return (
    <div class="conversation-panel">
      <div class="conversation-header">
        <div class="header-title">Conversation</div>
        <div class="conversation-controls">
          <button class="header-btn clear-btn" onClick={() => props.onClearHistory()} title="Clear History">Clear</button>
          <label class="streaming-toggle">
            <input type="checkbox" checked={props.streamingEnabled} onChange={(e) => props.onStreamingToggle(e.currentTarget.checked)} disabled={props.isLoading} />
            <span>Stream</span>
          </label>
        </div>
        <div class="model-settings">
          <select value={props.selectedModel} onChange={(e) => props.onModelChange(e.currentTarget.value)} disabled={props.isLoading}>
            <For each={Object.entries(SUPPORTED_MODELS)}>{(model) => <option value={model[0]}>{model[1].name}</option>}</For>
          </select>
          <Show when={(SUPPORTED_MODELS[props.selectedModel]?.thinkingLevels?.length ?? 0) > 0}>
            <span title="Thinking Level">🧠</span>
            <select value={props.thinkingLevel} onChange={(e) => props.onThinkingLevelChange(e.currentTarget.value as any)} disabled={props.isLoading} class="thinking-level-select">
              <For each={SUPPORTED_MODELS[props.selectedModel].thinkingLevels}>{(level) => <option value={level}>{level}</option>}</For>
            </select>
          </Show>
          <div class="temperature-control-container" style={{ "--temp-color": tempColor() }}>
            <div class="temperature-trigger" onClick={() => setShowTempDropdown(!showTempDropdown())} title="Temperature">
              <span>🌡️</span><span class="temp-value">{props.temperature.toFixed(1)}</span>
            </div>
            <Show when={showTempDropdown()}>
              <div class="temperature-dropdown">
                <div class="dropdown-header"><span>Temperature</span><button onClick={() => setShowTempDropdown(false)}>×</button></div>
                <div class="slider-container">
                  <div class="slider-labels"><span>Creative</span><span>Standard</span><span>Precise</span></div>
                  <input type="range" min="0" max="2" step="0.1" value={props.temperature} onInput={(e) => props.onTemperatureChange(parseFloat(e.currentTarget.value))} disabled={props.isLoading} class="temp-slider" />
                </div>
              </div>
              <div class="dropdown-overlay" onClick={() => setShowTempDropdown(false)} />
            </Show>
          </div>
        </div>
      </div>

      <div class="message-list">
        <For each={props.turns}>{(turn) => (
          <div class={`message pos-${turn.position} ${turn.id === 'streaming' ? 'streaming' : ''}`}>
            <div class="message-header">
              <span class="message-role">{getRoleDisplay(turn.position)}</span>
              <span class="message-time">
                {(() => {
                  const baseTime = (turn.role === 'model' && turn.firstTokenTimestamp) ? turn.firstTokenTimestamp : turn.timestamp;
                  let timeStr = baseTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
                  if (turn.role === 'model' && turn.firstTokenTimestamp && turn.parts.length > 0) {
                    timeStr += turn.parts.map(p => p.durationMs !== undefined ? ` + ${(p.durationMs / 1000).toFixed(1)}s` : '').join('');
                  }
                  if (turn.role === 'model' && !turn.isStreaming && turn.responseTime !== undefined) {
                    timeStr += ` (Σ ${(turn.responseTime / 1000).toFixed(1)}s)`;
                  }
                  return timeStr;
                })()}
              </span>
            </div>
            <div class="message-content">
              <For each={turn.parts}>{(part) => (
                <Switch>
                  <Match when={part.type === 'thought'}>
                    <details class="message-thoughts" open={turn.isStreaming}>
                      <summary class="thoughts-header">Thought process</summary>
                      <div class="thoughts-content" innerHTML={md.render((part as any).content)} />
                    </details>
                  </Match>
                  <Match when={part.type === 'text'}>
                    <div class="text-part" innerHTML={md.render((part as any).content)} />
                  </Match>
                </Switch>
              )}</For>
            </div>
          </div>
        )}</For>
        <div ref={messagesEndRef} />
      </div>

      <div class="input-area">
        <textarea ref={inputRef!} class="message-input" placeholder="Type a message..." value={inputText()} onInput={(e) => setInputText(e.currentTarget.value)} onKeyDown={handleKeyDown} disabled={props.isLoading} rows={2} />
        <button class="send-button" onClick={handleSend} disabled={props.isLoading}>Send</button>
      </div>
    </div>
  );
};

export default ConversationPanel;
