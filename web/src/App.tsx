import { useEffect, useRef, useState } from "react";
import { GatewayClient } from "./gateway-client";
import "./App.css";

const WS_URL = import.meta.env.VITE_GATEWAY_URL ?? "ws://127.0.0.1:18790";

type SessionRow = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export default function App() {
  const clientRef = useRef<GatewayClient | null>(null);
  const [connStatus, setConnStatus] = useState("idle");
  const [hello, setHello] = useState<unknown>(null);
  const [health, setHealth] = useState<unknown>(null);
  const [status, setStatus] = useState<unknown>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionDetail, setSessionDetail] = useState<unknown>(null);
  const [sessionError, setSessionError] = useState<unknown>(null);
  const [lastTick, setLastTick] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    const client = new GatewayClient({ url: WS_URL });
    clientRef.current = client;
    client.onStatus = setConnStatus;
    client.onHello = setHello;
    client.onEvent = (event, payload) => {
      if (event !== "tick") return;
      const ts = (payload as { ts?: number } | undefined)?.ts;
      setLastTick(ts ? new Date(ts).toLocaleTimeString() : new Date().toLocaleTimeString());
    };
    client.connect();

    return () => {
      client.close();
      clientRef.current = null;
    };
  }, []);

  async function call(method: "health" | "status") {
    const client = clientRef.current;
    if (!client) return;
    const res = await client.request(method);
    const value = res.ok ? res.payload : res.error;
    if (method === "health") setHealth(value);
    else setStatus(value);
  }

  async function refreshSessions() {
    const client = clientRef.current;
    if (!client) return;
    const res = await client.request("sessions.list");
    if (!res.ok) {
      setSessionError(res.error);
      return;
    }
    const payload = res.payload as { sessions?: SessionRow[] };
    setSessions(payload.sessions ?? []);
    setSessionError(null);
  }

  async function createSession() {
    const client = clientRef.current;
    if (!client) return;
    const res = await client.request("sessions.create", {
      title: title.trim() || undefined,
    });
    if (!res.ok) {
      setSessionError(res.error);
      return;
    }
    const payload = res.payload as { session?: SessionRow };
    if (payload.session) setSelectedId(payload.session.id);
    setTitle("");
    await refreshSessions();
  }

  async function getSession() {
    const client = clientRef.current;
    if (!client || !selectedId) return;
    const res = await client.request("sessions.get", { id: selectedId });
    if (!res.ok) {
      setSessionDetail(res.error);
      return;
    }
    setSessionDetail(res.payload);
    setSessionError(null);
  }

  async function removeSession() {
    const client = clientRef.current;
    if (!client || !selectedId) return;
    const res = await client.request("sessions.delete", { id: selectedId });
    if (!res.ok) {
      setSessionError(res.error);
      return;
    }
    setSelectedId("");
    setSessionDetail(null);
    await refreshSessions();
  }

  const ready = connStatus === "ready";

  return (
    <main className="page">
      <header>
        <p className="brand">Mini-OpenClaw</p>
        <h1>Gateway</h1>
        <p className="sub">状态：{connStatus}</p>
        <p className="sub">最近 tick：{lastTick ?? "还没有"}</p>
      </header>

      <section>
        <h2>hello-ok</h2>
        <pre>{hello ? JSON.stringify(hello, null, 2) : "等待握手…"}</pre>
      </section>

      <section>
        <div className="actions">
          <button type="button" onClick={() => void call("status")} disabled={!ready}>
            调用 status
          </button>
          <button type="button" onClick={() => void call("health")} disabled={!ready}>
            调用 health
          </button>
        </div>
        <h2>status</h2>
        <pre>{status ? JSON.stringify(status, null, 2) : "尚未调用"}</pre>
        <h2>health</h2>
        <pre>{health ? JSON.stringify(health, null, 2) : "尚未调用"}</pre>
      </section>

      <section>
        <h2>sessions</h2>
        <div className="actions">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="session title"
            disabled={!ready}
          />
          <button type="button" onClick={() => void createSession()} disabled={!ready}>
            create
          </button>
          <button type="button" onClick={() => void refreshSessions()} disabled={!ready}>
            list
          </button>
        </div>
        <div className="actions">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={!ready || sessions.length === 0}
          >
            <option value="">select session</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({s.id.slice(0, 8)})
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void getSession()} disabled={!ready || !selectedId}>
            get
          </button>
          <button type="button" onClick={() => void removeSession()} disabled={!ready || !selectedId}>
            delete
          </button>
        </div>
        <pre>
          {sessionError
            ? JSON.stringify(sessionError, null, 2)
            : sessions.length
              ? JSON.stringify({ sessions }, null, 2)
              : "尚未调用"}
        </pre>
        <h2>session detail</h2>
        <pre>{sessionDetail ? JSON.stringify(sessionDetail, null, 2) : "尚未调用"}</pre>
      </section>
    </main>
  );
}
