import { randomUUID } from "node:crypto";
import { broadcastEvent } from "./clients.js";
import {
  appendMessage,
  createSession,
  deleteSession,
  getSession,
  listSessions,
  patchSession,
  type SessionSummary,
} from "./sessions.js";

export function handleHealth() {
  return {
    ok: true,
    uptimeMs: Math.floor(process.uptime() * 1000),
    ts: Date.now(),
  };
}

export function handleStatus(info: {
  connId: string;
  role: string | null;
  scopes: string[];
  protocol: number;
}) {
  return {
    protocol: info.protocol,
    connId: info.connId,
    role: info.role,
    scopes: info.scopes,
    uptimeMs: Math.floor(process.uptime() * 1000),
    ts: Date.now(),
  };
}

export function handleSessionsCreate(params: unknown) {
  const title =
    params && typeof params === "object" && "title" in params
      ? String((params as { title?: unknown }).title ?? "")
      : undefined;
  const session = createSession(title);
  const { messages: _messages, ...summary } = session;
  return { session: summary };
}

export function handleSessionsList() {
  return { sessions: listSessions() };
}

export function handleSessionsGet(params: unknown):
  | { ok: true; payload: { session: NonNullable<ReturnType<typeof getSession>> } }
  | { ok: false; error: { code: string; message: string } } {
  const id = readId(params);
  if (!id) {
    return { ok: false, error: { code: "INVALID_REQUEST", message: "session id required" } };
  }
  const session = getSession(id);
  if (!session) {
    return { ok: false, error: { code: "NOT_FOUND", message: "session not found" } };
  }
  return { ok: true, payload: { session } };
}

export function handleSessionsDelete(params: unknown):
  | { ok: true; payload: { deleted: true; id: string } }
  | { ok: false; error: { code: string; message: string } } {
  const id = readId(params);
  if (!id) {
    return { ok: false, error: { code: "INVALID_REQUEST", message: "session id required" } };
  }
  if (!deleteSession(id)) {
    return { ok: false, error: { code: "NOT_FOUND", message: "session not found" } };
  }
  return { ok: true, payload: { deleted: true, id } };
}

export function handleSessionsPatch(params: unknown):
  | { ok: true; payload: { session: SessionSummary } }
  | { ok: false; error: { code: string; message: string } } {
  const id = readId(params);
  if (!id) {
    return { ok: false, error: { code: "INVALID_REQUEST", message: "session id required" } };
  }
  if (!params || typeof params !== "object") {
    return { ok: false, error: { code: "INVALID_REQUEST", message: "params required" } };
  }
  const title = (params as { title?: unknown }).title;
  if (typeof title !== "string") {
    return { ok: false, error: { code: "INVALID_REQUEST", message: "title required" } };
  }

  const result = patchSession(id, { title });
  if (!result.ok) return result;
  const { messages: _messages, ...summary } = result.session;
  return { ok: true, payload: { session: summary } };
}

export function handleChatSend(params: unknown):
  | {
      ok: true;
      payload: {
        sessionId: string;
        message: unknown;
        reply: unknown;
      };
    }
  | { ok: false; error: { code: string; message: string } } {
  if (!params || typeof params !== "object") {
    return { ok: false, error: { code: "INVALID_REQUEST", message: "params required" } };
  }
  const p = params as { sessionId?: unknown; role?: unknown; text?: unknown };
  const sessionId = typeof p.sessionId === "string" ? p.sessionId.trim() : "";
  if (!sessionId) {
    return { ok: false, error: { code: "INVALID_REQUEST", message: "sessionId required" } };
  }

  const role = typeof p.role === "string" ? p.role : "user";
  const text = typeof p.text === "string" ? p.text : undefined;

  const result = appendMessage(sessionId, { role, text });
  if (!result.ok) return result;

  // assistant reply is streamed by the connection layer
  return {
    ok: true,
    payload: { sessionId, message: result.message, reply: null },
  };
}

type ActiveRun = { sessionId: string; aborted: boolean; parts: string[] };

const runsById = new Map<string, ActiveRun>();
const runBySession = new Map<string, string>();

export function hasActiveRun(sessionId: string): boolean {
  return runBySession.has(sessionId);
}

export function handleChatAbort(params: unknown):
  | { ok: true; payload: { runId: string; sessionId: string; aborted: true } }
  | { ok: false; error: { code: string; message: string } } {
  if (!params || typeof params !== "object") {
    return { ok: false, error: { code: "INVALID_REQUEST", message: "params required" } };
  }
  const p = params as { runId?: unknown; sessionId?: unknown };
  let runId = typeof p.runId === "string" ? p.runId.trim() : "";
  if (!runId) {
    const sessionId = typeof p.sessionId === "string" ? p.sessionId.trim() : "";
    if (!sessionId) {
      return {
        ok: false,
        error: { code: "INVALID_REQUEST", message: "runId or sessionId required" },
      };
    }
    runId = runBySession.get(sessionId) ?? "";
  }
  const run = runId ? runsById.get(runId) : undefined;
  if (!run) {
    return { ok: false, error: { code: "NOT_FOUND", message: "no active run" } };
  }
  run.aborted = true;
  return { ok: true, payload: { runId, sessionId: run.sessionId, aborted: true } };
}

/** Register a run and return runId immediately; deltas + final chat ride events. */
export function startStubReply(
  sessionId: string,
  userText: string,
):
  | { ok: true; runId: string }
  | { ok: false; error: { code: string; message: string } } {
  if (runBySession.has(sessionId)) {
    return {
      ok: false,
      error: { code: "BUSY", message: "session already has an active run" },
    };
  }
  const runId = randomUUID();
  const run: ActiveRun = { sessionId, aborted: false, parts: [] };
  runsById.set(runId, run);
  runBySession.set(sessionId, runId);
  void runStubReply(runId, run, userText);
  return { ok: true, runId };
}

async function runStubReply(
  runId: string,
  run: ActiveRun,
  userText: string,
): Promise<void> {
  const { sessionId } = run;
  const full = `echo: ${userText}`;

  try {
    const chunks = chunkText(full, 4);
    for (const text of chunks) {
      if (run.aborted) break;
      run.parts.push(text);
      broadcastEvent({
        type: "event",
        event: "chat.delta",
        payload: { sessionId, runId, text },
      });
      await sleep(40);
    }

    if (run.aborted) {
      const partial = run.parts.join("");
      if (!partial) {
        broadcastEvent({
          type: "event",
          event: "chat",
          payload: { sessionId, runId, aborted: true },
        });
        return;
      }
      const saved = appendMessage(sessionId, {
        role: "assistant",
        text: partial,
      });
      if (saved.ok) {
        broadcastEvent({
          type: "event",
          event: "chat",
          payload: { sessionId, runId, message: saved.message },
        });
      }
      return;
    }

    const echoed = appendMessage(sessionId, {
      role: "assistant",
      text: full,
    });
    if (echoed.ok) {
      broadcastEvent({
        type: "event",
        event: "chat",
        payload: { sessionId, runId, message: echoed.message },
      });
    }
  } finally {
    if (runBySession.get(sessionId) === runId) runBySession.delete(sessionId);
    runsById.delete(runId);
  }
}

export function handleChatHistory(params: unknown):
  | { ok: true; payload: { sessionId: string; messages: unknown[] } }
  | { ok: false; error: { code: string; message: string } } {
  const sessionId = readSessionId(params);
  if (!sessionId) {
    return { ok: false, error: { code: "INVALID_REQUEST", message: "sessionId required" } };
  }
  const session = getSession(sessionId);
  if (!session) {
    return { ok: false, error: { code: "NOT_FOUND", message: "session not found" } };
  }
  return {
    ok: true,
    payload: { sessionId, messages: session.messages },
  };
}

function readId(params: unknown): string | null {
  if (!params || typeof params !== "object") return null;
  const id = (params as { id?: unknown }).id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function readSessionId(params: unknown): string | null {
  if (!params || typeof params !== "object") return null;
  const id = (params as { sessionId?: unknown }).sessionId;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function chunkText(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    out.push(text.slice(i, i + size));
  }
  return out.length ? out : [""];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
