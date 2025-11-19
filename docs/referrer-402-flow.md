# Referrer 传递流程（通过 402 响应）

## 概述

所有 referrer 传递都通过 402 响应的 `ext.referrer` 字段和 request body 完成，不再使用 URL 参数。

---

## 客户端 → Generate Agent

### 1. 客户端第一次调用 Generate Agent

**位置：** `app/page.tsx` (line 257-276)

**请求：**
```typescript
POST /api/generate-agent/task
Content-Type: application/json

{
  "referrer": "0xABC123..." // 从 URL 参数提取，在 body 中传递
}
```

**说明：**
- 客户端从页面 URL 参数中提取 referrer
- 在 request body 中传递 referrer（不在 URL 参数中）

---

### 2. Generate Agent 返回 402 响应

**位置：** `app/api/generate-agent/task/route.ts` (line 275-303)

**处理：**
```typescript
// 从 request body 提取 referrer
body = await request.json();
referrer = body.referrer !== undefined ? body.referrer : undefined;

// 在 402 响应中包含 referrer
const x402Response = createX402Response({
  // ...
  referrer: referrer, // 放在 ext.referrer 中
});
```

**响应：**
```json
{
  "x402Version": 1,
  "accepts": [{
    "address": "0x...",
    "maxAmountRequired": "5000000000000000",
    "ext": {
      "referrer": "0xABC123..." // ← referrer 在这里
    }
  }]
}
```

---

### 3. 客户端从 402 响应提取 referrer

**位置：** `app/page.tsx` (line 310-317)

**处理：**
```typescript
// 从 402 响应的 ext.referrer 提取
const referrer = requirement.ext?.referrer || '';

// 保存到 paymentInfo
setPaymentInfo({
  // ...
  referrer: referrer, // 保存 referrer，用于后续调用
});
```

---

### 4. 客户端支付后，再次调用 Generate Agent

**位置：** `app/page.tsx` (line 672-697)

**请求：**
```typescript
POST /api/generate-agent/task
Content-Type: application/json
X-PAYMENT: <base64-encoded-tx-hash>

{
  "referrer": "0xABC123..." // 从 402 响应的 ext.referrer 提取，在 body 中传递
}
```

**说明：**
- 从 `paymentInfo.referrer` 获取 referrer（来自第一次 402 响应）
- 在 request body 中传递 referrer

---

### 5. Generate Agent 验证支付后，从 request body 提取 referrer

**位置：** `app/api/generate-agent/task/route.ts` (line 271-290)

**处理：**
```typescript
// 从 request body 提取 referrer（来自客户端的 402 响应）
body = await request.json();
referrer = body.referrer !== undefined ? body.referrer : undefined;
```

---

## Generate Agent → Prompt Agent

### 1. Generate Agent 第一次调用 Prompt Agent

**位置：** `app/api/a2a-agent/agent-client.ts` (line 233-246)

**请求：**
```typescript
POST /api/prompt-agent/task
Content-Type: application/json

{
  "topic": "...",
  "style": "...",
  "additionalRequirements": "...",
  "referrer": "0xABC123..." // 从 Generate Agent 的 request body 提取，在 body 中传递
}
```

**说明：**
- Generate Agent 从自己的 request body 中获取 referrer（来自客户端的 402 响应）
- 在 request body 中传递给 Prompt Agent

---

### 2. Prompt Agent 返回 402 响应

**位置：** `app/api/prompt-agent/task/route.ts` (line 85-122)

**处理：**
```typescript
// 从 request body 提取 referrer
body = await request.json();
referrer = body.referrer !== undefined ? body.referrer : undefined;

// 在 402 响应中包含 referrer
const x402Response = createX402Response({
  // ...
  referrer: referrer, // 放在 ext.referrer 中
});
```

**响应：**
```json
{
  "x402Version": 1,
  "accepts": [{
    "address": "0x...",
    "maxAmountRequired": "1000000000000000",
    "ext": {
      "referrer": "0xABC123..." // ← referrer 在这里
    }
  }]
}
```

---

### 3. Generate Agent 从 402 响应提取 referrer

**位置：** `app/api/a2a-agent/agent-client.ts` (line 360-383)

**处理：**
```typescript
// 从 Prompt Agent 的 402 响应提取 referrer
const referrerFrom402 = requirement.ext?.referrer || '';

// 使用从 402 响应提取的 referrer（优先）
const finalReferrer = referrerFrom402 || referrer || '';
```

---

### 4. Generate Agent 支付后，再次调用 Prompt Agent

**位置：** `app/api/a2a-agent/agent-client.ts` (line 500-514)

**请求：**
```typescript
POST /api/prompt-agent/task
Content-Type: application/json
X-PAYMENT: <base64-encoded-tx-hash>

{
  "topic": "...",
  "style": "...",
  "additionalRequirements": "...",
  "userAddress": "0x...",
  "referrer": "0xABC123..." // 从 402 响应的 ext.referrer 提取，在 body 中传递
}
```

**说明：**
- 从 Prompt Agent 的 402 响应中提取 referrer（`ext.referrer`）
- 在 request body 中传递给 Prompt Agent

---

### 5. Prompt Agent 验证支付后，从 request body 提取 referrer

**位置：** `app/api/prompt-agent/task/route.ts` (line 85-107)

**处理：**
```typescript
// 从 request body 提取 referrer（来自 Generate Agent 的 402 响应）
body = await request.json();
referrer = body.referrer !== undefined ? body.referrer : undefined;
```

---

### 6. Prompt Agent 调用合约，传递 referrer

**位置：** `app/api/prompt-agent/task/route.ts` (line 273-283)

**处理：**
```typescript
// 确保 referrer 是字符串
const finalReferrer = referrer || '';

// 调用合约，传递 referrer
const sbtResult = await makeContractPayment(
  amountBNB,
  `Prompt Agent Service Fee`,
  userAddress,
  PAYMENT_CONFIG.address,
  finalReferrer, // ← referrer 传递给合约
  rarity
);
```

---

## 关键点

1. **所有 referrer 传递都通过 request body**，不再使用 URL 参数
2. **402 响应中的 `ext.referrer`** 是 referrer 的传递载体
3. **第一次调用时**：在 request body 中传递 referrer
4. **402 响应中**：从 request body 提取 referrer，放在 `ext.referrer` 中
5. **第二次调用时**：从 402 响应的 `ext.referrer` 提取 referrer，在 request body 中传递
6. **最终调用合约时**：从 request body 提取 referrer，传递给合约

---

## 流程图

```
客户端
  ↓ (1) POST body: { referrer }
Generate Agent
  ↓ (2) 402: ext.referrer
客户端
  ↓ (3) 提取 ext.referrer，保存
  ↓ (4) 支付
  ↓ (5) POST body: { referrer } (来自 402)
Generate Agent
  ↓ (6) 提取 body.referrer
  ↓ (7) POST body: { referrer } (传递给 Prompt Agent)
Prompt Agent
  ↓ (8) 402: ext.referrer
Generate Agent
  ↓ (9) 提取 ext.referrer
  ↓ (10) 支付
  ↓ (11) POST body: { referrer } (来自 402)
Prompt Agent
  ↓ (12) 提取 body.referrer
  ↓ (13) 调用合约: makeContractPayment(..., referrer)
合约
```

---

## 修改的文件

1. `app/page.tsx` - 客户端：从 402 响应提取 referrer，在 body 中传递
2. `app/api/generate-agent/task/route.ts` - Generate Agent：从 body 提取 referrer，在 402 响应中返回
3. `app/api/a2a-agent/agent-client.ts` - Generate Agent → Prompt Agent：从 402 响应提取 referrer，在 body 中传递
4. `app/api/prompt-agent/task/route.ts` - Prompt Agent：从 body 提取 referrer，在 402 响应中返回，调用合约时传递

