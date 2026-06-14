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
| 协议 | connect → req/res/event | 逐步对齐（见路线图） |

## 项目结构

```
mini-openclaw/
├── server/          # Gateway 微内核（WebSocket 控制面）
├── web/             # Web 控制台 / WebChat
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

## 与 OpenClaw 的差异（刻意精简）

- **不做**：WhatsApp/Telegram/Discord 等消息渠道适配
- **不做**：macOS/iOS/Android Node 设备层
- **不做**：Canvas / A2UI / 语音
- **保留核心**：Gateway 控制面、Agent 循环、工具调用、WebChat

## 参考

- [OpenClaw Gateway Architecture](https://docs.openclaw.ai/concepts/architecture)
- [OpenClaw Gateway Protocol](https://docs.openclaw.ai/gateway/protocol)
