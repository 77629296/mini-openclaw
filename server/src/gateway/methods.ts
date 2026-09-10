export function handleHealth() {
  return {
    ok: true,
    uptimeMs: Math.floor(process.uptime() * 1000),
    ts: Date.now(),
  };
}

export function handleStatus(info: {
  connId: string;
  role: string | null;
  scopes: string[];
  protocol: number;
}) {
  return {
    protocol: info.protocol,
    connId: info.connId,
    role: info.role,
    scopes: info.scopes,
    uptimeMs: Math.floor(process.uptime() * 1000),
    ts: Date.now(),
  };
}
