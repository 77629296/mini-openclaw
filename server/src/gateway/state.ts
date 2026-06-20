const startTime = Date.now();
let connectionCount = 0;

export function getUptime(): number {
  return Date.now() - startTime;
}

export function incrementConnections(): void {
  connectionCount += 1;
}

export function decrementConnections(): void {
  connectionCount = Math.max(0, connectionCount - 1);
}

export function getConnectionCount(): number {
  return connectionCount;
}
