import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';

// 1. 初始化微内核事件总线
const kernelBus = new EventEmitter();

// 2. 注册内核事件监听器（未来这些会移到单独的模块/插件中）
kernelBus.on('PING', (payload, ws: WebSocket) => {
  ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
});

kernelBus.on('AGENT:RUN', async (payload: any, ws: WebSocket) => {
  console.log(`[Kernel] 正在触发 Agent [${payload.agentId}] 执行任务: ${payload.input}`);
  // 模拟 Agent 异步处理并流式返回
  ws.send(JSON.stringify({ type: 'AGENT:STREAM', payload: { chunk: '思考中...' } }));
});

// 3. WebSocket 服务端
const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
  console.log('Claw 客户端已连接');

  ws.on('message', (rawData) => {
    try {
      // 解析符合协议的消息
      const message = JSON.parse(rawData.toString());
      
      if (!message.type) {
        throw new Error('Missing message type');
      }

      // 核心转发：将网络消息安全地派发给微内核
      kernelBus.emit(message.type, message.payload, ws);

    } catch (err) {
      console.error('解析消息失败:', err);
      ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Invalid protocol format' } }));
    }
  });
});

console.log('Mini-OpenClaw 后端服务已在 8080 端口启动...');
