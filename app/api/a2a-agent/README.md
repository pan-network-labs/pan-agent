# A2A Image Generation Agent

这是一个符合 Google A2A (Agent-to-Agent) 协议的图片生成代理。

## 端点

### 1. 获取代理卡片 (Agent Card)
```
GET /api/a2a-agent/.well-known/agent.json
```

返回代理的能力描述、接口信息和元数据。

**支持的能力：**
- `generate_image` - 生成图片
- `make_payment` - 执行支付（新增）

**响应示例：**
```json
{
  "@context": "https://a2a.plus/context.jsonld",
  "@type": "Agent",
  "name": "Image Generation Agent",
  "description": "一个基于智谱AI的图片生成代理...",
  "capabilities": [...],
  "endpoints": {...},
  "payment": {...}
}
```

### 2. 处理任务请求
```
POST /api/a2a-agent/task
```

使用 JSON-RPC 2.0 格式处理图片生成任务。

**请求头：**
- `Content-Type: application/json`
- `X-PAYMENT: <base64_encoded_transaction_hash>` (必需)

**请求示例：**
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

**成功响应：**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "imageUrl": "https://...",
    "prompt": "一只可爱的小猫咪"
  },
  "id": 1
}
```

### 3. 支付功能 (make_payment)

**请求示例：**
```json
{
  "jsonrpc": "2.0",
  "method": "make_payment",
  "params": {
    "recipient": "0x316fb57ae002066a406c649c42ed33d04ac0c8f2",
    "amount": "0.01",
    "description": "支付描述（可选）",
    "useContract": true
  },
  "id": 2
}
```

**参数说明：**
- `recipient` (string, 必需): 收款地址
- `amount` (string, 必需): 支付金额（BNB）
- `description` (string, 可选): 支付描述（仅智能合约支付）
- `useContract` (boolean, 可选): 是否使用智能合约支付，默认 `true`

**成功响应：**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "txHash": "0x...",
    "recipient": "0x316fb57ae002066a406c649c42ed33d04ac0c8f2",
    "amount": "0.01",
    "useContract": true
  },
  "id": 2
}
```

**错误响应：**
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32602,
    "message": "Invalid params",
    "data": "prompt parameter is required"
  },
  "id": 1
}
```

## 支付验证

所有任务请求都需要在 `X-PAYMENT` 请求头中提供有效的支付交易哈希（Base64 编码）。

如果支付验证失败，将返回 402 状态码和支付信息：
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": 402,
    "message": "Payment Required",
    "data": {
      "price": "0.01",
      "currency": "BNB",
      "network": "BSCTest",
      "address": "0x316fb57ae002066a406c649c42ed33d04ac0c8f2"
    }
  }
}
```

## JSON-RPC 2.0 错误代码

- `-32600`: Invalid Request - 请求格式错误
- `-32601`: Method not found - 方法不存在
- `-32602`: Invalid params - 参数无效
- `-32603`: Internal error - 服务器内部错误
- `-32000`: Server error - 服务器错误（图片生成失败）
- `402`: Payment Required - 需要支付

## 使用示例

### 使用 curl

```bash
# 1. 获取代理卡片
curl -X GET http://localhost:3000/api/a2a-agent/.well-known/agent.json

# 2. 生成图片（需要提供 X-PAYMENT 头）
curl -X POST http://localhost:3000/api/a2a-agent/task \
  -H "Content-Type: application/json" \
  -H "X-PAYMENT: <base64_encoded_tx_hash>" \
  -d '{
    "jsonrpc": "2.0",
    "method": "generate_image",
    "params": {
      "prompt": "一只可爱的小猫咪"
    },
    "id": 1
  }'
```

### 使用 JavaScript/TypeScript

```typescript
// 获取代理卡片
const agentCard = await fetch('http://localhost:3000/api/a2a-agent/.well-known/agent.json')
  .then(res => res.json());

// 生成图片
const response = await fetch('http://localhost:3000/api/a2a-agent/task', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-PAYMENT': base64EncodedTxHash,
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

const result = await response.json();
if (result.result) {
  console.log('图片URL:', result.result.imageUrl);
} else {
  console.error('错误:', result.error);
}

// 执行支付（新增）
const paymentResponse = await fetch('http://localhost:3000/api/a2a-agent/task', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-PAYMENT': base64EncodedTxHash,
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'make_payment',
    params: {
      recipient: '0x316fb57ae002066a406c649c42ed33d04ac0c8f2',
      amount: '0.01',
      description: '支付描述',
      useContract: true,
    },
    id: 2,
  }),
});

const paymentResult = await paymentResponse.json();
if (paymentResult.result) {
  console.log('支付成功，交易哈希:', paymentResult.result.txHash);
} else {
  console.error('支付失败:', paymentResult.error);
}
```

## 环境变量

需要配置以下环境变量（在 `.env` 文件中）：

### 基础配置
- `ZHIPUAI_API_KEY`: 智谱AI API密钥
- `PAYMENT_PRICE`: 支付价格（默认：0.01）
- `PAYMENT_CURRENCY`: 货币类型（默认：BNB）
- `PAYMENT_NETWORK`: 网络名称（默认：BSCTest）
- `PAYMENT_ADDRESS`: 收款地址（必需）
- `PAYMENT_MIN_AMOUNT`: 最小支付金额（默认：0.01）
- `PAYMENT_RPC_URL`: BSC Testnet RPC URL

### 支付功能配置（新增）
- `PAYMENT_PRIVATE_KEY`: 支付私钥（必需，用于执行支付）
- `PAYMENT_CONTRACT_ADDRESS`: 智能合约地址（如果使用合约支付）

## 特性

- ✅ 符合 Google A2A 协议规范
- ✅ JSON-RPC 2.0 消息格式
- ✅ 代理卡片（Agent Card）支持
- ✅ 支付验证集成
- ✅ 智能合约支付支持
- ✅ **支付功能**（新增）- 支持智能合约和直接转账
- ✅ CORS 支持
- ✅ 错误处理

## 与其他 Agent 的区别

Generate Agent (`/api/generate-agent/task`)：
- 使用 HTTP 格式
- 自动调用 Prompt Agent 生成提示词
- 直接返回图片 URL

A2A Agent (`/api/a2a-agent/task`)：
- 使用 HTTP 格式（支持 `?action=xxx` 查询参数）
- 支持多种能力（generate_image, generate_image_with_prompt, make_payment）
- 支持代理发现和协作
- 可以被其他 A2A 兼容的代理调用
- 符合 A2A 协议规范

