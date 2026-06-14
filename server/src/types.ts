// 定义消息基础结构
export interface ClawMessage<T = any> {
  id: string;        // 消息唯一 ID（用于 请求-响应 溯源）
  type: string;      // 消息类型，例如 'AGENT:RUN', 'LLM:STREAM', 'PING'
  payload: T;        // 具体数据
  timestamp: number; // 时间戳
}

// 示例：Agent 执行请求的 Payload
export interface AgentRunPayload {
  agentId: string;
  input: string;
  context?: Record<string, any>;
}
