import type { GatewaySession } from './session.js';

/**
 * In-memory session registry — tracks all active gateway sessions.
 */
const sessions = new Map<string, GatewaySession>();

export function registerSession(session: GatewaySession): void {
  sessions.set(session.connId, session);
}

export function unregisterSession(connId: string): void {
  sessions.delete(connId);
}

export function getSession(connId: string): GatewaySession | undefined {
  return sessions.get(connId);
}

export function listSessions(): { connId: string; role: string; scopes: string[]; connectedAt: number }[] {
  return Array.from(sessions.values()).map((s) => ({
    connId: s.connId,
    role: s.role,
    scopes: s.scopes,
    connectedAt: s.connectedAt,
  }));
}

export function getActiveSessionCount(): number {
  return sessions.size;
}
