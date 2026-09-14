import { randomUUID } from "node:crypto";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  ts: number;
};

export type Session = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
};

export type SessionSummary = Omit<Session, "messages">;

const store = new Map<string, Session>();

export function createSession(title?: string): Session {
  const now = Date.now();
  const session: Session = {
    id: randomUUID(),
    title: title?.trim() || "untitled",
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  store.set(session.id, session);
  return session;
}

export function getSession(id: string): Session | null {
  return store.get(id) ?? null;
}

export function listSessions(): SessionSummary[] {
  return [...store.values()]
    .map(({ messages: _messages, ...rest }) => rest)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteSession(id: string): boolean {
  return store.delete(id);
}

export function appendMessage(
  sessionId: string,
  input: { role?: string; text?: string },
):
  | { ok: true; session: Session; message: ChatMessage }
  | { ok: false; error: { code: string; message: string } } {
  const session = store.get(sessionId);
  if (!session) {
    return { ok: false, error: { code: "NOT_FOUND", message: "session not found" } };
  }

  const text = input.text?.trim() ?? "";
  if (!text) {
    return { ok: false, error: { code: "INVALID_REQUEST", message: "text required" } };
  }

  const role =
    input.role === "assistant" || input.role === "system" ? input.role : "user";

  const message: ChatMessage = {
    id: randomUUID(),
    role,
    text,
    ts: Date.now(),
  };
  session.messages.push(message);
  session.updatedAt = message.ts;
  return { ok: true, session, message };
}
