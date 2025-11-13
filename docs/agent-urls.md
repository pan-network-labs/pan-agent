# Agent 调用 URL 完整指南

本文档列出了所有 Agent 的完整调用 URL 和使用方式。

## 1. Generate Agent (图片生成代理)

### 1.1 获取 Agent Card

**标准路径:**
```
GET http://localhost:3000/api/generate-agent/.well-known/agent.json
```

### 1.2 处理任务请求（HTTP 格式）

**URL:**
```
POST http://localhost:3000/api/generate-agent/task
```

**请求头:**
```
Content-Type: application/json
X-PAYMENT: <base64_encoded_tx_hash> (可选，首次调用不需要)
```

**请求体:**
```json
{}
```

**首次调用（无 X-PAYMENT）:**
- 返回 402 状态码和 x402 支付信息
- 需要先支付，然后带上 X-PAYMENT 头重新调用

**带支付信息的调用:**
```json
{
  "X-PAYMENT": "base64_encoded_transaction_hash"
}
```

**响应:**
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "data": "图片URL"
  }
}
```

**带推荐码的调用:**
```
POST http://localhost:3000/api/generate-agent/task?referrer=推荐码
```

---

## 2. A2A Agent (JSON-RPC 2.0 格式)

### 2.1 获取 Agent Card

**标准路径:**
```
GET http://localhost:3000/api/a2a-agent/.well-known/agent.json
```

### 2.2 处理任务请求

**URL:**
```
POST http://localhost:3000/api/a2a-agent/task
```

**请求头:**
```
Content-Type: application/json
X-PAYMENT: <base64_encoded_tx_hash> (必需)
```

**请求体（JSON-RPC 2.0 格式）:**
```json
{
  "jsonrpc": "2.0",
  "method": "generate_image",
  "params": {
    "prompt": "一只可爱的小猫咪"
  },
  "id": 1
}
```

**支持的方法:**

#### generate_image
```json
{
  "jsonrpc": "2.0",
  "method": "generate_image",
  "params": {
    "prompt": "图片提示词"
  },
  "id": 1
}
```

#### generate_image_with_prompt
```json
{
  "jsonrpc": "2.0",
  "method": "generate_image_with_prompt",
  "params": {
    "topic": "图片主题",
    "style": "艺术风格（可选）",
    "additionalRequirements": "额外要求（可选）",
    "promptAgentUrl": "http://localhost:3000/api/prompt-agent（可选）"
  },
  "id": 1
}
```

#### make_payment
```json
{
  "jsonrpc": "2.0",
  "method": "make_payment",
  "params": {
    "recipient": "0x...",
    "amount": "0.01",
    "description": "支付描述（可选）",
    "useContract": true,
    "referrer": "推荐码（可选）"
  },
  "id": 2
}
```

**带推荐码的调用:**
```
POST http://localhost:3000/api/a2a-agent/task?referrer=推荐码
```

---

## 3. Prompt Agent (HTTP 格式)

### 3.1 获取 Agent Card

**标准路径:**
```
GET http://localhost:3000/api/prompt-agent/.well-known/agent.json
```

### 3.2 处理任务请求

**URL:**
```
POST http://localhost:3000/api/prompt-agent/task
```

**请求头:**
```
Content-Type: application/json
X-PAYMENT: <base64_encoded_tx_hash> (可选，首次调用不需要)
```

**请求体（HTTP 格式，非 JSON-RPC）:**
```json
{
  "topic": "图片主题",
  "style": "艺术风格（可选）",
  "additionalRequirements": "额外要求（可选）"
}
```

**首次调用（无 X-PAYMENT）:**
- 返回 402 状态码和 x402 支付信息
- 需要先支付，然后带上 X-PAYMENT 头重新调用

**带支付信息的调用:**
```json
{
  "topic": "图片主题",
  "style": "艺术风格（可选）",
  "additionalRequirements": "额外要求（可选）"
}
```
请求头包含: `X-PAYMENT: <base64_encoded_tx_hash>`

**响应:**
```json
{
  "success": true,
  "prompt": "生成的提示词",
  "topic": "图片主题"
}
```

**带推荐码的调用:**
```
POST http://localhost:3000/api/prompt-agent/task?referrer=推荐码
```

---

## 4. 环境变量配置

### Generate Agent
- `PROMPT_AGENT_URL`: Prompt Agent 的 URL（默认: `http://localhost:3000/api/prompt-agent`）

### Prompt Agent
- `PROMPT_AGENT_PRICE`: 价格（Wei 格式，默认: `10000000000000000` = 0.01 BNB）
- `PROMPT_AGENT_CURRENCY`: 货币（默认: `BNB`）
- `PROMPT_AGENT_NETWORK`: 网络（默认: `BSCTest`）

### 通用配置
- `PAYMENT_CONTRACT_ADDRESS`: 支付合约地址
- `PAYMENT_RPC_URL`: RPC 节点 URL（默认: `https://data-seed-prebsc-1-s1.binance.org:8545/`）
- `PAYMENT_PRIVATE_KEY`: 支付私钥（用于后端自动支付）

---

## 5. 完整调用流程示例

### 示例 1: 前端调用 Generate Agent

```javascript
// 1. 首次调用（获取支付信息）
const response1 = await fetch('http://localhost:3000/api/generate-agent/task?referrer=推荐码', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({}),
});

if (response1.status === 402) {
  const paymentInfo = await response1.json();
  // paymentInfo 包含 x402 格式的支付信息
  
  // 2. 用户支付后，获取交易哈希
  const txHash = '0x...';
  const xPayment = btoa(txHash); // Base64 编码
  
  // 3. 带支付信息重新调用
  const response2 = await fetch('http://localhost:3000/api/generate-agent/task?referrer=推荐码', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-PAYMENT': xPayment,
    },
    body: JSON.stringify({}),
  });
  
  const result = await response2.json();
  console.log('图片URL:', result.data.data);
}
```

### 示例 2: 调用 Prompt Agent

```javascript
// 1. 首次调用（获取支付信息）
const response1 = await fetch('http://localhost:3000/api/prompt-agent/task?referrer=推荐码', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    topic: '一只可爱的小猫咪',
    style: '抽象',
  }),
});

if (response1.status === 402) {
  const paymentInfo = await response1.json();
  // paymentInfo 包含 x402 格式的支付信息
  
  // 2. 用户支付后，获取交易哈希
  const txHash = '0x...';
  const xPayment = btoa(txHash); // Base64 编码
  
  // 3. 带支付信息重新调用
  const response2 = await fetch('http://localhost:3000/api/prompt-agent/task?referrer=推荐码', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-PAYMENT': xPayment,
    },
    body: JSON.stringify({
      topic: '一只可爱的小猫咪',
      style: '抽象',
    }),
  });
  
  const result = await response2.json();
  console.log('生成的 prompt:', result.prompt);
}
```

### 示例 3: 调用 A2A Agent (JSON-RPC 2.0)

```javascript
// 1. 首次调用（获取支付信息）
const response1 = await fetch('http://localhost:3000/api/a2a-agent/task?referrer=推荐码', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'generate_image',
    params: {
      prompt: '一只可爱的小猫咪',
    },
    id: 1,
  }),
});

if (response1.status === 402) {
  const paymentInfo = await response1.json();
  // paymentInfo.error.data 包含 x402 格式的支付信息
  
  // 2. 用户支付后，获取交易哈希
  const txHash = '0x...';
  const xPayment = btoa(txHash); // Base64 编码
  
  // 3. 带支付信息重新调用
  const response2 = await fetch('http://localhost:3000/api/a2a-agent/task?referrer=推荐码', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-PAYMENT': xPayment,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'generate_image',
      params: {
        prompt: '一只可爱的小猫咪',
      },
      id: 1,
    }),
  });
  
  const result = await response2.json();
  console.log('图片URL:', result.result.imageUrl);
}
```

---

## 6. 推荐码传递

所有 Agent 都支持通过 URL 查询参数传递推荐码：

```
?referrer=推荐码
```

推荐码会在以下场景中使用：
1. 前端支付时，推荐码会传递给合约的 `makePayment` 方法
2. Generate Agent 调用 Prompt Agent 时，推荐码会传递给 Prompt Agent
3. Prompt Agent 返回 402 响应时，推荐码会包含在 `ext.referrer` 字段中

---

## 7. 其他相关 API

### 查询 SBT 信息
```
GET http://localhost:3000/api/sbt/query?address=0x...&type=stats
GET http://localhost:3000/api/sbt/query?address=0x...&type=list
GET http://localhost:3000/api/sbt/query?tokenId=1&type=detail
```

### 查询推荐信息
```
GET http://localhost:3000/api/referrer/query?type=stats&referrer=推荐码
GET http://localhost:3000/api/referrer/query?type=list
GET http://localhost:3000/api/referrer/query?type=tokens&referrer=推荐码
```

