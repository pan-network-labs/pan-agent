# Google A2A 协议与本项目实现对应关系

## 概述

本项目实现了符合 Google A2A (Agent-to-Agent) 协议的图片生成代理。以下是 Google A2A 协议规范与本项目实现的详细对应关系。

## 1. 协议基础架构

### Google A2A 协议规范

| 规范项 | 要求 | 本项目实现 |
|--------|------|-----------|
| **传输层** | HTTP(S) | ✅ 使用 Next.js API Routes (基于 HTTP) |
| **消息格式** | JSON-RPC 2.0 | ✅ 完全符合 JSON-RPC 2.0 规范 |
| **数据交换** | JSON | ✅ 所有请求/响应使用 JSON |
| **流式传输** | SSE (可选) | ⚠️ 当前未实现（可扩展） |
| **异步通知** | 推送通知 (可选) | ⚠️ 当前未实现（可扩展） |

### 实现位置

```typescript
// app/api/a2a-agent/task/route.ts
// 使用 JSON-RPC 2.0 格式处理请求
const { jsonrpc, method, params, id } = body;
// 验证 jsonrpc === '2.0'
```

## 2. 代理卡片 (Agent Card)

### Google A2A 协议规范

代理卡片是 A2A 协议的核心，用于描述代理的能力和接口。

| 规范项 | 要求 | 本项目实现 |
|--------|------|-----------|
| **格式** | JSON-LD | ✅ 使用 `@context` 和 `@type` |
| **上下文** | `https://a2a.plus/context.jsonld` | ✅ 完全符合 |
| **类型** | `Agent` | ✅ `"@type": "Agent"` |
| **能力声明** | `capabilities` 数组 | ✅ 包含 `generate_image` 和 `make_payment` |
| **端点声明** | `endpoints` 对象 | ✅ 声明 `task` 和 `agentCard` 端点 |

### 实现位置

```typescript
// app/api/a2a-agent/utils.ts - getAgentCard()
{
  "@context": "https://a2a.plus/context.jsonld",
  "@type": "Agent",
  "name": "Image Generation Agent",
  "capabilities": [
    {
      "name": "generate_image",
      "inputSchema": { ... },
      "outputSchema": { ... }
    },
    {
      "name": "make_payment",
      "inputSchema": { ... },
      "outputSchema": { ... }
    }
  ],
  "endpoints": {
    "task": `${baseUrl}/api/a2a-agent/task`,
    "agentCard": `${baseUrl}/api/a2a-agent/.well-known/agent.json`
  }
}
```

### 端点实现

| 端点 | 协议要求 | 本项目实现 |
|------|---------|-----------|
| **Agent Card** | `GET /.well-known/agent.json` | ✅ `GET /api/a2a-agent/.well-known/agent.json` |
| **Task** | `POST /task` | ✅ `POST /api/a2a-agent/task` |

## 3. JSON-RPC 2.0 消息格式

### 请求格式

| 字段 | 协议要求 | 本项目实现 |
|------|---------|-----------|
| `jsonrpc` | 必须为 `"2.0"` | ✅ 严格验证 |
| `method` | 方法名称 | ✅ 支持 `generate_image`, `make_payment` |
| `params` | 方法参数 | ✅ 根据方法验证参数 |
| `id` | 请求 ID | ✅ 必需，用于匹配响应 |

### 响应格式

#### 成功响应
```json
{
  "jsonrpc": "2.0",
  "result": { ... },
  "id": 1
}
```

#### 错误响应
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32600,
    "message": "Invalid Request",
    "data": "..."
  },
  "id": 1
}
```

### 实现位置

```typescript
// app/api/a2a-agent/task/route.ts
// 验证 JSON-RPC 2.0 格式
if (jsonrpc !== '2.0' || !method || !id) {
  return NextResponse.json({
    jsonrpc: '2.0',
    error: { code: -32600, message: 'Invalid Request' },
    id: id || null
  });
}
```

## 4. 错误代码映射

### JSON-RPC 2.0 标准错误代码

| 错误代码 | 含义 | 本项目使用场景 |
|---------|------|--------------|
| `-32600` | Invalid Request | 请求格式错误 |
| `-32601` | Method not found | 方法不存在 |
| `-32602` | Invalid params | 参数无效 |
| `-32603` | Internal error | 服务器内部错误 |
| `-32000` | Server error | 业务逻辑错误（图片生成失败等） |

### 自定义错误代码

| 错误代码 | 含义 | 本项目使用场景 |
|---------|------|--------------|
| `402` | Payment Required | 需要支付或支付验证失败 |

### 实现位置

```typescript
// app/api/a2a-agent/task/route.ts
// 各种错误处理
return NextResponse.json({
  jsonrpc: '2.0',
  error: {
    code: -32602,  // 或其他错误代码
    message: 'Invalid params',
    data: '...'
  },
  id
});
```

## 5. 能力 (Capabilities)

### Google A2A 协议规范

能力定义了代理可以执行的操作，包括输入/输出 schema。

### 本项目实现的能力

#### 1. `generate_image` - 图片生成

```typescript
{
  "name": "generate_image",
  "description": "根据文本提示词生成1024x1024的抽象油画风格图片",
  "inputSchema": {
    "type": "object",
    "properties": {
      "prompt": { "type": "string" }
    },
    "required": ["prompt"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "imageUrl": { "type": "string" }
    }
  }
}
```

**实现位置：**
- 声明：`app/api/a2a-agent/utils.ts` - `getAgentCard()`
- 处理：`app/api/a2a-agent/task/route.ts` - `method === 'generate_image'`

#### 2. `make_payment` - 支付功能

```typescript
{
  "name": "make_payment",
  "description": "通过智能合约或直接转账进行支付",
  "inputSchema": {
    "type": "object",
    "properties": {
      "recipient": { "type": "string" },
      "amount": { "type": "string" },
      "description": { "type": "string" },
      "useContract": { "type": "boolean" }
    },
    "required": ["recipient", "amount"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "txHash": { "type": "string" },
      "recipient": { "type": "string" },
      "amount": { "type": "string" }
    }
  }
}
```

**实现位置：**
- 声明：`app/api/a2a-agent/utils.ts` - `getAgentCard()`
- 处理：`app/api/a2a-agent/task/route.ts` - `method === 'make_payment'`

## 6. 端点 (Endpoints)

### Google A2A 协议规范

| 端点类型 | 协议要求 | 本项目实现 |
|---------|---------|-----------|
| **Agent Card** | `GET /.well-known/agent.json` | ✅ `GET /api/a2a-agent/.well-known/agent.json` |
| **Task** | `POST /task` | ✅ `POST /api/a2a-agent/task` |
| **Stream** | `GET /stream` (可选) | ⚠️ 未实现 |
| **Notification** | `POST /notification` (可选) | ⚠️ 未实现 |

### 实现位置

```typescript
// app/api/a2a-agent/.well-known/agent.json/route.ts
export async function GET(request: NextRequest) {
  const agentCard = getAgentCard(baseUrl);
  return NextResponse.json(agentCard);
}

// app/api/a2a-agent/task/route.ts
export async function POST(request: NextRequest) {
  // 处理 JSON-RPC 2.0 请求
}
```

## 7. 安全与认证

### Google A2A 协议规范

| 安全特性 | 协议要求 | 本项目实现 |
|---------|---------|-----------|
| **HTTPS** | 推荐 | ✅ 生产环境应使用 HTTPS |
| **CORS** | 支持跨域 | ✅ 已实现 CORS 头 |
| **认证** | 可选 | ⚠️ 当前使用支付验证（自定义） |
| **授权** | 可选 | ⚠️ 当前未实现 |

### 实现位置

```typescript
// app/api/a2a-agent/utils.ts - getCorsHeaders()
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-PAYMENT',
  };
}
```

## 8. 支付集成（自定义扩展）

### 本项目扩展

虽然支付验证不是 A2A 协议的标准部分，但本项目实现了：

| 特性 | 实现 |
|------|------|
| **支付验证** | 通过 `X-PAYMENT` 请求头 |
| **区块链验证** | 验证 BSC Testnet 交易 |
| **智能合约支持** | 支持解析合约调用 |

### 实现位置

```typescript
// app/api/a2a-agent/task/route.ts
const xPaymentHeader = request.headers.get('X-PAYMENT');
const paymentValidation = await validatePayment(xPaymentHeader);
```

## 9. 完整流程图

```
┌─────────────────┐
│  其他 A2A Agent │
└────────┬────────┘
         │ 1. GET /api/a2a-agent/.well-known/agent.json
         ▼
┌─────────────────┐
│  获取 Agent Card│
│  (能力声明)     │
└────────┬────────┘
         │ 2. 发现能力：generate_image, make_payment
         ▼
┌─────────────────┐
│  构建 JSON-RPC   │
│  请求            │
└────────┬────────┘
         │ 3. POST /api/a2a-agent/task
         │    Headers: X-PAYMENT: <tx_hash>
         │    Body: { jsonrpc: "2.0", method: "...", params: {...}, id: 1 }
         ▼
┌─────────────────┐
│  支付验证        │
│  (自定义扩展)    │
└────────┬────────┘
         │ 4. 验证通过
         ▼
┌─────────────────┐
│  执行方法        │
│  - generate_image│
│  - make_payment  │
└────────┬────────┘
         │ 5. 返回 JSON-RPC 响应
         ▼
┌─────────────────┐
│  JSON-RPC 响应   │
│  { result: {...} }│
└─────────────────┘
```

## 10. 符合度总结

| 协议特性 | 符合度 | 说明 |
|---------|--------|------|
| **传输层 (HTTP)** | ✅ 100% | 完全符合 |
| **消息格式 (JSON-RPC 2.0)** | ✅ 100% | 完全符合 |
| **代理卡片** | ✅ 100% | 完全符合规范 |
| **能力声明** | ✅ 100% | 包含完整的 schema |
| **端点实现** | ✅ 100% | 核心端点已实现 |
| **错误处理** | ✅ 100% | 符合 JSON-RPC 2.0 |
| **流式传输 (SSE)** | ⚠️ 0% | 未实现（可选） |
| **异步通知** | ⚠️ 0% | 未实现（可选） |
| **标准认证** | ⚠️ 部分 | 使用自定义支付验证 |

## 11. 与其他 A2A Agent 的互操作性

### 可以被其他 Agent 发现

```typescript
// 其他 Agent 可以：
// 1. 获取 Agent Card
const card = await fetch('https://your-domain.com/api/a2a-agent/.well-known/agent.json');

// 2. 发现能力
const capabilities = card.capabilities; // ['generate_image', 'make_payment']

// 3. 调用能力
const result = await fetch('https://your-domain.com/api/a2a-agent/task', {
  method: 'POST',
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'generate_image',
    params: { prompt: '...' },
    id: 1
  })
});
```

### 可以调用其他 Agent

本项目也可以作为客户端，调用其他符合 A2A 协议的 Agent。

## 12. 扩展建议

### 可选的 A2A 协议特性

1. **流式传输 (SSE)**
   - 实现 `GET /api/a2a-agent/stream`
   - 用于实时返回图片生成进度

2. **异步通知**
   - 实现 `POST /api/a2a-agent/notification`
   - 用于任务完成后的推送通知

3. **标准认证**
   - 实现 OAuth 2.0 或 API Key 认证
   - 替代或补充当前的支付验证

4. **任务状态查询**
   - 实现 `GET /api/a2a-agent/task/:id`
   - 用于查询任务执行状态

## 总结

本项目**完全符合** Google A2A 协议的核心规范：
- ✅ 使用 HTTP(S) 传输
- ✅ 使用 JSON-RPC 2.0 消息格式
- ✅ 实现代理卡片 (Agent Card)
- ✅ 声明能力 (Capabilities)
- ✅ 实现任务端点 (Task Endpoint)
- ✅ 符合错误处理规范

同时，本项目还添加了**自定义扩展**：
- 💡 支付验证机制
- 💡 区块链交易验证
- 💡 智能合约支付支持

这使得本项目的 Agent 可以与其他符合 A2A 协议的 Agent 进行互操作，同时提供了独特的支付功能。

