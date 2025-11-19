# Generate Agent 接收 Referrer 流程

## 完整流程

### 1. 前端提取 Referrer

**位置：** `app/page.tsx` (line 258-260)

```typescript
// Get referrer from current page URL query parameters
const urlParams = new URLSearchParams(window.location.search);
const referrer = urlParams.get('referrer') || '';
```

**说明：**
- 用户访问页面：`https://example.com/?referrer=0xABC123...`
- 前端从 URL 查询参数中提取 referrer

---

### 2. 前端调用 Generate Agent

**位置：** `app/page.tsx` (line 262-266)

```typescript
// Build request URL, add referrer to query parameters if it exists
let requestUrl = '/api/generate-agent/task';
if (referrer) {
  requestUrl += `?referrer=${encodeURIComponent(referrer)}`;
}
```

**请求示例：**
```
POST /api/generate-agent/task?referrer=0xABC123...
```

**说明：**
- 前端将 referrer 作为 URL 查询参数传递
- 如果 referrer 不存在，则不添加查询参数

---

### 3. Generate Agent 接收 Referrer

**位置：** `app/api/generate-agent/task/route.ts` (line 271-272)

```typescript
// Get current request URL as resource
const requestUrl = new URL(request.url);
const resource = requestUrl.toString();

// Get referrer from query parameters (referrer address)
const referrer = requestUrl.searchParams.get('referrer') || undefined;
```

**说明：**
- Generate Agent 从 URL 查询参数中读取 referrer
- 如果 URL 中没有 referrer 参数，则 `referrer` 为 `undefined`

---

### 4. Generate Agent 返回 402 响应（包含 Referrer）

**位置：** `app/api/generate-agent/task/route.ts` (line 284)

```typescript
const x402Response = createX402Response({
  price: PAYMENT_CONFIG.price,
  currency: PAYMENT_CONFIG.currency,
  network: PAYMENT_CONFIG.network,
  address: PAYMENT_CONFIG.address,
  resource: resource,
  description: 'Payment required to generate image',
  mimeType: 'application/json',
  referrer: referrer, // Include referrer in response if present
});
```

**响应格式：**
```json
{
  "x402Version": 1,
  "accepts": [{
    "ext": {
      "referrer": "0xABC123..."
    }
  }]
}
```

**说明：**
- 如果 referrer 存在，会在 402 响应的 `ext.referrer` 字段中返回
- 如果 referrer 不存在，`ext` 字段可能不存在，或 `ext.referrer` 为 `undefined`

---

### 5. Generate Agent 调用 Prompt Agent（传递 Referrer）

**位置：** `app/api/generate-agent/task/route.ts` (line 391-401)

```typescript
// Get referrer from request URL, pass to Prompt Agent
const referrer = requestUrl.searchParams.get('referrer') || '';

console.log('Generate Agent calling Prompt Agent, referrer passed:', referrer || '(empty string)');

const promptResult = await callPromptAgentWithPayment(
  agentUrl,
  defaultTopic,
  'abstract',
  'rich in color, full of creativity',
  userAddress, // Pass user address for SBT issuance to user
  referrer || undefined // Pass referrer to Prompt Agent
);
```

**说明：**
- Generate Agent 再次从 URL 查询参数中读取 referrer（与步骤 3 相同）
- 将 referrer 传递给 `callPromptAgentWithPayment` 函数
- 如果 referrer 是空字符串，会转换为 `undefined`

---

### 6. callPromptAgentWithPayment 处理 Referrer

**位置：** `app/api/a2a-agent/agent-client.ts` (line 243)

```typescript
body: JSON.stringify({
  topic,
  style,
  additionalRequirements,
  referrer: referrer || '', // Pass referrer in body (keep empty string instead of undefined)
}),
```

**说明：**
- `callPromptAgentWithPayment` 将 referrer 放在 request body 中传递给 Prompt Agent
- 如果 referrer 是 `undefined`，会使用空字符串 `''`，确保字段存在

---

## 关键点总结

### 1. Referrer 来源

- **用户访问页面：** `https://example.com/?referrer=0xABC123...`
- **前端提取：** 从 URL 查询参数中提取
- **前端传递：** 作为 URL 查询参数传递给 Generate Agent
- **Generate Agent 接收：** 从 URL 查询参数中读取

### 2. Referrer 传递路径

```
用户访问页面（URL 参数）
    ↓
前端提取 referrer（URL 参数）
    ↓
前端调用 Generate Agent（URL 参数）
    ↓
Generate Agent 接收 referrer（URL 参数）
    ↓
Generate Agent 返回 402 响应（ext.referrer）
    ↓
Generate Agent 调用 Prompt Agent（request body）
    ↓
Prompt Agent 接收 referrer（request body）
```

### 3. 代码位置

| 步骤 | 文件 | 行号 | 说明 |
|------|------|------|------|
| 前端提取 | `app/page.tsx` | 258-260 | 从 URL 查询参数提取 |
| 前端传递 | `app/page.tsx` | 262-266 | 作为 URL 查询参数传递 |
| Generate Agent 接收 | `app/api/generate-agent/task/route.ts` | 271-272 | 从 URL 查询参数读取 |
| Generate Agent 返回 402 | `app/api/generate-agent/task/route.ts` | 284 | 在 ext.referrer 中返回 |
| Generate Agent 调用 Prompt Agent | `app/api/generate-agent/task/route.ts` | 391-401 | 从 URL 查询参数读取并传递 |
| callPromptAgentWithPayment | `app/api/a2a-agent/agent-client.ts` | 243 | 在 request body 中传递 |

---

## 注意事项

1. **Generate Agent 从 URL 查询参数读取 referrer：**
   - 第一次读取（line 272）：用于 402 响应
   - 第二次读取（line 391）：用于调用 Prompt Agent
   - 两次读取都来自同一个 URL 查询参数

2. **Referrer 格式：**
   - 从 URL 查询参数读取时，如果不存在，`searchParams.get('referrer')` 返回 `null`
   - 代码中使用 `|| undefined` 或 `|| ''` 处理 `null` 值

3. **Referrer 传递：**
   - Generate Agent → Prompt Agent：通过 request body 传递
   - 如果 referrer 是 `undefined`，会转换为空字符串 `''`，确保字段存在

---

## 调试日志

Generate Agent 中的关键日志：

```typescript
// Line 294
console.log('Referrer:', referrer || '(empty string)');

// Line 393
console.log('Generate Agent calling Prompt Agent, referrer passed:', referrer || '(empty string)');
```

这些日志可以帮助追踪 referrer 的值。

