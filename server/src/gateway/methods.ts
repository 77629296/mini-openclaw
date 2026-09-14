import {
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
  return { session: createSession(title) };
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

function readId(params: unknown): string | null {
  if (!params || typeof params !== "object") return null;
  const id = (params as { id?: unknown }).id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}
