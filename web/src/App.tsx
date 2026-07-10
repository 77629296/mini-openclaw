import { useEffect, useState, useRef, useCallback } from 'react';
import { GatewayClient, type LoggedEvent } from './gateway-client';

const WS_URL =
  (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_GATEWAY_WS_URL ?? 'ws://localhost:8080';

interface GatewayInfo {
  connId: string;
  protocol: number;
  uptime: number;
  connections: number;
  ticks: number;
  role: string;
  scopes: string[];
}

interface HealthResponse {
  uptime: number;
}

interface StatusResponse {
  connections: number;
  protocol: number;
  gateway: { connId: string; uptime: number };
}

interface WhoamiResponse {
  connId: string;
  role: 'operator' | 'node';
  scopes: string[];
  protocol: number;
  connectedAt: number;
}

interface SessionsResponse {
  count: number;
  sessions: { connId: string; role: string; scopes: string[]; connectedAt: number }[];
}

interface EchoResponse {
  message: string;
  length: number;
  reverse: string;
}

interface NodeInfo {
  connId: string;
  name: string;
  version: string;
  platform: string;
  capabilities: string[];
  status: 'online' | 'busy' | 'offline';
  lastSeen: number;
  connectedAt: number;
}

interface ListNodesResponse {
  count: number;
  nodes: NodeInfo[];
}

interface RegisterNodeResponse {
  ok: boolean;
  node: NodeInfo;
}

interface NodeStatusResponse {
  node: NodeInfo | null;
}

const RECONNECT_DELAY_MS = 3_000;
const MAX_RECONNECT_ATTEMPTS = 10;
const MAX_EVENT_LOG = 100;

export default function App() {
  const [status, setStatus] = useState('连接中...');
  const [info, setInfo] = useState<GatewayInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionsResponse['sessions']>([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [echoResult, setEchoResult] = useState<EchoResponse | null>(null);
  const [echoInput, setEchoInput] = useState('');
  const [eventLog, setEventLog] = useState<LoggedEvent[]>([]);
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [nodeCount, setNodeCount] = useState(0);
  const [nodeForm, setNodeForm] = useState({ name: '', version: '', platform: '' });
  const clientRef = useRef<GatewayClient | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const eventLogRef = useRef<HTMLDivElement>(null);

  // Auto-scroll event log
  useEffect(() => {
    if (eventLogRef.current) {
      eventLogRef.current.scrollTop = eventLogRef.current.scrollHeight;
    }
  }, [eventLog]);

  const initGateway = useCallback(async (client: GatewayClient) => {
    try {
      const hello = await client.connect();
      const [health, gatewayStatus, whoami] = await Promise.all([
        client.request<HealthResponse>('health'),
        client.request<StatusResponse>('status'),
        client.request<WhoamiResponse>('whoami'),
      ]);

      reconnectAttemptsRef.current = 0;
      setStatus('已握手 (hello-ok)');
      setInfo({
        connId: whoami.connId,
        protocol: whoami.protocol,
        uptime: health.uptime,
        connections: gatewayStatus.connections,
        ticks: client.ticks,
        role: whoami.role,
        scopes: whoami.scopes,
      });
      setError(null);
    } catch (err) {
      setStatus('连接失败');
      setError(err instanceof Error ? err.message : '未知错误');
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const client = new GatewayClient(WS_URL);
    clientRef.current = client;
    let tickTimer: ReturnType<typeof setInterval> | null = null;

    // Capture all events for the event log
    client.onEvent((evt) => {
      if (!isMounted) return;
      setEventLog((prev) => {
        const next = [...prev, evt];
        return next.length > MAX_EVENT_LOG ? next.slice(-MAX_EVENT_LOG) : next;
      });
    });

    client.onDisconnect(() => {
      if (!isMounted) return;
      clearInterval(tickTimer);
      tickTimer = null;

      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current += 1;
        setStatus(
          `连接断开，${RECONNECT_DELAY_MS / 1000}s 后重连 (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`,
        );
        setTimeout(() => {
          if (isMounted) {
            initGateway(client).then(() => {
              if (isMounted && client.isConnected) {
                tickTimer = setInterval(() => {
                  if (isMounted) {
                    setInfo((prev) =>
                      prev ? { ...prev, ticks: client.ticks } : prev,
                    );
                  }
                }, 1000);
              }
            });
          }
        }, RECONNECT_DELAY_MS);
      } else {
        setStatus('连接失败（已达最大重试次数）');
        setError('无法连接到 Gateway');
      }
    });

    initGateway(client).then(() => {
      if (isMounted && client.isConnected) {
        tickTimer = setInterval(() => {
          if (isMounted) {
            setInfo((prev) =>
              prev ? { ...prev, ticks: client.ticks } : prev,
            );
          }
        }, 1000);
      }
    });

    return () => {
      isMounted = false;
      if (tickTimer) clearInterval(tickTimer);
      client.disconnect();
      clientRef.current = null;
    };
  }, [initGateway]);

  // --- Action handlers ---

  const handleRefreshSessions = async () => {
    const client = clientRef.current;
    if (!client?.isConnected) return;
    try {
      const res = await client.request<SessionsResponse>('system.sessions');
      setSessions(res.sessions);
      setSessionCount(res.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取 sessions 失败');
    }
  };

  const handleEcho = async () => {
    const client = clientRef.current;
    if (!client?.isConnected || !echoInput.trim()) return;
    try {
      const res = await client.request<EchoResponse>('system.echo', {
        message: echoInput,
      });
      setEchoResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'echo 失败');
    }
  };

  const handlePing = async () => {
    const client = clientRef.current;
    if (!client?.isConnected) return;
    try {
      const res = await client.request<{ pong: true; ts: number }>('system.ping');
      setEchoResult({ message: `pong @ ${new Date(res.ts).toLocaleTimeString()}`, length: 0, reverse: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ping 失败');
    }
  };

  const handleClearLog = () => {
    setEventLog([]);
  };

  // --- Node management handlers ---

  const handleRefreshNodes = async () => {
    const client = clientRef.current;
    if (!client?.isConnected) return;
    try {
      const res = await client.request<ListNodesResponse>('node.list');
      setNodes(res.nodes);
      setNodeCount(res.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取 nodes 失败');
    }
  };

  const handleRegisterNode = async () => {
    const client = clientRef.current;
    if (!client?.isConnected || !nodeForm.name.trim()) return;
    try {
      const res = await client.request<RegisterNodeResponse>('node.register', {
        name: nodeForm.name,
        version: nodeForm.version || '0.1.0',
        platform: nodeForm.platform || 'web',
      });
      if (res.ok) {
        setNodeForm({ name: '', version: '', platform: '' });
        handleRefreshNodes();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册 node 失败');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4">
      <div className="mx-auto max-w-2xl space-y-4">

        {/* Header */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-6 shadow-xl">
          <h1 className="text-xl font-bold text-emerald-400">Mini-OpenClaw WebUI</h1>
          <p className="mt-2 text-sm text-slate-400">
            协议状态: <span className="font-mono text-white">{status}</span>
          </p>

          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

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
                <dt className="text-slate-400">role</dt>
                <dd className="font-mono">{info.role}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">scopes</dt>
                <dd className="font-mono text-xs">{info.scopes.join(', ')}</dd>
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

        {/* RPC Actions */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-6 shadow-xl">
          <h2 className="text-lg font-semibold text-emerald-400 mb-4">RPC 操作</h2>

          <div className="space-y-4">
            {/* Ping */}
            <div>
              <button
                onClick={handlePing}
                disabled={!clientRef.current?.isConnected}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                system.ping
              </button>
            </div>

            {/* Echo */}
            <div className="flex gap-2">
              <input
                type="text"
                value={echoInput}
                onChange={(e) => setEchoInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEcho()}
                placeholder="输入 echo 消息..."
                className="flex-1 rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                onClick={handleEcho}
                disabled={!clientRef.current?.isConnected || !echoInput.trim()}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                system.echo
              </button>
            </div>

            {/* Echo result */}
            {echoResult && (
              <div className="rounded border border-slate-600 bg-slate-700/50 p-3 text-sm font-mono">
                <div><span className="text-slate-400">message:</span> {echoResult.message}</div>
                {echoResult.length > 0 && (
                  <>
                    <div><span className="text-slate-400">length:</span> {echoResult.length}</div>
                    <div><span className="text-slate-400">reverse:</span> {echoResult.reverse}</div>
                  </>
                )}
              </div>
            )}

            {/* Sessions */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleRefreshSessions}
                disabled={!clientRef.current?.isConnected}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                system.sessions
              </button>
              {sessionCount > 0 && (
                <span className="text-sm text-slate-400">活跃连接: {sessionCount}</span>
              )}
            </div>

            {sessions.length > 0 && (
              <div className="space-y-2">
                {sessions.map((s) => (
                  <div key={s.connId} className="rounded border border-slate-600 bg-slate-700/50 p-3 text-sm font-mono">
                    <div><span className="text-slate-400">connId:</span> {s.connId.slice(0, 8)}…</div>
                    <div><span className="text-slate-400">role:</span> {s.role}</div>
                    <div><span className="text-slate-400">scopes:</span> {s.scopes.join(', ')}</div>
                    <div><span className="text-slate-400">connected:</span> {new Date(s.connectedAt).toLocaleTimeString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Node Management */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-6 shadow-xl">
          <h2 className="text-lg font-semibold text-emerald-400 mb-4">节点管理</h2>

          <div className="space-y-4">
            {/* Register Node */}
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={nodeForm.name}
                onChange={(e) => setNodeForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="节点名称"
                className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <input
                type="text"
                value={nodeForm.version}
                onChange={(e) => setNodeForm((prev) => ({ ...prev, version: e.target.value }))}
                placeholder="版本 (可选)"
                className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <input
                type="text"
                value={nodeForm.platform}
                onChange={(e) => setNodeForm((prev) => ({ ...prev, platform: e.target.value }))}
                placeholder="平台 (可选)"
                className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleRegisterNode}
                disabled={!clientRef.current?.isConnected || !nodeForm.name.trim()}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                node.register
              </button>
              <button
                onClick={handleRefreshNodes}
                disabled={!clientRef.current?.isConnected}
                className="rounded bg-slate-600 px-4 py-2 text-sm font-medium hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                node.list
              </button>
              {nodeCount > 0 && (
                <span className="text-sm text-slate-400">节点数: {nodeCount}</span>
              )}
            </div>

            {nodes.length > 0 && (
              <div className="space-y-2">
                {nodes.map((node) => (
                  <div key={node.connId} className="rounded border border-slate-600 bg-slate-700/50 p-3 text-sm font-mono">
                    <div className="flex justify-between">
                      <div>
                        <span className="text-slate-400">name:</span> {node.name}
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        node.status === 'online' ? 'bg-green-600' :
                        node.status === 'busy' ? 'bg-yellow-600' : 'bg-red-600'
                      }`}>
                        {node.status}
                      </span>
                    </div>
                    <div><span className="text-slate-400">connId:</span> {node.connId.slice(0, 8)}…</div>
                    <div><span className="text-slate-400">version:</span> {node.version}</div>
                    <div><span className="text-slate-400">platform:</span> {node.platform}</div>
                    {node.capabilities.length > 0 && (
                      <div><span className="text-slate-400">capabilities:</span> {node.capabilities.join(', ')}</div>
                    )}
                    <div><span className="text-slate-400">connected:</span> {new Date(node.connectedAt).toLocaleTimeString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Event Log */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-emerald-400">事件日志</h2>
            <button
              onClick={handleClearLog}
              className="rounded bg-slate-700 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-slate-600 transition-colors"
            >
              清空
            </button>
          </div>

          <div
            ref={eventLogRef}
            className="max-h-60 overflow-y-auto space-y-1 rounded border border-slate-600 bg-slate-900 p-3"
          >
            {eventLog.length === 0 && (
              <p className="text-sm text-slate-500 text-center">暂无事件</p>
            )}
            {eventLog.map((evt) => (
              <div key={evt.id} className="text-xs font-mono text-slate-300">
                <span className="text-slate-500">[{new Date(evt.ts).toLocaleTimeString()}]</span>{' '}
                <span className="text-emerald-400">{evt.event}</span>{' '}
                <span className="text-slate-400">{JSON.stringify(evt.payload)}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
