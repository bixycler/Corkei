# Corkei Project Overview

## Project Stucture
Corkei is a high-performance AI agent platform built with **SolidJS** and **TypeScript**, utilizing a Multi-Page Application (MPA) architecture.

### 1. Engine Layer (`src/core/`)
- **`Agent.ts` / `MainAgent.ts`**: Core logic for agent orchestration.
- **`Conversation.ts`**: Chat state and history management.
- **`ContextGraph.ts`**: Graph-based memory and RAG system.
- **`GeminiClient.ts`**: Integration with Google's Gemini API via `@google/genai`.
- **`types.ts`**: Shared types and interfaces.

### 2. UI Layer (`src/ui/`)
- **`Corkei.tsx`**: The main application root.
- **`ConversationPanel.tsx`**: The primary chat interface.
- **`Corkei.css`**: Vanilla CSS for styling. No TailwindCSS.
- **Framework**: **SolidJS** (Not React). Uses JSX with `.tsx` files.

### 3. Artifacts System (`src/artifacts/`)
The project implements a modular "Artifacts" system for documentation and micro-apps.

#### `src/artifacts/docs/`
- Centralized project documentation, architecture notes, and procedural "Skills".

#### `src/artifacts/applets/`
- Standalone micro-applications (visualizers, interactive demos).
- **Pattern**: `src/artifacts/applets/[NAME]/index.html`.
- **Build Logic**: The Vite build `rollupOptions` automatically discovers all HTML entries in this directory and outputs them into three parallel trees: `src/`, `assets/`, and `shared/`.

## Toolchain & Standards
- **Build Tool**: Vite 7+ (MPA configuration).
- **Libraries**: SolidJS, D3.js, MotionOne.
- **Styling**: Vanilla CSS with project-specific naming conventions.
- **Persistence**: IndexedDB via `idb`.

## Development Lessons
- **Process Management**: Use `npx vite` directly instead of `npm run dev` to ensure clean process termination when the agent stops. Avoids orphans caused by `npm` shell wrappers.
- **Port Discovery**: Always check the shell output for the assigned port (e.g., `5174` if `5173` is busy) rather than assuming a default.
