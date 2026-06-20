import { randomUUID } from 'node:crypto';
import type { ConnectClientInfo, ConnectParams } from '../protocol/types.js';

export interface GatewaySession {
  connId: string;
  handshakeComplete: boolean;
  role: 'operator' | 'node';
  scopes: string[];
  client?: ConnectClientInfo;
  eventSeq: number;
}

export function createSession(): GatewaySession {
  return {
    connId: randomUUID(),
    handshakeComplete: false,
    role: 'operator',
    scopes: [],
    eventSeq: 0,
  };
}

export function applyConnect(session: GatewaySession, params: ConnectParams): void {
  session.handshakeComplete = true;
  session.role = params.role;
  session.scopes =
    params.scopes ??
    (params.role === 'operator'
      ? ['operator.read', 'operator.write']
      : []);
  session.client = params.client;
}

export function nextEventSeq(session: GatewaySession): number {
  session.eventSeq += 1;
  return session.eventSeq;
}
