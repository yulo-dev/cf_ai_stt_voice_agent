# Speech-to-Text Voice Notes Agent 
 
AI-powered voice-to-structured-notes agent that converts live operator speech into structured, tagged engineering notes in real-time. Built on Cloudflare Workers AI, Agents SDK, and Durable Objects.

## Architecture 

```
Browser (Web Speech API)          Cloudflare Edge
┌──────────────────┐         ┌─────────────────────────┐
│  Voice Input     │   WS    │  Durable Object         │
│  ──────────────► ├────────►│  ┌───────────────────┐  │
│  Chat UI         │         │  │  ChatAgent         │  │
│  ◄────────────── │◄────────│  │  - LLM Chat       │  │
│  Notes Panel     │  state  │  │  - Tools           │  │
│  (real-time sync)│  sync   │  │  - State / Memory  │  │
└──────────────────┘         │  └───────┬───────────┘  │
                             │          │               │
                             │  ┌───────▼───────────┐  │
                             │  │  Workers AI        │  │
                             │  │  GLM-4 Flash       │  │
                             │  └───────────────────┘  │
                             └─────────────────────────┘
```

## Requirements Mapping

| Requirement | Implementation |
|---|---|
| **LLM** | Workers AI (GLM-4 Flash) — generates structured notes from voice transcripts via tool calls |
| **Workflow / Coordination** | Voice → browser STT → WebSocket → LLM tool call → note storage → state sync pipeline |
| **User Input (Voice + Chat)** | Web Speech API for voice capture; text chat input as fallback |
| **Memory / State** | Durable Object state — notes, session name, tags persist across reconnects and deploys |

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Login to Cloudflare (first time only, free account works)
npx wrangler login

# 3. Run locally
npm run dev

# 4. Open http://localhost:5173
```

## Deploy

```bash
npm run deploy
```

Your agent will be live at `https://cf-ai-stt-voice-agent.<your-subdomain>.workers.dev`

## How It Works

1. **Voice Input** — Click the microphone button to start recording. The Web Speech API transcribes speech in the browser.
2. **Agent Processing** — The transcript is sent to the agent via WebSocket. The LLM analyzes it and calls the `save_note` tool to create a structured note.
3. **Structured Notes** — The agent extracts observations, measurements, anomalies, and action items. Notes are tagged automatically (e.g. `observation`, `telemetry`, `anomaly`, `action-item`).
4. **Real-time Sync** — Notes appear instantly in the Engineering Log panel via Durable Object state sync.
5. **Persistence** — All notes survive page reloads, deploys, and hibernation.

## Agent Tools

| Tool | Description |
|---|---|
| `save_note` | Create a structured note from a voice transcript |
| `list_notes` | List all session notes |
| `export_notes` | Export full engineering log (markdown or plain text) |
| `rename_session` | Rename the current session |
| `delete_note` | Remove a note by ID |

## Stack

- **Runtime**: Cloudflare Workers + Durable Objects
- **AI**: Workers AI (GLM-4 Flash)
- **Framework**: Agents SDK + Vite
- **Frontend**: React + Web Speech API + Kumo UI
- **State**: Durable Object built-in state with real-time client sync
