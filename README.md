# Mini-OpenClaw

OpenClaw 核心功能的精简重写版，沿用相同技术栈：**TypeScript + Node.js + pnpm monorepo + WebSocket Gateway + React WebUI**。

## 技术栈对齐

| 层级 | OpenClaw | Mini-OpenClaw |
|------|----------|---------------|
| 语言 | TypeScript (ES2023) | TypeScript (strict) |
| 运行时 | Node.js 22.19+ | Node.js 22.19+ |
| 包管理 | pnpm workspace | pnpm workspace |
| 控制面 | WebSocket Gateway | `server/` WebSocket Gateway |
| 前端 | Control UI / WebChat | `web/` React + Vite |
| 协议 | connect → req/res/event | 已对齐 Phase 1（v1） |

## 项目结构

```
mini-openclaw/
├── server/
│   └── src/
│       ├── protocol/     # 帧类型 + JSON Schema 校验
│       └── gateway/      # 连接管理 + RPC 路由
├── web/
│   └── src/
│       └── gateway-client.ts
├── pnpm-workspace.yaml
└── package.json
```

## 快速开始

```bash
pnpm install          # 根目录安装全部 workspace 依赖
pnpm dev              # 并行启动 Gateway + WebUI
pnpm dev:server       # 仅 Gateway（端口 8080）
pnpm dev:web          # 仅 WebUI（Vite 默认 5173）
```

## 参考

- [OpenClaw Gateway Architecture](https://docs.openclaw.ai/concepts/architecture)
- [OpenClaw Gateway Protocol](https://docs.openclaw.ai/gateway/protocol)
