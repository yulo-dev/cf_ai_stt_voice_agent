import { Suspense, useCallback, useState, useEffect, useRef } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { isToolUIPart, getToolName } from "ai";
import type { UIMessage } from "ai";
import {
  Button,
  Badge,
  InputArea,
  Empty,
  Surface,
  Text,
} from "@cloudflare/kumo";
import { Toasty } from "@cloudflare/kumo/components/toast";
import { Streamdown } from "streamdown";
import {
  PaperPlaneRightIcon,
  StopIcon,
  TrashIcon,
  GearIcon,
  ChatCircleDotsIcon,
  CircleIcon,
  MicrophoneIcon,
  StopCircleIcon,
  NotepadIcon,
  ExportIcon,
  TagIcon,
} from "@phosphor-icons/react";

// ── Types ──

interface Note {
  id: string;
  timestamp: string;
  rawTranscript: string;
  structuredNote: string;
  tags: string[];
}

interface AgentState {
  notes: Note[];
  sessionName: string;
  createdAt: string;
}

// ── Voice Hook ──

function useVoiceInput() {
  const [isListening, setIsListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recognitionRef = useRef<any>(null);
  const onResultRef = useRef<(transcript: string) => void>(() => {});

  useEffect(() => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let interimText = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += t;
        else interimText += t;
      }
      setInterim(interimText);
      if (finalText.trim()) onResultRef.current(finalText.trim());
    };

    recognition.onerror = (e: any) => {
      if (e.error !== "no-speech") setIsListening(false);
    };

    recognition.onend = () => {
      if (recognitionRef.current?._keepAlive) {
        try { recognition.start(); } catch {}
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    return () => recognition.stop();
  }, []);

  const start = useCallback((onResult: (t: string) => void) => {
    if (!recognitionRef.current) return;
    onResultRef.current = onResult;
    recognitionRef.current._keepAlive = true;
    try { recognitionRef.current.start(); setIsListening(true); setInterim(""); } catch {}
  }, []);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    recognitionRef.current._keepAlive = false;
    recognitionRef.current.stop();
    setIsListening(false);
    setInterim("");
  }, []);

  const supported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  return { isListening, interim, start, stop, supported };
}

// ── Tag colors ──

const TAG_COLORS: Record<string, string> = {
  observation: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  telemetry: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  anomaly: "bg-red-500/15 text-red-400 border-red-500/30",
  procedure: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "action-item": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  measurement: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  status: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  config: "bg-pink-500/15 text-pink-400 border-pink-500/30",
};

// ── Tool rendering ──

function ToolPartView({ part }: { part: UIMessage["parts"][number] }) {
  if (!isToolUIPart(part)) return null;
  const toolName = getToolName(part);

  if (part.state === "output-available") {
    return (
      <div className="flex justify-start">
        <Surface className="max-w-[85%] px-4 py-2.5 rounded-xl ring ring-kumo-line">
          <div className="flex items-center gap-2 mb-1">
            <GearIcon size={14} className="text-kumo-inactive" />
            <Text size="xs" variant="secondary" bold>{toolName}</Text>
            <Badge variant="secondary">Done</Badge>
          </div>
          <div className="font-mono">
            <Text size="xs" variant="secondary">
              {JSON.stringify(part.output, null, 2)}
            </Text>
          </div>
        </Surface>
      </div>
    );
  }

  if (part.state === "input-available" || part.state === "input-streaming") {
    return (
      <div className="flex justify-start">
        <Surface className="max-w-[85%] px-4 py-2.5 rounded-xl ring ring-kumo-line">
          <div className="flex items-center gap-2">
            <GearIcon size={14} className="text-kumo-inactive animate-spin" />
            <Text size="xs" variant="secondary">Running {toolName}...</Text>
          </div>
        </Surface>
      </div>
    );
  }

  return null;
}

// ── Note Card ──

function NoteCard({ note }: { note: Note }) {
  const time = new Date(note.timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  return (
    <Surface className="px-4 py-3 rounded-xl ring ring-kumo-line space-y-2">
      <div className="flex items-center justify-between">
        <Text size="xs" variant="secondary" bold className="font-mono">{time}</Text>
        <div className="flex gap-1 flex-wrap">
          {note.tags.map((tag) => (
            <span
              key={tag}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium uppercase tracking-wider border ${TAG_COLORS[tag] || "bg-gray-500/15 text-gray-400 border-gray-500/30"}`}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
      <Text size="sm" className="leading-relaxed">{note.structuredNote}</Text>
      <div className="pt-2 border-t border-kumo-line">
        <Text size="xs" variant="secondary" className="italic">
          <span className="font-mono not-italic text-[10px] tracking-wider opacity-60 mr-1">VOICE ›</span>
          {note.rawTranscript}
        </Text>
      </div>
    </Surface>
  );
}

// ── Main Chat ──

function Chat() {
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [agentState, setAgentState] = useState<AgentState>({
    notes: [], sessionName: "Untitled Session", createdAt: new Date().toISOString(),
  });

  const agent = useAgent({
    agent: "ChatAgent",
    onOpen: useCallback(() => setConnected(true), []),
    onClose: useCallback(() => setConnected(false), []),
    onError: useCallback((e: Event) => console.error("WS error:", e), []),
    onStateUpdate: useCallback((state: AgentState) => setAgentState(state), []),
  });

  const { messages, sendMessage, clearHistory, stop, status } = useAgentChat({ agent });

  const isStreaming = status === "streaming" || status === "submitted";
  const voice = useVoiceInput();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!isStreaming && textareaRef.current) textareaRef.current.focus();
  }, [isStreaming]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    sendMessage({ role: "user", parts: [{ type: "text", text }] });
  }, [input, isStreaming, sendMessage]);

  const handleVoiceResult = useCallback(
    (transcript: string) => {
      const msg = `[Voice Transcript] ${transcript}`;
      sendMessage({ role: "user", parts: [{ type: "text", text: msg }] });
    },
    [sendMessage]
  );

  const toggleVoice = () => {
    if (voice.isListening) voice.stop();
    else voice.start(handleVoiceResult);
  };

  return (
    <div className="flex h-screen bg-kumo-elevated">
      {/* ── Chat Panel ── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="px-5 py-4 bg-kumo-base border-b border-kumo-line">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-kumo-default">
                <span className="mr-2">◆</span>STT Voice Agent
              </h1>
              <Badge variant="secondary">
                <MicrophoneIcon size={12} weight="bold" className="mr-1" />
                Voice-to-Notes
              </Badge>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <CircleIcon
                  size={8} weight="fill"
                  className={connected ? "text-kumo-success" : "text-kumo-danger"}
                />
                <Text size="xs" variant="secondary">
                  {connected ? "Connected" : "Disconnected"}
                </Text>
              </div>
              {voice.isListening && (
                <Badge variant="destructive">
                  <span className="animate-pulse mr-1">●</span> LIVE
                </Badge>
              )}
              <Button variant="secondary" icon={<TrashIcon size={16} />} onClick={clearHistory}>
                Clear
              </Button>
            </div>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-5 py-6 space-y-5">
            {messages.length === 0 && (
              <Empty
                icon={<MicrophoneIcon size={32} />}
                title="Ready for input"
                contents={
                  <div className="space-y-3 text-center">
                    <Text size="sm" variant="secondary">
                      Press the microphone to record operator speech, or type a message.
                      The agent will generate structured engineering notes automatically.
                    </Text>
                    <div className="flex flex-wrap justify-center gap-2">
                      {[
                        "[Voice Transcript] The rover voltage reads 32.5 volts, looks nominal",
                        "[Voice Transcript] Noticed intermittent signal drop on channel 4 during traverse",
                        "Export all notes",
                        "Rename session to Mars Rover Test 7",
                      ].map((prompt) => (
                        <Button key={prompt} variant="outline" size="sm" disabled={isStreaming}
                          onClick={() => sendMessage({ role: "user", parts: [{ type: "text", text: prompt }] })}>
                          {prompt.length > 50 ? prompt.slice(0, 50) + "..." : prompt}
                        </Button>
                      ))}
                    </div>
                  </div>
                }
              />
            )}

            {messages.map((message: UIMessage, index: number) => {
              const isUser = message.role === "user";
              const isLastAssistant = message.role === "assistant" && index === messages.length - 1;

              return (
                <div key={message.id} className="space-y-2">
                  {message.parts.filter(isToolUIPart).map((part) => (
                    <ToolPartView key={part.toolCallId} part={part} />
                  ))}

                  {message.parts
                    .filter((part) => part.type === "text")
                    .map((part, i) => {
                      const text = (part as { type: "text"; text: string }).text;
                      if (!text) return null;

                      if (isUser) {
                        const isVoice = text.startsWith("[Voice Transcript]");
                        return (
                          <div key={i} className="flex justify-end">
                            <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md leading-relaxed ${isVoice ? "bg-red-500/20 text-kumo-default border border-red-500/30" : "bg-kumo-contrast text-kumo-inverse"}`}>
                              {isVoice && (
                                <div className="flex items-center gap-1.5 mb-1">
                                  <MicrophoneIcon size={12} className="text-red-400" />
                                  <span className="text-[10px] font-mono font-medium text-red-400 uppercase tracking-wider">Voice</span>
                                </div>
                              )}
                              {isVoice ? text.replace("[Voice Transcript] ", "") : text}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={i} className="flex justify-start">
                          <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-kumo-base text-kumo-default leading-relaxed">
                            <Streamdown className="sd-theme rounded-2xl rounded-bl-md p-3" controls={false} isAnimating={isLastAssistant && isStreaming}>
                              {text}
                            </Streamdown>
                          </div>
                        </div>
                      );
                    })}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Interim voice */}
        {voice.interim && (
          <div className="px-5 py-2 bg-kumo-base border-t border-kumo-line">
            <div className="flex items-center gap-2">
              <span className="animate-pulse text-amber-400">●</span>
              <Text size="xs" variant="secondary" className="italic">{voice.interim}</Text>
            </div>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-kumo-line bg-kumo-base">
          <form ref={formRef} onSubmit={(e) => { e.preventDefault(); send(); }} className="max-w-3xl mx-auto px-5 py-4">
            <div className="flex items-end gap-3 rounded-xl border border-kumo-line bg-kumo-base p-3 shadow-sm focus-within:ring-2 focus-within:ring-kumo-ring focus-within:border-transparent transition-shadow">
              {/* Voice button */}
              <Button
                type="button"
                variant={voice.isListening ? "destructive" : "secondary"}
                shape="square"
                aria-label={voice.isListening ? "Stop recording" : "Start recording"}
                icon={voice.isListening ? <StopCircleIcon size={18} /> : <MicrophoneIcon size={18} />}
                onClick={toggleVoice}
                disabled={!voice.supported}
                className="mb-0.5"
              />

              <InputArea
                ref={textareaRef}
                value={input}
                onValueChange={setInput}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                placeholder={voice.isListening ? "Listening... speak now" : "Type a message or press mic to speak..."}
                disabled={!connected || isStreaming}
                rows={1}
                className="flex-1 ring-0! focus:ring-0! shadow-none! bg-transparent! outline-none! resize-none max-h-40"
              />

              {isStreaming ? (
                <Button type="button" variant="secondary" shape="square" aria-label="Stop" icon={<StopIcon size={18} />} onClick={stop} className="mb-0.5" />
              ) : (
                <Button type="submit" variant="primary" shape="square" aria-label="Send" disabled={!input.trim() || !connected} icon={<PaperPlaneRightIcon size={18} />} className="mb-0.5" />
              )}
            </div>
          </form>
        </div>
      </div>

      {/* ── Notes Panel ── */}
      <div className="w-96 border-l border-kumo-line bg-kumo-base flex flex-col shrink-0">
        {/* Notes Header */}
        <div className="px-4 py-4 border-b border-kumo-line">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <NotepadIcon size={16} className="text-kumo-accent" />
              <Text size="sm" bold>Engineering Log</Text>
              {agentState.notes.length > 0 && (
                <Badge variant="secondary">{agentState.notes.length}</Badge>
              )}
            </div>
            {agentState.notes.length > 0 && (
              <Button variant="secondary" size="sm" icon={<ExportIcon size={14} />}
                onClick={() => sendMessage({ role: "user", parts: [{ type: "text", text: "Export all notes in markdown format" }] })}>
                Export
              </Button>
            )}
          </div>
          <Text size="xs" variant="secondary" className="mt-1 font-mono">
            {agentState.sessionName}
          </Text>
        </div>

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {agentState.notes.length === 0 ? (
            <Empty
              icon={<NotepadIcon size={28} />}
              title="No notes yet"
              contents={
                <Text size="xs" variant="secondary">
                  Notes will appear here as the agent processes operator speech.
                </Text>
              }
            />
          ) : (
            [...agentState.notes].reverse().map((note) => (
              <NoteCard key={note.id} note={note} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Toasty>
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-screen text-kumo-inactive">
            Loading...
          </div>
        }
      >
        <Chat />
      </Suspense>
    </Toasty>
  );
}
