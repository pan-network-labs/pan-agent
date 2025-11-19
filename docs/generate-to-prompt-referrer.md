# Generate Agent 传递 Referrer 至 Prompt Agent 的流程

## 完整流程

### 1. Generate Agent 获取 Referrer

**位置：** `app/api/generate-agent/task/route.ts` (line 271-272)

```typescript
// Get referrer from query parameters (referrer address)
const referrer = requestUrl.searchParams.get('referrer') || undefined;
```

**说明：**
- Generate Agent 从 URL 查询参数中读取 referrer
- 这个 referrer 来自用户访问页面时的 URL 参数（`?referrer=0xABC...`）

---

### 2. Generate Agent 调用 callPromptAgentWithPayment（传递 Referrer）

**位置：** `app/api/generate-agent/task/route.ts` (line 397-404)

```typescript
const promptResult = await callPromptAgentWithPayment(
  agentUrl,
  defaultTopic,
  'abstract',
  'rich in color, full of creativity',
  userAddress, // Pass user address for SBT issuance to user
  referrer || undefined // ← 这里传递 referrer 作为函数参数
);
```

**说明：**
- Generate Agent 将从 URL 参数中读取的 `referrer` 传递给 `callPromptAgentWithPayment` 函数
- 作为函数的最后一个参数传递

---

### 3. callPromptAgentWithPayment 第一次调用 Prompt Agent（不传 Referrer）

**位置：** `app/api/a2a-agent/agent-client.ts` (line 233-244)

```typescript
response = await fetch(requestUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    // Do not pass X-PAYMENT, let Prompt Agent return 402
  },
  body: JSON.stringify({
    topic,
    style,
    additionalRequirements,
    // Do not pass referrer in first call ← 第一次调用不传 referrer
  }),
});
```

**说明：**
- 第一次调用 Prompt Agent 时，不传递 referrer
- 目的是获取 Prompt Agent 的 402 响应（支付信息）

---

### 4. callPromptAgentWithPayment 支付给 Prompt Agent

**位置：** `app/api/a2a-agent/agent-client.ts` (line 419-422)

```typescript
const paymentResult = await makeDirectPayment(
  address, // Direct transfer to contract address
  amountBNB
);
```

**说明：**
- Generate Agent 使用 `makeDirectPayment` 直接转账给 Prompt Agent
- 这是 Agent 之间的支付，不涉及 referrer

---

### 5. callPromptAgentWithPayment 第二次调用 Prompt Agent（传递 Referrer）

**位置：** `app/api/a2a-agent/agent-client.ts` (line 497-509)

```typescript
secondResponse = await fetch(secondRequestUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-PAYMENT': xPayment, // Base64 编码的交易哈希
  },
  body: JSON.stringify({
    topic,
    style,
    additionalRequirements,
    userAddress,
    referrer: finalReferrer || '', // ← 【关键环节：在这里传递 referrer】
  }),
});
```

**说明：**
- `finalReferrer` 来自 `callPromptAgentWithPayment` 函数的参数（即 Generate Agent 传递的 referrer）
- 通过 request body 的 `referrer` 字段传递给 Prompt Agent
- 这是第二次调用（带 X-PAYMENT header），表示支付已完成

---

### 6. callPromptAgentWithPayment 中 Referrer 的处理

**位置：** `app/api/a2a-agent/agent-client.ts` (line 372)

```typescript
// Use referrer from Generate Agent's 402 response (user payment referrer)
// This referrer was passed as parameter to callPromptAgentWithPayment
// It will be passed to Prompt Agent in second call, and then to contract mintNSBT/mintRSBT/mintSSBT
const finalReferrer = referrer || '';
```

**说明：**
- `referrer` 是 `callPromptAgentWithPayment` 函数的参数（来自 Generate Agent）
- 转换为 `finalReferrer`（确保是字符串格式）
- 在第二次调用 Prompt Agent 时使用

---

## 完整调用链

```
用户访问页面（?referrer=0xABC...）
    ↓
前端调用 Generate Agent（URL 参数传递 referrer）
    ↓
Generate Agent 从 URL 参数读取 referrer (line 272)
    ↓
Generate Agent 调用 callPromptAgentWithPayment(referrer) (line 403)
    ↓
callPromptAgentWithPayment 第一次调用 Prompt Agent（不传 referrer）
    ↓
Prompt Agent 返回 402
    ↓
callPromptAgentWithPayment 支付给 Prompt Agent
    ↓
callPromptAgentWithPayment 第二次调用 Prompt Agent
    ↓
在 request body 中传递 referrer (line 508) ← 【关键环节】
    ↓
Prompt Agent 从 request body 读取 referrer (line 89)
    ↓
Prompt Agent 调用合约 mintNSBT/mintRSBT/mintSSBT(referrer)
```

---

## 关键环节总结

### **Generate Agent 传递 Referrer 的关键环节：**

**文件：** `app/api/a2a-agent/agent-client.ts`  
**行号：** 508

```typescript
body: JSON.stringify({
  topic,
  style,
  additionalRequirements,
  userAddress,
  referrer: finalReferrer || '', // ← 【关键环节：在这里传递 referrer】
}),
```

**说明：**
1. **时机：** Generate Agent 支付给 Prompt Agent 后，第二次调用 Prompt Agent 时
2. **方式：** 通过 HTTP POST 请求的 request body 传递
3. **字段名：** `referrer`
4. **格式：** JSON 字符串，referrer 作为 body 的一个字段
5. **来源：** Generate Agent 从 URL 查询参数中读取的 referrer（用户访问页面时的 referrer）

---

## 传递方式对比

### 第一次调用（不传 referrer）
```http
POST /api/prompt-agent/task HTTP/1.1
Content-Type: application/json

{
  "topic": "A beautiful abstract artwork",
  "style": "abstract",
  "additionalRequirements": "rich in color, full of creativity"
}
```

### 第二次调用（传递 referrer）
```http
POST /api/prompt-agent/task HTTP/1.1
Content-Type: application/json
X-PAYMENT: dHhIYXNo...

{
  "topic": "A beautiful abstract artwork",
  "style": "abstract",
  "additionalRequirements": "rich in color, full of creativity",
  "userAddress": "0x74cC09316deab81EE874839e1DA9E84Ec066369C",
  "referrer": "0xABC123..." ← 【referrer 在这里传递】
}
```

---

## 代码位置总结

| 步骤 | 文件 | 行号 | 说明 |
|------|------|------|------|
| Generate Agent 读取 referrer | `app/api/generate-agent/task/route.ts` | 272 | 从 URL 参数读取 |
| Generate Agent 传递 referrer | `app/api/generate-agent/task/route.ts` | 403 | 作为函数参数传递 |
| callPromptAgentWithPayment 接收 | `app/api/a2a-agent/agent-client.ts` | 215 | 函数参数 |
| callPromptAgentWithPayment 处理 | `app/api/a2a-agent/agent-client.ts` | 372 | 转换为 finalReferrer |
| callPromptAgentWithPayment 传递 | `app/api/a2a-agent/agent-client.ts` | 508 | 在 request body 中传递 |
| Prompt Agent 接收 | `app/api/prompt-agent/task/route.ts` | 89 | 从 request body 读取 |

---

## 总结

Generate Agent 通过以下方式将 referrer 传递至 Prompt Agent：

1. **获取 referrer：** 从 URL 查询参数中读取（用户访问页面时的 referrer）
2. **传递 referrer：** 作为参数传递给 `callPromptAgentWithPayment` 函数
3. **最终传递：** 在第二次调用 Prompt Agent 时，通过 HTTP POST 请求的 **request body** 传递
4. **字段名：** `referrer`
5. **时机：** Generate Agent 支付给 Prompt Agent 后，第二次调用时（带 X-PAYMENT header）

