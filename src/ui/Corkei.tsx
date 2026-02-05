/**
 * Corkei - Main application component.
 * 
 * Entry point for the Corkei multi-agent system UI.
 * Initializes core services and renders the split-view layout.
 */

import { type Component, createSignal, createMemo, onMount } from 'solid-js';
import './Corkei.css';

// Core imports
import type { ContextGraph, NodeId, Turn } from '../core/types';
import { nodeId } from '../core/types';
import { createContextGraph, createNode, addNode, addChildToNode } from '../core/ContextGraph';
import { ConversationHistory } from '../core/Conversation';
import { GeminiClient, DEFAULT_MODEL, SUPPORTED_MODELS } from '../core/GeminiClient';
import { MainAgent } from '../core/MainAgent';

// UI components
import ConversationPanel from './ConversationPanel';
import GraphPanel from './GraphPanel';

export interface CorkeiProps {
  /** Optional explanation URL (legacy, not used currently) */
  explanationUrl?: string;
}

/**
 * Creates an initial demo context graph with a root node.
 */
function createDemoGraph(): { graph: ContextGraph; rootNodeId: NodeId } {
  const graph = createContextGraph();

  // Create root node (this text serves as system instruction)
  const rootId = nodeId('root');
  const root = createNode('root', `
# Corkei Assistant

You are Corkei, a helpful AI assistant that manages knowledge in a graph structure.

Your primary tasks:
1. Understand user queries and link them to relevant context nodes
2. Update node contents when new information is provided
3. Create new nodes when needed to organize knowledge
4. Respond helpfully to the user when needed

${MainAgent.getOutputFormatInstructions()}
`.trim(), 'Corkei Root');
  addNode(graph, root);

  // Create some example child nodes
  const knowledgeId = nodeId('knowledge');
  const knowledge = createNode('knowledge', `
# Knowledge Base

This node contains general knowledge and facts.
`.trim(), 'Knowledge');
  addNode(graph, knowledge);
  addChildToNode(graph, rootId, knowledgeId);

  const tasksId = nodeId('tasks');
  const tasks = createNode('tasks', `
# Tasks

Current tasks and to-do items.
`.trim(), 'Tasks');
  addNode(graph, tasks);
  addChildToNode(graph, rootId, tasksId);

  return { graph, rootNodeId: rootId };
}

/**
 * Main Corkei application component.
 */
const Corkei: Component<CorkeiProps> = (props) => {
  // Core state - using mutable objects wrapped in signals for reactivity
  const [graph, setGraph] = createSignal<ContextGraph>(createContextGraph());
  const [rootNodeId, setRootNodeId] = createSignal<NodeId>(nodeId('root'));
  const [selectedNodeId, setSelectedNodeId] = createSignal<NodeId | undefined>();
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [selectedModel, setSelectedModel] = createSignal(DEFAULT_MODEL);
  const [thinkingLevel, setThinkingLevel] = createSignal<any>(SUPPORTED_MODELS[DEFAULT_MODEL]?.thinkingLevels[0]);
  const [streamingEnabled, setStreamingEnabled] = createSignal(true);
  const [temperature, setTemperature] = createSignal(1.0);

  // Agent instance (initialized on mount or when model changes)
  const [agent, setAgent] = createSignal<MainAgent | null>(null);
  const conversationHistory = new ConversationHistory();

  // Initialize or re-initialize agent
  const initAgent = () => {
    try {
      const client = new GeminiClient({ model: selectedModel() });
      const newAgent = new MainAgent(
        {
          name: 'MainAgent',
          rootNodeId: rootNodeId(),
          model: selectedModel(),
          generationConfig: {
            temperature: temperature(),
            thinkingLevel: thinkingLevel(),
          },
          maxRecentTurns: 100, // Unified limit
        },
        graph(),
        client,
        conversationHistory
      );
      setAgent(newAgent);
      console.log(`Agent (re)initialized with model: ${selectedModel()}, temperature: ${temperature()}, thinkingLevel: ${thinkingLevel()}`);
    } catch (err) {
      // API key not configured - show demo mode
      setError('Gemini API key not configured. Running in demo mode.');
      console.warn('GeminiClient initialization failed:', err);
      setAgent(null);
    }
  };

  // Initialize on mount
  onMount(() => {
    // Create demo graph
    const { graph: demoGraph, rootNodeId: demoRootId } = createDemoGraph();
    setGraph(demoGraph);
    setRootNodeId(demoRootId);

    initAgent();
  });

  // No longer need a createEffect to sync turns, ConversationPanel will read directly.

  // Reactive memo for turns displayed in the UI
  const turns = createMemo(() => {
    const activeAgent = agent();
    if (!activeAgent) return conversationHistory.getRecentTurns(100);
    const limit = activeAgent.getConfig().maxRecentTurns || 100;
    return conversationHistory.getRecentTurns(limit);
  });

  // Handle model change
  const handleModelChange = (model: string) => {
    setSelectedModel(model);

    // Ensure thinkingLevel is valid for the new model
    const supportedLevels = SUPPORTED_MODELS[model]?.thinkingLevels || [];
    if (!supportedLevels.length) {
      setThinkingLevel(null);
    } else if (!supportedLevels.includes(thinkingLevel())) {
      setThinkingLevel(supportedLevels[0]);
    }

    initAgent();
  };

  // Handle thinking level change
  const handleThinkingLevelChange = (level: any) => {
    setThinkingLevel(level);
    initAgent();
  };

  // Handle temperature change
  const handleTemperatureChange = (temp: number) => {
    setTemperature(temp);
    initAgent();
  };

  // Handle sending a message
  const handleSendMessage = async (message: string) => {
    const activeAgent = agent();
    if (!activeAgent) {
      // Demo mode: simulate interactions
      const userTurnContent = message;
      const assistantResponse = `This is a demo response to: "${message}". In a real scenario, this would be an AI-generated answer.`;

      conversationHistory.addTurn('user', userTurnContent, [rootNodeId()]);
      conversationHistory.addTurn('model', assistantResponse, [rootNodeId()]);
      return;
    }

    setIsLoading(true);
    setError(null);

    if (streamingEnabled()) {
      try {
        const stream = activeAgent.processTurnStream(message);

        let modelContent = '';
        let modelThoughts = '';

        for await (const chunk of stream) {
          if (chunk.type === 'text') {
            modelContent += chunk.content;
          } else if (chunk.type === 'thought') {
            modelThoughts += chunk.content;
          }
          // The ConversationHistory is updated internally by the agent during streaming,
          // and its listeners are notified, so the UI should react automatically.
        }

        // Final update - history now has the real model turn with parsed links
        // No explicit setTurns needed here, as the history is the source of truth.
        setGraph(new Map(graph())); // Update graph if nodes were added/modified

      } catch (err: any) {
        console.error('Error processing turn stream:', err);
        setError(err.message || 'An error occurred during streaming.');
      } finally {
        setIsLoading(false);
      }
    } else { // Non-streaming mode
      try {
        // Start processing (Agent records the turn internally)
        await activeAgent.processTurn(message);
        // No explicit setTurns needed here, as the history is the source of truth.
        setGraph(new Map(graph())); // Update graph if nodes were added/modified
      } catch (err: any) {
        console.error('Error processing turn:', err);
        setError(err.message || 'An error occurred while communicating with the model.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Handle node click in graph
  const handleNodeClick = (nodeId: NodeId) => {
    setSelectedNodeId(nodeId);
  };

  // Dismiss error
  const dismissError = () => {
    setError(null);
  };

  // Handle clearing history
  const handleClearHistory = () => {
    if (confirm('Are you sure to clear the whole conversation history?')) {
      conversationHistory.clear();
      // No need for setTurns() as it's a reactive memo from conversationHistory
    }
  };

  return (
    <div class="corkei-app">
      {/* Conversation panel */}
      <ConversationPanel
        turns={turns()}
        isLoading={isLoading()}
        onSendMessage={handleSendMessage}
        selectedModel={selectedModel()}
        onModelChange={handleModelChange}
        thinkingLevel={thinkingLevel()}
        onThinkingLevelChange={handleThinkingLevelChange}
        streamingEnabled={streamingEnabled()}
        onStreamingToggle={setStreamingEnabled}
        temperature={temperature()}
        onTemperatureChange={handleTemperatureChange}
        onClearHistory={handleClearHistory}
      />

      {/* Divider */}
      <div class="panel-divider" />

      {/* Graph panel */}
      <GraphPanel
        graph={graph()}
        rootNodeId={rootNodeId()}
        selectedNodeId={selectedNodeId()}
        onNodeClick={handleNodeClick}
      />

      {/* Error banner at bottom */}
      {error() && (
        <div class="error-banner">
          <span>{error()}</span>
          <button onClick={dismissError}>Dismiss</button>
        </div>
      )}
    </div>
  );
};

export default Corkei;
