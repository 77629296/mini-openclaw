import { useEffect, useState } from 'react';
import { GatewayClient } from './gateway-client';

interface GatewayInfo {
  connId: string;
  protocol: number;
  uptime: number;
  connections: number;
  ticks: number;
}

export default function App() {
  const [status, setStatus] = useState('连接中...');
  const [info, setInfo] = useState<GatewayInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = new GatewayClient('ws://localhost:8080');
    let tickTimer: ReturnType<typeof setInterval>;

    (async () => {
      try {
        const hello = await client.connect();
        const health = await client.request<{ uptime: number }>('health');
        const gatewayStatus = await client.request<{
          connections: number;
          protocol: number;
          gateway: { connId: string; uptime: number };
        }>('status');

        setStatus('已握手 (hello-ok)');
        setInfo({
          connId: hello.server.connId,
          protocol: hello.protocol,
          uptime: health.uptime,
          connections: gatewayStatus.connections,
          ticks: client.ticks,
        });

        tickTimer = setInterval(() => {
          setInfo((prev) =>
            prev ? { ...prev, ticks: client.ticks } : prev,
          );
        }, 1000);
      } catch (err) {
        setStatus('连接失败');
        setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      clearInterval(tickTimer);
      client.disconnect();
    };
  }, []);

  return (
    <div className="flex h-screen items-center justify-center bg-slate-900 text-white">
      <div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-800 p-6 shadow-xl">
        <h1 className="text-xl font-bold text-emerald-400">Mini-OpenClaw WebUI</h1>
        <p className="mt-2 text-sm text-slate-400">
          协议状态:{' '}
          <span className="font-mono text-white">{status}</span>
        </p>

        {error && (
          <p className="mt-2 text-sm text-red-400">{error}</p>
        )}

        {info && (
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-400">connId</dt>
              <dd className="font-mono text-xs">{info.connId.slice(0, 8)}…</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">protocol</dt>
              <dd className="font-mono">v{info.protocol}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">uptime</dt>
              <dd className="font-mono">{Math.round(info.uptime / 1000)}s</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">connections</dt>
              <dd className="font-mono">{info.connections}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">tick events</dt>
              <dd className="font-mono">{info.ticks}</dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}
