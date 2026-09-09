export const PROTOCOL_VERSION = 1;

export type Role = "operator" | "node";

export type ReqFrame = {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
};

export type ResFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: {
    code: string;
    message: string;
  };
};

export type EventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
};

export type Frame = ReqFrame | ResFrame | EventFrame;

export type ConnectParams = {
  minProtocol: number;
  maxProtocol: number;
  client: {
    id: string;
    version: string;
    platform: string;
    mode: string;
  };
  role: Role;
  scopes?: string[];
  auth?: {
    token?: string;
  };
};
