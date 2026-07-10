import { randomUUID, timingSafeEqual } from 'node:crypto';
import {
  GATEWAY_EVENTS,
  GATEWAY_METHODS,
  PROTOCOL_VERSION,
  type ConnectParams,
  type EchoPayload,
  type EventFrame,
  type HealthPayload,
  type HelloOkPayload,
  type ListNodesPayload,
  type NodeInfo,
  type NodeStatusParams,
  type NodeStatusPayload,
  type PingPayload,
  type RegisterNodeParams,
  type RegisterNodePayload,
  type ResFrame,
  type SessionsPayload,
  type StatusPayload,
  type SystemLogEvent,
  type UpdateNodeStatusParams,
  type WhoamiPayload,
} from '../protocol/types.js';
import { ERR, ProtocolError } from '../protocol/errors.js';
import { assertConnectParams } from '../protocol/schema.js';
import type { GatewaySession } from './session.js';
import { applyConnect } from './session.js';
import { getConnectionCount, getUptime } from './state.js';
import { listSessions, getActiveSessionCount } from './session-registry.js';
import {
  registerNode,
  unregisterNode,
  getNode,
  listNodes,
  getOnlineNodes,
  getNodeCount,
  updateNodeStatus,
  touchNode,
} from './node-registry.js';

const SERVER_VERSION = '0.1.0';
const TICK_INTERVAL_MS = 15_000;
const MAX_PAYLOAD = 65_536;
const MAX_BUFFERED_BYTES = 131_072;

// Freeze static feature data to avoid repeated allocations and prevent tampering
const CONSTANT_FEATURES = Object.freeze({
  methods: Object.freeze([...GATEWAY_METHODS]),
  events: Object.freeze([...GATEWAY_EVENTS]),
});

/**
 * Constant-time string comparison to prevent timing attacks on tokens
 */
function safeCompareToken(input: string | undefined, target: string): boolean {
  if (!input) return false;
  const inputBuf = Buffer.from(input);
  const targetBuf = Buffer.from(target);
  if (inputBuf.length !== targetBuf.length) return false;
  return timingSafeEqual(inputBuf, targetBuf);
}

export function buildHealthPayload(): HealthPayload {
  return {
    ok: true,
    status: 'healthy',
    uptime: getUptime(),
    version: SERVER_VERSION,
    ts: Date.now(),
  };
}

export function handleConnect(
  params: unknown,
  session: GatewaySession,
): HelloOkPayload {
  // assertConnectParams already acts as a type guard, no need for extra 'as' cast
  assertConnectParams(params);
  const connectParams = params as ConnectParams;

  if (
    connectParams.minProtocol > PROTOCOL_VERSION ||
    connectParams.maxProtocol < PROTOCOL_VERSION
  ) {
    throw ERR.PROTOCOL_MISMATCH();
  }

  const envToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  // Use safe comparison to prevent timing attacks instead of strict equality
  if (envToken && !safeCompareToken(connectParams.auth?.token, envToken)) {
    throw ERR.AUTH_FAILED();
  }

  applyConnect(session, connectParams);

  return {
    type: 'hello-ok',
    protocol: PROTOCOL_VERSION,
    server: { version: SERVER_VERSION, connId: session.connId },
    features: CONSTANT_FEATURES,
    snapshot: { health: buildHealthPayload() },
    auth: { role: session.role, scopes: session.scopes },
    policy: {
      maxPayload: MAX_PAYLOAD,
      maxBufferedBytes: MAX_BUFFERED_BYTES,
      tickIntervalMs: TICK_INTERVAL_MS,
    },
  };
}

export function handleHealth(): HealthPayload {
  return buildHealthPayload();
}

export function handleStatus(session: GatewaySession): StatusPayload {
  return {
    gateway: {
      version: SERVER_VERSION,
      uptime: getUptime(),
      connId: session.connId,
    },
    connections: getConnectionCount(),
    protocol: PROTOCOL_VERSION,
    role: session.role,
    scopes: session.scopes,
  };
}

export function buildConnectChallenge(): EventFrame {
  return {
    type: 'event',
    event: 'connect.challenge',
    payload: { nonce: randomUUID(), ts: Date.now() },
  };
}

export function buildTickEvent(seq: number): EventFrame {
  return {
    type: 'event',
    event: 'tick',
    payload: { ts: Date.now() },
    seq,
  };
}

export function handleWhoami(_params: unknown, session: GatewaySession): WhoamiPayload {
  return {
    connId: session.connId,
    role: session.role,
    scopes: session.scopes,
    ...(session.client ? { client: session.client } : {}),
    protocol: PROTOCOL_VERSION,
    connectedAt: session.connectedAt,
  };
}

export function buildRes(id: string, ok: true, payload: unknown): ResFrame;
export function buildRes(id: string, ok: false, error: ProtocolError): ResFrame;
export function buildRes(
  id: string,
  ok: boolean,
  payloadOrError: unknown,
): ResFrame {
  if (ok) {
    return { type: 'res', id, ok: true, payload: payloadOrError };
  }
  
  const err =
    payloadOrError instanceof ProtocolError
      ? payloadOrError
      : ERR.INVALID_FRAME(payloadOrError instanceof Error ? payloadOrError.message : String(payloadOrError));
      
  return { type: 'res', id, ok: false, error: err.toResError() };
}

// --- system.* handlers ---

export function handlePing(params: unknown): PingPayload {
  const input = params as { echo?: string } | undefined;
  return {
    pong: true,
    ts: Date.now(),
    ...(input?.echo ? { echo: input.echo } : {}),
  };
}

export function handleEcho(params: unknown): EchoPayload {
  if (!params || typeof params !== 'object' || !('message' in (params as Record<string, unknown>))) {
    throw ERR.INVALID_FRAME('Echo requires a "message" parameter');
  }
  const { message } = params as { message: string };
  if (typeof message !== 'string') {
    throw ERR.INVALID_FRAME('Echo "message" must be a string');
  }
  return {
    message,
    length: message.length,
    reverse: message.split('').reverse().join(''),
  };
}

export function handleSessions(): SessionsPayload {
  return {
    count: getActiveSessionCount(),
    sessions: listSessions(),
  };
}

export function buildSystemLogEvent(
  level: SystemLogEvent['payload']['level'],
  message: string,
  source?: string,
): SystemLogEvent {
  const payload: SystemLogEvent['payload'] = {
    level,
    message,
    ts: Date.now(),
    ...(source !== undefined ? { source } : {}),
  };
  return {
    type: 'event',
    event: 'system.log',
    payload,
  };
}

// --- node management handlers ---

export function handleRegisterNode(
  params: unknown,
  session: GatewaySession,
): RegisterNodePayload {
  if (!params || typeof params !== 'object') {
    throw ERR.INVALID_FRAME('registerNode requires params');
  }
  const { name, version, platform, capabilities } = params as RegisterNodeParams;

  if (!name || typeof name !== 'string') {
    throw ERR.INVALID_FRAME('registerNode requires a name');
  }
  if (!version || typeof version !== 'string') {
    throw ERR.INVALID_FRAME('registerNode requires a version');
  }
  if (!platform || typeof platform !== 'string') {
    throw ERR.INVALID_FRAME('registerNode requires a platform');
  }

  const node = registerNode(
    session,
    name,
    version,
    platform,
    Array.isArray(capabilities) ? capabilities : []
  );

  return { ok: true, node };
}

export function handleListNode(): ListNodesPayload {
  const nodes = listNodes();
  return {
    count: getNodeCount(),
    nodes,
  };
}

export function handleNodeStatus(params: unknown): NodeStatusPayload {
  if (!params || typeof params !== 'object' || !('connId' in params)) {
    throw ERR.INVALID_FRAME('node.status requires connId');
  }
  const { connId } = params as NodeStatusParams;
  const node = getNode(connId) ?? null;
  return { node };
}

export function handleUpdateNodeStatus(
  params: unknown,
  session: GatewaySession,
): { ok: boolean; node: NodeInfo | null } {
  if (!params || typeof params !== 'object' || !('status' in params)) {
    throw ERR.INVALID_FRAME('node.update-status requires status');
  }
  const { status } = params as UpdateNodeStatusParams;
  if (!['online', 'busy', 'offline'].includes(status)) {
    throw ERR.INVALID_FRAME('Invalid status value');
  }

  updateNodeStatus(session.connId, status);
  touchNode(session.connId);

  return {
    ok: true,
    node: getNode(session.connId) ?? null,
  };
}
