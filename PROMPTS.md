# AI Prompts Used

This document records the AI-assisted development process for this project. Built with Claude (Anthropic) as the primary AI coding assistant.

## Project Scaffolding

**Prompt:**
> I need to build an AI-powered voice-to-structured-notes agent on Cloudflare's stack (Agents SDK, Workers AI, Durable Objects) as a TypeScript project. The agent should take voice input from operators, transcribe it via the browser's Web Speech API, send it to an LLM, and generate structured engineering notes with tags. It needs a two-panel UI: chat on the left, notes log on the right.

**What AI generated:**
- Project structure based on the `cloudflare/agents-starter` template
- Dependency list and configuration files

## Agent Implementation (`src/server.ts`)

**Prompt:**
> Create the ChatAgent class extending AIChatAgent. It should use Workers AI for streaming chat. Include tools for: save_note (extract structured notes from voice transcripts with tags like observation, telemetry, anomaly, action-item), list_notes, export_notes (markdown/plain), rename_session, delete_note. State should track a notes array, session name, and creation time. The system prompt should instruct the LLM to act as an engineering notes assistant that processes voice transcripts.

**What AI generated:**
- `ChatAgent` class with `initialState` and `onChatMessage`
- 5 tools with Zod input schemas
- System prompt for engineering notes context
- State management via `this.setState` for real-time sync to connected clients

## Frontend (`src/app.tsx`)

**Prompt:**
> Modify the starter's React frontend to add: (1) a custom useVoiceInput hook wrapping Web Speech API with continuous listening and interim results, (2) a right-side notes panel showing structured notes with colored tag badges, (3) voice messages styled differently from text messages with a microphone icon and "VOICE" label, (4) a microphone button in the input bar. Keep using the starter's Kumo UI components and Streamdown for markdown rendering.

**What AI generated:**
- `useVoiceInput` custom hook (start/stop/interim/supported)
- Two-panel layout: chat panel + Engineering Log panel
- `NoteCard` component with tag color mapping
- Voice transcript detection and styling
- Real-time state sync via `useAgent` `onStateUpdate`

## Iterative Debugging

**Prompts used during debugging:**
- "The LLM is outputting tool call JSON as text instead of executing the tool. How do I fix this?" → Switched from `llama-3.3-70b-instruct-fp8-fast` to `glm-4.7-flash` which has proper tool call support on Workers AI
- "Notes are not appearing in the right panel even though tool calls show as Done" → Fixed state management to use `self.state as any` pattern compatible with the base `AIChatAgent` class
- "How do I remove all references to a specific project name from the codebase?" → Search-and-replace across server.ts and app.tsx

## Tools Used

- **Claude (Anthropic)** — Primary AI coding assistant for all code generation and debugging
- **Cloudflare Agents SDK starter template** — Base project scaffold
- **Cloudflare docs** — Referenced for Workers AI model availability and Durable Object patterns
