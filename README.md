# Mini-OpenClaw

基于 [OpenClaw](https://github.com/openclaw/openclaw) 的精简重写。技术栈对齐：TypeScript、Node.js 22+、pnpm workspace、WebSocket Gateway、React WebUI。

## Day 1

目标：能跑起来的 Gateway 骨架 + 最小握手 + 能连上的 Web 页。

```bash
pnpm install
pnpm dev
```

- Gateway: `ws://127.0.0.1:18790`（避开本机正式 OpenClaw 的 18789）
- WebUI: Vite 默认 `http://127.0.0.1:5173`

## 目录

```
server/   WebSocket Gateway
web/      Control UI（极简）
desktop/  预留
```

## 参考

- https://docs.openclaw.ai/concepts/architecture
- https://docs.openclaw.ai/gateway/protocol
