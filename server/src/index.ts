import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
  console.log('Claw 客户端已连接');

  ws.on('message', (message) => {
    console.log('收到消息:', message.toString());
    // 回应一个基础的心跳包或确认消息
    ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
  });
});

console.log('Mini-OpenClaw 后端服务已在 8080 端口启动...');
