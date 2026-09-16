import path from "node:path";

export type Config = {
  host: string;
  port: number;
  token: string | null;
  sessionsPath: string;
};

export function loadConfig(): Config {
  return {
    host: process.env.GATEWAY_HOST ?? "127.0.0.1",
    // 18789 常被本机正式 OpenClaw 占用，mini 默认错开
    port: Number(process.env.GATEWAY_PORT ?? 18790),
    token: process.env.GATEWAY_TOKEN?.trim() || null,
    sessionsPath:
      process.env.SESSIONS_PATH?.trim() ||
      path.join(process.cwd(), "data", "sessions.json"),
  };
}
