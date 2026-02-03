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
  const [turns, setTurns] = createSignal<Turn[]>([]);
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [selectedModel, setSelectedModel] = createSignal(DEFAULT_MODEL);
  const [thinkingLevel, setThinkingLevel] = createSignal<any>('minimal');
  const [streamingEnabled, setStreamingEnabled] = createSignal(true);

  // Agent instance (initialized on mount or when model changes)
  let agent: MainAgent | null = null;
  let conversationHistory: ConversationHistory;

  // Initialize or re-initialize agent
  const initAgent = () => {
    if (!conversationHistory) {
      conversationHistory = new ConversationHistory();
    }

    try {
      const client = new GeminiClient({ model: selectedModel() });
      agent = new MainAgent(
        {
          name: 'MainAgent',
          rootNodeId: rootNodeId(),
          model: selectedModel(),
          generationConfig: {
            temperature: 1.0,
            thinkingLevel: thinkingLevel(),
          },
        },
        graph(),
        client,
        conversationHistory
      );
      console.log(`Agent (re)initialized with model: ${selectedModel()}`);
    } catch (err) {
      // API key not configured - show demo mode
      setError('Gemini API key not configured. Running in demo mode.');
      console.warn('GeminiClient initialization failed:', err);
      agent = null;
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

  // Handle sending a message
  const handleSendMessage = async (message: string) => {
    if (!agent) {
      // Demo mode - just echo the message
      const userTurn: Turn = {
        id: `turn_${Date.now()}` as any,
        role: 'user',
        content: message,
        timestamp: new Date(),
        previousTurnId: null,
        relatedNodes: [],
      };

      const assistantTurn: Turn = {
        id: `turn_${Date.now() + 1}` as any,
        role: 'model',
        content: `[Demo Mode] I received your message: "${message}"\n\nTo enable full functionality, please configure the GEMINI_API_KEY environment variable or add VITE_GEMINI_API_KEY to your .env file.`,
        timestamp: new Date(),
        previousTurnId: userTurn.id,
        relatedNodes: [rootNodeId()],
      };

      setTurns([...turns(), userTurn, assistantTurn]);
      return;
    }

    setIsLoading(true);
    setError(null);

    if (streamingEnabled()) {
      try {
        const stream = agent.processTurnStream(message);

        // Update UI IMMEDIATELY with the user turn that was just added to history
        setTurns(conversationHistory.getRecentTurns(100));

        let modelContent = '';
        let modelThoughts = '';

        for await (const chunk of stream) {
          if (chunk.type === 'text') {
            modelContent += chunk.content;
          } else if (chunk.type === 'thought') {
            modelThoughts += chunk.content;
          }

          // Show partial content in the UI
          const historyTurns = conversationHistory.getRecentTurns(100);
          setTurns([
            ...historyTurns,
            {
              id: 'streaming' as any,
              role: 'model',
              content: modelContent,
              thoughts: modelThoughts,
              timestamp: new Date(),
              previousTurnId: historyTurns[historyTurns.length - 1]?.id || null,
              relatedNodes: [],
            }
          ]);
        }

        // Final update - history now has the real model turn with parsed links
        setTurns(conversationHistory.getRecentTurns(100));
        setGraph(new Map(graph()));

      } catch (err) {
        console.error('Error processing turn stream:', err);
        setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setTurns(conversationHistory.getRecentTurns(100));
      } finally {
        setIsLoading(false);
      }
    } else { // Non-streaming mode
      try {
        // Start processing (Agent records the turn internally)
        const processPromise = agent.processTurn(message);

        // Update UI IMMEDIATELY to show the user message
        setTurns(conversationHistory.getRecentTurns(100));

        await processPromise;
        setTurns(conversationHistory.getRecentTurns(100));
        setGraph(new Map(graph()));
      } catch (err) {
        console.error('Error processing turn:', err);
        setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setTurns(conversationHistory.getRecentTurns(100));
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
