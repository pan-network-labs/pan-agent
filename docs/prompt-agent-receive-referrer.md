# Prompt Agent 接收 Referrer 的环节

## 答案：在第二次调用时（带 X-PAYMENT），从 Request Body 中接收

## 详细流程

### 1. Generate Agent 第二次调用 Prompt Agent

**位置：** `app/api/a2a-agent/agent-client.ts` (line 497-509)

**时机：** Generate Agent 支付给 Prompt Agent 后，第二次调用 Prompt Agent（带 X-PAYMENT header）

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
    referrer: finalReferrer || '', // ← 这里在 request body 中传递 referrer
  }),
});
```

**说明：**
- `finalReferrer` 来自 Generate Agent 的 402 响应（用户支付给 Generate Agent 时的 referrer）
- 通过 request body 的 `referrer` 字段传递

---

### 2. Prompt Agent 接收请求（函数入口）

**位置：** `app/api/prompt-agent/task/route.ts` (line 71-94)

**时机：** Prompt Agent 的 POST 处理函数开始执行时

```typescript
export async function POST(request: NextRequest) {
  try {
    // 1. Payment validation (X-PAYMENT mechanism)
    const PAYMENT_CONFIG = getPaymentConfig();
    const xPaymentHeader = request.headers.get('X-PAYMENT');
    
    // Get current request URL as resource
    const requestUrl = new URL(request.url);
    const resource = requestUrl.toString();
    
    // Parse HTTP request body ← 【关键环节：在这里解析 body】
    let body: any = {};
    let referrer: string | undefined = undefined;
    
    try {
      // Try to parse body, but handle cases where body might be empty or invalid
      body = await request.json().catch(() => ({}));
      // Get referrer from request body (only in second call, from Generate Agent)
      referrer = body.referrer || undefined; // ← 【关键环节：在这里读取 referrer】
    } catch (error) {
      // If body parsing fails (e.g., empty body), use empty object
      body = {};
      referrer = undefined;
    }
```

**说明：**
- Prompt Agent 在函数开头就解析 request body
- 从 `body.referrer` 字段中读取 referrer
- 这是**第二次调用**时（带 X-PAYMENT），第一次调用时 body 中没有 referrer

---

### 3. Prompt Agent 使用 Referrer

**位置：** `app/api/prompt-agent/task/route.ts` (line 260-270)

**时机：** Prompt Agent 验证支付后，调用合约铸造 SBT 时

```typescript
const finalReferrer = referrer || ''; // Ensure referrer is always a string

const sbtResult = await makeContractPayment(
  amountBNB,
  `Prompt Agent Service Fee`,
  userAddress,
  PAYMENT_CONFIG.address,
  finalReferrer, // ← 使用从 body 中读取的 referrer
  rarity
);
```

**说明：**
- Prompt Agent 将从 body 中读取的 `referrer` 传递给 `makeContractPayment`
- 最终传递到合约的 `mintNSBT/mintRSBT/mintSSBT` 方法

---

## 完整调用链

```
Generate Agent 验证用户支付
    ↓
Generate Agent 调用 callPromptAgentWithPayment(referrer)
    ↓
callPromptAgentWithPayment 第一次调用 Prompt Agent（不传 referrer）
    ↓
Prompt Agent 返回 402（不包含 referrer）
    ↓
callPromptAgentWithPayment 支付给 Prompt Agent
    ↓
callPromptAgentWithPayment 第二次调用 Prompt Agent（带 X-PAYMENT + referrer in body）
    ↓
Prompt Agent POST 函数开始执行
    ↓
Prompt Agent 解析 request body ← 【接收 referrer 的环节】
    ↓
referrer = body.referrer || undefined
    ↓
Prompt Agent 验证支付（X-PAYMENT）
    ↓
Prompt Agent 随机生成 SBT 级别
    ↓
Prompt Agent 调用 makeContractPayment(referrer) ← 【使用 referrer】
    ↓
合约 mintNSBT/mintRSBT/mintSSBT(referrer) ← 【存储 referrer】
```

---

## 关键环节总结

### **Prompt Agent 接收 Referrer 的环节：**

**文件：** `app/api/prompt-agent/task/route.ts`  
**行号：** 85-89

```typescript
try {
  body = await request.json().catch(() => ({}));
  // Get referrer from request body (only in second call, from Generate Agent)
  referrer = body.referrer || undefined; // ← 【关键环节：在这里接收 referrer】
} catch (error) {
  body = {};
  referrer = undefined;
}
```

**说明：**
1. **时机：** Prompt Agent 的 POST 处理函数开始执行时（函数入口）
2. **方式：** 从 request body 中解析 JSON，读取 `referrer` 字段
3. **来源：** Generate Agent 第二次调用时，在 request body 中传递的 referrer
4. **条件：** 这是第二次调用（带 X-PAYMENT），第一次调用时 body 中没有 referrer

---

## 两次调用的区别

### 第一次调用（无 X-PAYMENT）
- **请求：** `POST /api/prompt-agent/task`
- **Body：** `{ topic, style, additionalRequirements }`
- **Referrer：** ❌ 不传递 referrer
- **响应：** 402 Payment Required（不包含 referrer）

### 第二次调用（带 X-PAYMENT）
- **请求：** `POST /api/prompt-agent/task`
- **Headers：** `X-PAYMENT: <base64-encoded-tx-hash>`
- **Body：** `{ topic, style, additionalRequirements, userAddress, referrer }` ← **包含 referrer**
- **响应：** 200 OK（包含 prompt 和 rarity）

---

## 验证方法

可以通过以下日志验证 referrer 的接收：

1. **Generate Agent 发送时：**
   ```
   Referrer (from 402 response, passed in body): 0xABC123...
   ```

2. **Prompt Agent 接收时（需要添加日志）：**
   ```
   🔍 Request Body Parsing Debug:
     - body.referrer: 0xABC123...
     - Extracted referrer: 0xABC123...
   ```

3. **Prompt Agent 使用 referrer 时：**
   ```
   📤 Calling makeContractPayment with referrer: 0xABC123...
   ```

