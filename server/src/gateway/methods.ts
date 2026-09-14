import {
  appendMessage,
  createSession,
  deleteSession,
  getSession,
  listSessions,
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

export function handleChatSend(params: unknown):
  | { ok: true; payload: { message: unknown; sessionId: string } }
  | { ok: false; error: { code: string; message: string } } {
  if (!params || typeof params !== "object") {
    return { ok: false, error: { code: "INVALID_REQUEST", message: "params required" } };
  }
  const p = params as { sessionId?: unknown; role?: unknown; text?: unknown };
  const sessionId = typeof p.sessionId === "string" ? p.sessionId.trim() : "";
  if (!sessionId) {
    return { ok: false, error: { code: "INVALID_REQUEST", message: "sessionId required" } };
  }

  const result = appendMessage(sessionId, {
    role: typeof p.role === "string" ? p.role : undefined,
    text: typeof p.text === "string" ? p.text : undefined,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    payload: { message: result.message, sessionId },
  };
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
