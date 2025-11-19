# Referrer 传递流程详解

## 完整流程图

```
用户访问页面（带 referrer）
    ↓
前端提取 referrer（URL 参数）
    ↓
调用 Generate Agent API（URL 参数传递 referrer）
    ↓
Generate Agent 返回 402 响应（ext.referrer 字段）
    ↓
前端支付给 Generate Agent（合约 makePayment，包含 referrer）
    ↓
Generate Agent 调用 Prompt Agent（URL 参数传递 referrer）
    ↓
Prompt Agent 返回 402 响应（ext.referrer 字段）
    ↓
Generate Agent 支付给 Prompt Agent（makeDirectPayment，不包含 referrer）
    ↓
Prompt Agent 调用合约铸造 SBT（mintNSBT/mintRSBT/mintSSBT，包含 referrer）
```

## 详细步骤

### 1. 用户访问页面（带 referrer）

**URL 示例：**
```
https://example.com/?referrer=0xABC123...
```

**代码位置：**
- 前端页面：`app/page.tsx`

### 2. 前端提取 referrer

**代码位置：** `app/page.tsx` (line 258-260)

```typescript
const urlParams = new URLSearchParams(window.location.search);
const referrer = urlParams.get('referrer') || '';
```

### 3. 前端调用 Generate Agent

**代码位置：** `app/page.tsx` (line 263-266)

```typescript
let requestUrl = '/api/generate-agent/task';
if (referrer) {
  requestUrl += `?referrer=${encodeURIComponent(referrer)}`;
}
```

**传递方式：** URL 查询参数

### 4. Generate Agent 接收 referrer

**代码位置：** `app/api/generate-agent/task/route.ts` (line 272)

```typescript
const referrer = requestUrl.searchParams.get('referrer') || undefined;
```

### 5. Generate Agent 返回 402 响应（包含 referrer）

**代码位置：** `app/api/generate-agent/task/route.ts` (line 284)

**响应格式：**
```json
{
  "x402Version": 1,
  "accepts": [{
    "address": "0x...",
    "maxAmountRequired": "5000000000000000",
    "ext": {
      "referrer": "0xABC123..."
    }
  }]
}
```

### 6. 前端从 402 响应提取 referrer

**代码位置：** `app/page.tsx` (line 310-314)

```typescript
const referrerFromResponse = requirement.ext?.referrer || '';
const referrerFromUrl = urlParams.get('referrer') || '';
const referrer = referrerFromResponse || referrerFromUrl || '';
```

**优先级：** 402 响应中的 referrer > URL 中的 referrer

### 7. 前端支付给 Generate Agent（包含 referrer）

**代码位置：** `app/page.tsx` (line 533-550)

**合约方法：**
```solidity
makePayment(address recipient, string memory description, string memory referrer) payable
```

**调用代码：**
```typescript
const referrerString = referrerFromUrl || paymentInfo.referrer || '';
const data = iface.encodeFunctionData('makePayment', [
  fromAddress, // recipient
  '', // description
  referrerString, // referrer
]);
```

**说明：** 这是用户支付给 Generate Agent，referrer 会被记录在合约中。

### 8. Generate Agent 调用 Prompt Agent（传递 referrer）

**代码位置：** `app/api/generate-agent/task/route.ts` (line 391-401)

```typescript
const referrer = requestUrl.searchParams.get('referrer') || '';
const promptResult = await callPromptAgentWithPayment(
  agentUrl,
  defaultTopic,
  'abstract',
  'rich in color, full of creativity',
  userAddress,
  referrer || undefined // 传递 referrer
);
```

**传递方式：** URL 查询参数

### 9. callPromptAgentWithPayment 处理 referrer

**代码位置：** `app/api/a2a-agent/agent-client.ts` (line 219-223)

```typescript
let requestUrl = `${promptAgentUrl}/task`;
if (referrer) {
  requestUrl += `?referrer=${encodeURIComponent(referrer)}`;
}
```

### 10. Prompt Agent 接收 referrer

**代码位置：** `app/api/prompt-agent/task/route.ts` (line 82)

```typescript
const referrer = requestUrl.searchParams.get('referrer') || undefined;
```

### 11. Prompt Agent 返回 402 响应（包含 referrer）

**代码位置：** `app/api/prompt-agent/task/route.ts` (line 95)

**响应格式：**
```json
{
  "x402Version": 1,
  "accepts": [{
    "address": "0x...",
    "maxAmountRequired": "1000000000000000",
    "ext": {
      "referrer": "0xABC123..."
    }
  }]
}
```

### 12. Generate Agent 支付给 Prompt Agent（不包含 referrer）

**代码位置：** `app/api/a2a-agent/agent-client.ts` (line 398-417)

```typescript
const { makeDirectPayment } = await import('../payment/simple');
const paymentResult = await makeDirectPayment(
  address, // 直接转账到合约地址
  amountBNB
);
```

**说明：** 
- 这是 Agent 之间的支付，使用 `makeDirectPayment`（直接转账）
- **不包含 referrer**，因为这是内部支付，不需要记录推荐关系
- 合约的 `receive()` 函数会接收这笔转账

### 13. Prompt Agent 调用合约铸造 SBT（包含 referrer）

**代码位置：** `app/api/prompt-agent/task/route.ts` (line 243-250)

**合约方法：**
```solidity
mintNSBT(address recipient, string memory description, string memory referrer) payable
mintRSBT(address recipient, string memory description, string memory referrer) payable
mintSSBT(address recipient, string memory description, string memory referrer) payable
```

**调用代码：**
```typescript
const sbtResult = await makeContractPayment(
  amountBNB,
  `Prompt Agent Service Fee`,
  userAddress, // recipient（用户地址，接收 SBT）
  PAYMENT_CONFIG.address, // contract address
  referrer || '', // referrer（如果为空则传空字符串）
  rarity // SBT 级别
);
```

**说明：** 
- 这是 Prompt Agent 为用户铸造 SBT
- **包含 referrer**，用于记录推荐关系
- referrer 会被记录在合约中，可以通过 `/api/referrer/query` 查询

## 关键点总结

1. **用户支付给 Generate Agent：**
   - 使用合约的 `makePayment` 方法
   - **包含 referrer**（用于记录推荐关系）

2. **Generate Agent 支付给 Prompt Agent：**
   - 使用 `makeDirectPayment`（直接转账）
   - **不包含 referrer**（这是内部支付，不需要记录推荐关系）

3. **Prompt Agent 为用户铸造 SBT：**
   - 使用合约的 `mintNSBT/mintRSBT/mintSSBT` 方法
   - **包含 referrer**（用于记录推荐关系）

4. **Referrer 传递方式：**
   - Agent 之间：URL 查询参数 `?referrer=0x...`
   - 402 响应：`ext.referrer` 字段
   - 合约调用：作为函数参数传递

5. **Referrer 优先级：**
   - 前端支付时：402 响应中的 referrer > URL 中的 referrer

## 查询 Referrer 信息

可以通过以下 API 查询 referrer 统计信息：

```
GET /api/referrer/query?type=stats&referrer=0xABC123...
GET /api/referrer/query?type=list
GET /api/referrer/query?type=tokens&referrer=0xABC123...
```

