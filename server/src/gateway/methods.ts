import { createSession, listSessions } from "./sessions.js";

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
