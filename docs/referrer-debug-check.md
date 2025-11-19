# Referrer 传递问题诊断

## 检查每个环节

### 环节 1: Generate Agent 获取 referrer ✅

**位置：** `app/api/generate-agent/task/route.ts:272`

```typescript
const referrer = requestUrl.searchParams.get('referrer') || undefined;
```

**问题：** ✅ 正确
- 如果 URL 中有 referrer，会获取到值
- 如果 URL 中没有 referrer，会是 `undefined`

---

### 环节 2: Generate Agent 传递给 callPromptAgentWithPayment ✅

**位置：** `app/api/generate-agent/task/route.ts:403`

```typescript
referrer || undefined // Pass referrer from Generate Agent's 402 response
```

**问题：** ✅ 正确
- 如果 referrer 有值，会传递
- 如果 referrer 是 `undefined`，传递 `undefined`

---

### 环节 3: callPromptAgentWithPayment 接收 ✅

**位置：** `app/api/a2a-agent/agent-client.ts:215`

```typescript
referrer?: string // Optional: Referrer
```

**问题：** ✅ 正确
- 参数定义正确

---

### 环节 4: callPromptAgentWithPayment 处理 ✅

**位置：** `app/api/a2a-agent/agent-client.ts:372`

```typescript
const finalReferrer = referrer || '';
```

**问题：** ✅ 正确
- 如果 referrer 是 `undefined`，会变成空字符串 `''`
- 如果 referrer 有值，会保留

---

### 环节 5: callPromptAgentWithPayment 第二次调用时传递 ✅

**位置：** `app/api/a2a-agent/agent-client.ts:508`

```typescript
referrer: finalReferrer || ''
```

**问题：** ✅ 正确
- 会传递空字符串或实际值

---

### 环节 6: Prompt Agent 接收 ⚠️ **已修复**

**位置：** `app/api/prompt-agent/task/route.ts:89`

**修复前：**
```typescript
referrer = body.referrer || undefined;
```

**问题：** ❌ **这里有问题！**
- 如果 `body.referrer` 是空字符串 `''`，`'' || undefined` 会变成 `undefined`
- 空字符串应该被视为有效值（即使它是空的），不应该被转换为 `undefined`

**修复后：**
```typescript
referrer = body.referrer !== undefined ? body.referrer : undefined;
```

**说明：**
- 如果 `body.referrer` 存在（即使是空字符串），会保留原值
- 如果 `body.referrer` 不存在（`undefined`），才是 `undefined`

---

### 环节 7: Prompt Agent 调用 makeContractPayment ✅

**位置：** `app/api/prompt-agent/task/route.ts:268`

```typescript
const finalReferrer = referrer || '';
const sbtResult = await makeContractPayment(
  amountBNB,
  `Prompt Agent Service Fee`,
  userAddress,
  PAYMENT_CONFIG.address,
  finalReferrer, // Referrer
  rarity
);
```

**问题：** ✅ 正确
- 如果 referrer 是 `undefined`，会变成空字符串 `''`
- 如果 referrer 有值，会保留

---

### 环节 8: makeContractPayment 编码到合约 ✅

**位置：** `app/api/payment/simple.ts:156`

```typescript
const referrerString = typeof referrer === 'string' ? referrer : '';
const data = iface.encodeFunctionData(methodName, [
  recipient, 
  description || '', 
  referrerString
]);
```

**问题：** ✅ 正确
- referrer 会被正确编码到合约调用数据中

---

## 发现的问题

### **问题 1：环节 6 - Prompt Agent 接收时，空字符串被转换为 undefined**

**位置：** `app/api/prompt-agent/task/route.ts:89`

**原因：**
- 使用 `body.referrer || undefined` 时，如果 `body.referrer` 是空字符串 `''`，会被转换为 `undefined`
- 空字符串应该被视为有效值（即使它是空的），不应该被转换为 `undefined`

**修复：**
- 改为 `body.referrer !== undefined ? body.referrer : undefined`
- 这样空字符串会被保留，只有字段不存在时才是 `undefined`

---

## 修复后的流程

1. Generate Agent 获取 referrer（从 URL 参数）
2. Generate Agent 传递给 callPromptAgentWithPayment
3. callPromptAgentWithPayment 处理：`referrer || ''`（undefined 变成空字符串）
4. callPromptAgentWithPayment 第二次调用时传递：`referrer: finalReferrer || ''`
5. Prompt Agent 接收：`body.referrer !== undefined ? body.referrer : undefined` ← **已修复**
   - 如果 body.referrer 是空字符串，会保留空字符串
   - 如果 body.referrer 不存在，才是 undefined
6. Prompt Agent 调用 makeContractPayment：`referrer || ''`（确保是字符串）
7. makeContractPayment 编码到合约：`referrerString`（传递给合约）

---

## 验证方法

可以通过以下日志验证：

1. **Generate Agent 传递时：**
   ```
   Referrer from Generate Agent 402 response (user payment): 0xABC123...
   ```

2. **callPromptAgentWithPayment 传递时：**
   ```
   Referrer (from 402 response, passed in body): 0xABC123...
   ```

3. **Prompt Agent 接收时（新增日志）：**
   ```
   🔍 Request Body Parsing Debug:
     - body.referrer: 0xABC123...
     - Extracted referrer: 0xABC123...
   ```

4. **Prompt Agent 调用合约时：**
   ```
   📤 Calling makeContractPayment with referrer: 0xABC123...
   ```

5. **makeContractPayment 编码时：**
   ```
   📤 Parameters passed to contract:
     - referrer: 0xABC123...
   ```

---

## 总结

**主要问题：** 环节 6 中，Prompt Agent 接收 referrer 时，空字符串被错误地转换为 `undefined`。

**修复：** 已修复为 `body.referrer !== undefined ? body.referrer : undefined`，确保空字符串被保留。

现在 referrer 应该能正确传递到合约了。

