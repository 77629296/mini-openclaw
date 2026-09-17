import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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

let dataPath: string | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function configureSessions(filePath: string): void {
  dataPath = filePath;
}

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
  scheduleSave();
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
  const ok = store.delete(id);
  if (ok) scheduleSave();
  return ok;
}

export function patchSession(
  id: string,
  patch: { title?: string },
):
  | { ok: true; session: Session }
  | { ok: false; error: { code: string; message: string } } {
  const session = store.get(id);
  if (!session) {
    return { ok: false, error: { code: "NOT_FOUND", message: "session not found" } };
  }

  if (typeof patch.title === "string") {
    const title = patch.title.trim();
    if (!title) {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "title required" } };
    }
    session.title = title;
    session.updatedAt = Date.now();
    scheduleSave();
  }

  return { ok: true, session };
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
  scheduleSave();
  return { ok: true, session, message };
}

export async function loadSessions(): Promise<number> {
  if (!dataPath) return 0;
  let raw: string;
  try {
    raw = await readFile(dataPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(`sessions file corrupt, starting empty: ${dataPath}`);
    return 0;
  }

  const list = readSessionList(parsed);
  store.clear();
  for (const session of list) {
    store.set(session.id, session);
  }
  return store.size;
}

export async function flushSessions(): Promise<void> {
  if (!dataPath) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const file = dataPath;
  await mkdir(path.dirname(file), { recursive: true });
  const body = JSON.stringify({ sessions: [...store.values()] }, null, 2);
  await writeFile(file, body, "utf8");
}

function scheduleSave(): void {
  if (!dataPath) return;
  if (saveTimer) clearTimeout(saveTimer);
  // coalesce bursts (send + echo) into one write
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushSessions().catch((err) => {
      console.error("sessions save failed:", err);
    });
  }, 40);
}

function readSessionList(parsed: unknown): Session[] {
  if (!parsed || typeof parsed !== "object") return [];
  const sessions = (parsed as { sessions?: unknown }).sessions;
  if (!Array.isArray(sessions)) return [];

  const out: Session[] = [];
  for (const item of sessions) {
    const session = normalizeSession(item);
    if (session) out.push(session);
  }
  return out;
}

function normalizeSession(item: unknown): Session | null {
  if (!item || typeof item !== "object") return null;
  const s = item as Record<string, unknown>;
  if (typeof s.id !== "string" || !s.id.trim()) return null;
  if (typeof s.title !== "string") return null;
  if (typeof s.createdAt !== "number" || typeof s.updatedAt !== "number") return null;

  const messages: ChatMessage[] = [];
  if (Array.isArray(s.messages)) {
    for (const m of s.messages) {
      const msg = normalizeMessage(m);
      if (msg) messages.push(msg);
    }
  }

  return {
    id: s.id,
    title: s.title.trim() || "untitled",
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    messages,
  };
}

function normalizeMessage(item: unknown): ChatMessage | null {
  if (!item || typeof item !== "object") return null;
  const m = item as Record<string, unknown>;
  if (typeof m.id !== "string" || !m.id.trim()) return null;
  if (typeof m.text !== "string") return null;
  if (typeof m.ts !== "number") return null;
  const role =
    m.role === "assistant" || m.role === "system" || m.role === "user" ? m.role : null;
  if (!role) return null;
  return { id: m.id, role, text: m.text, ts: m.ts };
}
