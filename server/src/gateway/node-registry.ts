import type { GatewaySession } from './session.js';

/**
 * In-memory node registry — tracks all connected nodes separately from general sessions.
 */

export interface NodeInfo {
  connId: string;
  name: string;
  version: string;
  platform: string;
  capabilities: string[];
  status: 'online' | 'busy' | 'offline';
  lastSeen: number;
  connectedAt: number;
}

const nodes = new Map<string, NodeInfo>();

export function registerNode(
  session: GatewaySession,
  name: string,
  version: string,
  platform: string,
  capabilities: string[] = []
): NodeInfo {
  const node: NodeInfo = {
    connId: session.connId,
    name,
    version,
    platform,
    capabilities,
    status: 'online',
    lastSeen: Date.now(),
    connectedAt: session.connectedAt,
  };
  nodes.set(session.connId, node);
  return node;
}

export function unregisterNode(connId: string): void {
  nodes.delete(connId);
}

export function getNode(connId: string): NodeInfo | undefined {
  return nodes.get(connId);
}

export function updateNodeStatus(
  connId: string,
  status: 'online' | 'busy' | 'offline'
): void {
  const node = nodes.get(connId);
  if (node) {
    node.status = status;
    node.lastSeen = Date.now();
  }
}

export function touchNode(connId: string): void {
  const node = nodes.get(connId);
  if (node) {
    node.lastSeen = Date.now();
  }
}

export function listNodes(): NodeInfo[] {
  return Array.from(nodes.values());
}

export function getOnlineNodes(): NodeInfo[] {
  return Array.from(nodes.values()).filter(n => n.status === 'online');
}

export function getNodeCount(): number {
  return nodes.size;
}

export function getOnlineNodeCount(): number {
  return Array.from(nodes.values()).filter(n => n.status === 'online').length;
}
