# Referrer 传递问题诊断

## 问题：Referrer 没有在合约中

## 可能的问题点

### 1. Generate Agent 第一次调用 Prompt Agent 时

**位置：** `app/api/generate-agent/task/route.ts` (line 391)

```typescript
const referrer = requestUrl.searchParams.get('referrer') || '';
```

**检查点：**
- ✅ Generate Agent 是否从 URL 参数中正确提取了 referrer？
- ✅ 是否传递给了 `callPromptAgentWithPayment`？

**调试日志：**
```typescript
console.log('Generate Agent calling Prompt Agent, referrer passed:', referrer || '(empty string)');
```

---

### 2. callPromptAgentWithPayment 第一次调用

**位置：** `app/api/a2a-agent/agent-client.ts` (line 243)

```typescript
body: JSON.stringify({
  topic,
  style,
  additionalRequirements,
  referrer: referrer || undefined, // Pass referrer in body
}),
```

**检查点：**
- ✅ referrer 是否在 request body 中正确传递？
- ⚠️ 如果 referrer 是空字符串 `''`，`referrer || undefined` 会变成 `undefined`

**调试日志：**
```typescript
console.log('Referrer (passed in body):', referrer || '(empty string)');
```

---

### 3. Prompt Agent 第一次接收（返回 402）

**位置：** `app/api/prompt-agent/task/route.ts` (line 91)

```typescript
referrer = body.referrer || undefined;
```

**检查点：**
- ✅ Prompt Agent 是否从 request body 中正确读取了 referrer？
- ⚠️ 如果 body.referrer 是 `undefined`，referrer 会是 `undefined`

**新增调试日志：**
```typescript
console.log('🔍 Request Body Parsing Debug:');
console.log('  - Body keys:', Object.keys(body));
console.log('  - body.referrer:', body.referrer);
console.log('  - body.referrer type:', typeof body.referrer);
console.log('  - Extracted referrer:', referrer);
```

---

### 4. Prompt Agent 返回 402 响应

**位置：** `app/api/prompt-agent/task/route.ts` (line 110)

```typescript
referrer: referrer, // Include referrer in response if present
```

**检查点：**
- ✅ 如果 referrer 是 `undefined`，402 响应中不会包含 `ext.referrer`
- ⚠️ 如果 referrer 是空字符串 `''`，402 响应中会包含 `ext.referrer: ""`

---

### 5. callPromptAgentWithPayment 从 402 响应提取 referrer

**位置：** `app/api/a2a-agent/agent-client.ts` (line 359)

```typescript
const referrer = requirement.ext?.referrer || '';
```

**检查点：**
- ✅ 如果 `ext.referrer` 不存在，referrer 会是空字符串 `''`
- ⚠️ 如果 `ext.referrer` 是 `undefined`，referrer 会是空字符串 `''`

**新增调试日志：**
```typescript
console.log('🔍 Referrer Extraction from 402 Response:');
console.log('  - requirement.ext:', requirement.ext);
console.log('  - requirement.ext?.referrer:', requirement.ext?.referrer);
console.log('  - Extracted referrer:', referrer);
```

---

### 6. callPromptAgentWithPayment 第二次调用

**位置：** `app/api/a2a-agent/agent-client.ts` (line 506)

```typescript
referrer: referrer || undefined, // Pass referrer from 402 response
```

**检查点：**
- ⚠️ 如果 referrer 是空字符串 `''`，`referrer || undefined` 会变成 `undefined`
- ⚠️ 这会导致第二次调用时 body 中没有 referrer 字段

**问题：** 这里应该保持空字符串，而不是转换为 undefined！

---

### 7. Prompt Agent 第二次接收（调用合约前）

**位置：** `app/api/prompt-agent/task/route.ts` (line 91)

```typescript
referrer = body.referrer || undefined;
```

**检查点：**
- ✅ 如果 body.referrer 是 `undefined`，referrer 会是 `undefined`
- ⚠️ 如果 body.referrer 是空字符串 `''`，referrer 会是空字符串 `''`

---

### 8. Prompt Agent 调用合约

**位置：** `app/api/prompt-agent/task/route.ts` (line 271)

```typescript
const finalReferrer = referrer || ''; // Ensure referrer is always a string
const sbtResult = await makeContractPayment(
  amountBNB,
  `Prompt Agent Service Fee`,
  userAddress,
  PAYMENT_CONFIG.address,
  finalReferrer, // Referrer (always string, empty string if not provided)
  rarity
);
```

**检查点：**
- ✅ 如果 referrer 是 `undefined`，finalReferrer 会是空字符串 `''`
- ✅ 如果 referrer 是空字符串 `''`，finalReferrer 会是空字符串 `''`

**新增调试日志：**
```typescript
console.log('🔍 Referrer Debug Information:');
console.log('  - referrer variable value:', referrer);
console.log('  - referrer type:', typeof referrer);
console.log('  - Final referrer passed to contract:', finalReferrer);
```

---

## 发现的问题

### 问题 1：第二次调用时 referrer 被转换为 undefined

**位置：** `app/api/a2a-agent/agent-client.ts` (line 506)

**当前代码：**
```typescript
referrer: referrer || undefined, // Pass referrer from 402 response
```

**问题：**
- 如果 referrer 是空字符串 `''`，`referrer || undefined` 会变成 `undefined`
- 这会导致 JSON.stringify 时，referrer 字段不存在
- Prompt Agent 读取时，body.referrer 会是 `undefined`

**修复建议：**
```typescript
referrer: referrer || '', // Pass referrer from 402 response (keep empty string if not provided)
```

---

## 修复方案

### 修复 1：保持 referrer 为字符串

修改 `app/api/a2a-agent/agent-client.ts` (line 506)：

```typescript
// 修改前
referrer: referrer || undefined,

// 修改后
referrer: referrer || '', // Keep empty string instead of undefined
```

这样即使 referrer 是空字符串，也会在 body 中传递，Prompt Agent 可以正确读取。

---

## 调试步骤

1. **检查第一次调用时 referrer 是否传递：**
   - 查看日志：`Generate Agent calling Prompt Agent, referrer passed: ...`
   - 查看日志：`Referrer (passed in body): ...`
   - 查看日志：`🔍 Request Body Parsing Debug:`

2. **检查 402 响应中是否有 referrer：**
   - 查看日志：`Referrer (from body): ...`
   - 查看 402 响应 JSON：`ext.referrer` 是否存在

3. **检查第二次调用时 referrer 是否传递：**
   - 查看日志：`🔍 Referrer Extraction from 402 Response:`
   - 查看日志：`Referrer (from 402 response, passed in body): ...`
   - 查看日志：`🔍 Request Body Parsing Debug:`（第二次调用）

4. **检查合约调用时 referrer 是否传递：**
   - 查看日志：`🔍 Referrer Debug Information:`
   - 查看日志：`📤 Calling makeContractPayment with referrer: ...`
   - 查看合约调用日志：`Parameters passed to contract:`

---

## 总结

主要问题可能在于：
1. **第二次调用时 referrer 被转换为 undefined**：如果从 402 响应中提取的 referrer 是空字符串，`referrer || undefined` 会变成 `undefined`，导致 body 中没有 referrer 字段
2. **第一次调用时 referrer 可能没有传递**：如果 Generate Agent 的 URL 中没有 referrer 参数，整个流程中都不会有 referrer

建议修复：保持 referrer 为字符串格式（空字符串 `''` 而不是 `undefined`），确保在整个流程中都能正确传递。

