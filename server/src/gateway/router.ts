import type { GatewaySession } from './session.js';

export type MethodHandler = (
  params: unknown,
  session: GatewaySession,
) => Promise<unknown> | unknown;

const handlers = new Map<string, MethodHandler>();

export function registerMethod(method: string, handler: MethodHandler): void {
  handlers.set(method, handler);
}

export function getMethodHandler(method: string): MethodHandler | undefined {
  return handlers.get(method);
}

export function listMethods(): string[] {
  return [...handlers.keys()];
}
