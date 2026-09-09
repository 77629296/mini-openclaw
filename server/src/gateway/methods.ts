export function handleHealth() {
  return {
    ok: true,
    uptimeMs: Math.floor(process.uptime() * 1000),
    ts: Date.now(),
  };
}
