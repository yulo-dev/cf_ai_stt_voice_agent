import { createWorkersAI } from "workers-ai-provider";
import { routeAgentRequest } from "agents";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  streamText,
  convertToModelMessages,
  pruneMessages,
  tool,
  stepCountIs,
} from "ai";
import { z } from "zod";

// ── Types ──

interface Note {
  id: string;
  timestamp: string;
  rawTranscript: string;
  structuredNote: string;
  tags: string[];
}

// ── System Prompt ──

const SYSTEM_PROMPT = `You are an AI-powered voice-to-structured-notes assistant for engineering operations.

Your role:
- Process operator voice transcripts and generate structured, concise engineering notes
- Extract key observations, measurements, anomalies, and action items
- Tag notes with relevant categories
- Help operators manage and export their session notes

When a user sends a message that contains "[Voice Transcript]", it is speech captured from the operator's microphone. You MUST:
1. Use the save_note tool to create a structured note from it
2. Respond briefly confirming what was captured

When the user sends a normal text message, respond conversationally and helpfully.

Keep notes technical, precise, and actionable. Preserve exact measurements and values mentioned.`;

// ── Agent ──

export class ChatAgent extends AIChatAgent<Env> {
  initialState = {
    notes: [] as Note[],
    sessionName: "Untitled Session",
    createdAt: new Date().toISOString(),
  };

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const workersai = createWorkersAI({ binding: this.env.AI });
    const self = this;

    const result = streamText({
      model: workersai("@cf/zai-org/glm-4.7-flash"),
      system: SYSTEM_PROMPT,
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages",
      }),
      tools: {
        save_note: tool({
          description:
            "Save a structured engineering note from an operator voice transcript. Use this whenever the user provides speech/transcript that should be documented.",
          inputSchema: z.object({
            rawTranscript: z.string().describe("The original voice transcript"),
            structuredNote: z.string().describe("A structured, concise engineering note derived from the transcript"),
            tags: z.array(z.string()).describe("Relevant tags: observation, telemetry, anomaly, procedure, action-item, measurement, status, config"),
          }),
          execute: async ({ rawTranscript, structuredNote, tags }) => {
            const note: Note = {
              id: `note-${Date.now()}`,
              timestamp: new Date().toISOString(),
              rawTranscript,
              structuredNote,
              tags,
            };
            const currentState = (self.state as any) || { notes: [], sessionName: "Untitled Session", createdAt: new Date().toISOString() };
            const notes = [...(currentState.notes || []), note];
            self.setState({ ...currentState, notes });
            return {
              success: true,
              noteId: note.id,
              message: `Note saved. Session now has ${notes.length} note(s).`,
            };
          },
        }),

        list_notes: tool({
          description: "List all notes in the current session",
          inputSchema: z.object({}),
          execute: async () => {
            const currentState = (self.state as any) || { notes: [] };
            const notes = currentState.notes || [];
            return {
              count: notes.length,
              notes: notes.map((n: Note) => ({
                id: n.id,
                timestamp: n.timestamp,
                preview: n.structuredNote.slice(0, 100),
                tags: n.tags,
              })),
            };
          },
        }),

        export_notes: tool({
          description: "Export all session notes as a formatted engineering log",
          inputSchema: z.object({
            format: z.enum(["markdown", "plain"]).describe("Export format").default("markdown"),
          }),
          execute: async ({ format }) => {
            const currentState = (self.state as any) || { notes: [], sessionName: "Untitled Session", createdAt: new Date().toISOString() };
            const notes: Note[] = currentState.notes || [];
            if (notes.length === 0) {
              return { content: "No notes in this session." };
            }
            const lines = notes.map((n, i) => {
              const time = new Date(n.timestamp).toLocaleTimeString();
              const tags = n.tags.map((t) => `[${t}]`).join(" ");
              if (format === "markdown") {
                return `### Note ${i + 1} — ${time}\n${tags}\n\n${n.structuredNote}\n\n> _Original: "${n.rawTranscript}"_`;
              }
              return `--- Note ${i + 1} (${time}) ${tags} ---\n${n.structuredNote}\nOriginal: "${n.rawTranscript}"`;
            });
            const header =
              format === "markdown"
                ? `# Engineering Log\n**Session:** ${currentState.sessionName}\n**Date:** ${currentState.createdAt}\n\n---\n\n`
                : `ENGINEERING LOG\nSession: ${currentState.sessionName}\nDate: ${currentState.createdAt}\n${"=".repeat(50)}\n\n`;
            return { content: header + lines.join("\n\n") };
          },
        }),

        rename_session: tool({
          description: "Rename the current session",
          inputSchema: z.object({
            name: z.string().describe("New session name"),
          }),
          execute: async ({ name }) => {
            const currentState = (self.state as any) || {};
            self.setState({ ...currentState, sessionName: name });
            return { success: true, sessionName: name };
          },
        }),

        delete_note: tool({
          description: "Delete a specific note by ID",
          inputSchema: z.object({
            noteId: z.string().describe("The note ID to delete"),
          }),
          execute: async ({ noteId }) => {
            const currentState = (self.state as any) || { notes: [] };
            const notes: Note[] = currentState.notes || [];
            const filtered = notes.filter((n) => n.id !== noteId);
            if (filtered.length === notes.length) {
              return { success: false, message: "Note not found" };
            }
            self.setState({ ...currentState, notes: filtered });
            return {
              success: true,
              message: `Deleted note ${noteId}. ${filtered.length} note(s) remaining.`,
            };
          },
        }),
      },
      stopWhen: stepCountIs(5),
      abortSignal: options?.abortSignal,
    });

    return result.toUIMessageStreamResponse();
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
