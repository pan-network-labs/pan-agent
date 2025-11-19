# Referrer 传递到合约的完整流程

## 关键环节：Prompt Agent 调用合约的 mintNSBT/mintRSBT/mintSSBT

## 完整流程

### 1. Generate Agent 传递 Referrer 给 callPromptAgentWithPayment

**位置：** `app/api/generate-agent/task/route.ts` (line 397-404)

```typescript
const promptResult = await callPromptAgentWithPayment(
  agentUrl,
  defaultTopic,
  'abstract',
  'rich in color, full of creativity',
  userAddress,
  referrer || undefined // ← 这里传递 referrer（从 Generate Agent 的 402 响应中提取）
);
```

**说明：**
- `referrer` 来自 Generate Agent 的 URL 查询参数（用户访问页面时的 referrer）
- 这个 referrer 会被传递给 `callPromptAgentWithPayment` 函数

---

### 2. callPromptAgentWithPayment 第二次调用 Prompt Agent

**位置：** `app/api/a2a-agent/agent-client.ts` (line 507-513)

```typescript
body: JSON.stringify({
  topic,
  style,
  additionalRequirements,
  userAddress,
  referrer: finalReferrer || '', // ← 这里在 request body 中传递 referrer
}),
```

**说明：**
- `finalReferrer` 来自 `callPromptAgentWithPayment` 的参数（即 Generate Agent 传递的 referrer）
- 通过 request body 传递给 Prompt Agent

---

### 3. Prompt Agent 从 Request Body 读取 Referrer

**位置：** `app/api/prompt-agent/task/route.ts` (line 85-89)

```typescript
try {
  body = await request.json().catch(() => ({}));
  // Get referrer from request body (only in second call, from Generate Agent)
  referrer = body.referrer || undefined; // ← 这里从 body 中读取 referrer
} catch (error) {
  body = {};
  referrer = undefined;
}
```

**说明：**
- Prompt Agent 从 request body 中读取 `referrer` 字段
- 这是第二次调用（带 X-PAYMENT）时读取的

---

### 4. Prompt Agent 调用 makeContractPayment（传递 Referrer）

**位置：** `app/api/prompt-agent/task/route.ts` (line 260-270)

```typescript
const finalReferrer = referrer || ''; // Ensure referrer is always a string
console.log('📤 Calling makeContractPayment with referrer:', finalReferrer);

const sbtResult = await makeContractPayment(
  amountBNB,
  `Prompt Agent Service Fee`,
  userAddress, // User address (receives SBT)
  PAYMENT_CONFIG.address, // Contract address
  finalReferrer, // ← 这里传递 referrer 给 makeContractPayment
  rarity // SBT level
);
```

**说明：**
- Prompt Agent 将从 body 中读取的 `referrer` 传递给 `makeContractPayment` 函数
- 如果 referrer 是 `undefined`，会转换为空字符串 `''`

---

### 5. makeContractPayment 选择合约方法并编码数据

**位置：** `app/api/payment/simple.ts` (line 128-156)

```typescript
// Select method name based on rarity
const methodName = rarity === 'N' ? 'mintNSBT' : rarity === 'R' ? 'mintRSBT' : 'mintSSBT';

const iface = new ethers.Interface([
  `function ${methodName}(address recipient, string memory description, string memory referrer) payable returns (uint256 tokenId)`
]);

// referrer is already string format, use empty string if not provided
const referrerString = typeof referrer === 'string' ? referrer : '';

// Encode function call data (using method name selected based on rarity)
const data = iface.encodeFunctionData(methodName, [
  recipient, 
  description || '', 
  referrerString // ← 这里将 referrer 编码到合约调用数据中
]);
```

**说明：**
- 根据 SBT 级别（N/R/S）选择对应的合约方法：`mintNSBT`、`mintRSBT` 或 `mintSSBT`
- 使用 `ethers.Interface.encodeFunctionData` 编码函数调用数据
- **referrer 在这里被编码到合约调用数据中**

---

### 6. 发送交易到合约

**位置：** `app/api/payment/simple.ts` (line 165-220)

```typescript
// Estimate gas and set sufficient gas limit
const gasEstimate = await provider.estimateGas({
  from: wallet.address,
  to: targetAddress,
  value: value,
  data: data, // ← 包含 referrer 的编码数据
});

// Send transaction
const tx = await wallet.sendTransaction({
  to: targetAddress,
  value: value,
  data: data, // ← 包含 referrer 的编码数据
  gasLimit: gasLimit,
});
```

**说明：**
- 使用 `wallet.sendTransaction` 发送交易到合约
- `data` 字段包含编码后的函数调用数据，其中包含 referrer 参数
- 合约接收到交易后，会调用 `mintNSBT/mintRSBT/mintSSBT` 方法，referrer 会被存储到合约中

---

## 关键环节总结

### **最关键的一步：第 5 步 - makeContractPayment 编码合约调用数据**

**文件：** `app/api/payment/simple.ts`  
**行号：** 156

```typescript
const data = iface.encodeFunctionData(methodName, [
  recipient, 
  description || '', 
  referrerString // ← referrer 在这里被编码到合约调用数据中
]);
```

这是 referrer 被传递到合约的**关键环节**：
1. `referrerString` 作为第三个参数传递给 `encodeFunctionData`
2. 根据 SBT 级别，调用 `mintNSBT(recipient, description, referrer)`、`mintRSBT(...)` 或 `mintSSBT(...)`
3. 编码后的数据包含在交易的 `data` 字段中
4. 交易发送到合约后，合约会解析参数并存储 referrer 信息

---

## 完整调用链

```
Generate Agent (line 403)
  ↓ 传递 referrer 参数
callPromptAgentWithPayment (line 215)
  ↓ 第二次调用时在 body 中传递
Prompt Agent (line 89)
  ↓ 从 body 读取
Prompt Agent (line 268)
  ↓ 调用 makeContractPayment，传递 referrer
makeContractPayment (line 69)
  ↓ 接收 referrer 参数
makeContractPayment (line 136)
  ↓ 转换为字符串格式
makeContractPayment (line 156)
  ↓ 编码到合约调用数据中 ← 【关键环节】
makeContractPayment (line 220)
  ↓ 发送交易到合约
合约 mintNSBT/mintRSBT/mintSSBT
  ↓ 接收并存储 referrer
```

---

## 验证方法

可以通过以下日志验证 referrer 是否正确传递：

1. **Prompt Agent 接收时：**
   ```
   🔍 Request Body Parsing Debug:
     - body.referrer: 0xABC123...
   ```

2. **调用 makeContractPayment 时：**
   ```
   📤 Calling makeContractPayment with referrer: 0xABC123...
   ```

3. **编码合约调用数据时：**
   ```
   📤 Parameters passed to contract:
     - referrer: 0xABC123...
   ```

4. **合约方法调用：**
   ```
   Contract method: mintNSBT
   Parameters: [recipient, description, referrer]
   ```

