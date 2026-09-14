import { randomUUID } from "node:crypto";

export type Session = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

const store = new Map<string, Session>();

export function createSession(title?: string): Session {
  const now = Date.now();
  const session: Session = {
    id: randomUUID(),
    title: title?.trim() || "untitled",
    createdAt: now,
    updatedAt: now,
  };
  store.set(session.id, session);
  return session;
}

export function getSession(id: string): Session | null {
  return store.get(id) ?? null;
}

export function listSessions(): Session[] {
  return [...store.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteSession(id: string): boolean {
  return store.delete(id);
}
