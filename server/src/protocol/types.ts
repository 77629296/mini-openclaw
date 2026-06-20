/** Mini-OpenClaw Gateway Protocol v1 — aligned with OpenClaw framing */

export const PROTOCOL_VERSION = 1;

export const GATEWAY_METHODS = ['connect', 'health', 'status'] as const;
export const GATEWAY_EVENTS = ['connect.challenge', 'tick'] as const;

export type GatewayMethod = (typeof GATEWAY_METHODS)[number];
export type GatewayEvent = (typeof GATEWAY_EVENTS)[number];

// --- Frames ---

export interface ReqFrame {
  type: 'req';
  id: string;
  method: string;
  params?: unknown;
}

export interface ResFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: ResError;
}

export interface ResError {
  code: string;
  message: string;
  details?: unknown;
}

export interface EventFrame {
  type: 'event';
  event: string;
  payload?: unknown;
  seq?: number;
}

export type WireFrame = ReqFrame | ResFrame | EventFrame;

// --- connect ---

export interface ConnectClientInfo {
  id: string;
  version: string;
  platform: string;
  mode: string;
}

export interface ConnectParams {
  minProtocol: number;
  maxProtocol: number;
  client: ConnectClientInfo;
  role: 'operator' | 'node';
  scopes?: string[];
  auth?: { token?: string };
  locale?: string;
  userAgent?: string;
}

export interface HelloOkPayload {
  type: 'hello-ok';
  protocol: number;
  server: { version: string; connId: string };
  features: { methods: string[]; events: string[] };
  snapshot: { health: HealthPayload };
  auth: { role: string; scopes: string[] };
  policy: {
    maxPayload: number;
    maxBufferedBytes: number;
    tickIntervalMs: number;
  };
}

// --- RPC payloads ---

export interface HealthPayload {
  ok: true;
  status: 'healthy';
  uptime: number;
  version: string;
  ts: number;
}

export interface StatusPayload {
  gateway: { version: string; uptime: number; connId: string };
  connections: number;
  protocol: number;
  role: string;
  scopes: string[];
}
