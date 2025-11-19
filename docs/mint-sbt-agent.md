# mintNSBT/mintRSBT/mintSSBT 调用者分析

## 答案：**Prompt Agent** 调用这些方法

## 详细说明

### 1. Prompt Agent 调用 makeContractPayment

**文件：** `app/api/prompt-agent/task/route.ts`  
**行号：** 263-270

```typescript
const sbtResult = await makeContractPayment(
  amountBNB,
  `Prompt Agent Service Fee`,
  userAddress, // User address (receives SBT)
  PAYMENT_CONFIG.address, // Contract address
  finalReferrer, // Referrer
  rarity // SBT level (N, R, or S) ← 这里传递 SBT 级别
);
```

**说明：**
- Prompt Agent 在验证支付后，会随机生成 SBT 级别（N、R 或 S）
- 然后调用 `makeContractPayment`，传递 `rarity` 参数

---

### 2. makeContractPayment 根据 rarity 选择合约方法

**文件：** `app/api/payment/simple.ts`  
**行号：** 128-156

```typescript
// Select method name based on rarity
const methodName = rarity === 'N' ? 'mintNSBT' : rarity === 'R' ? 'mintRSBT' : 'mintSSBT';

const iface = new ethers.Interface([
  `function ${methodName}(address recipient, string memory description, string memory referrer) payable returns (uint256 tokenId)`
]);

// Encode function call data
const data = iface.encodeFunctionData(methodName, [
  recipient, 
  description || '', 
  referrerString
]);
```

**说明：**
- `makeContractPayment` 根据 `rarity` 参数选择对应的合约方法：
  - `rarity === 'N'` → `mintNSBT`
  - `rarity === 'R'` → `mintRSBT`
  - `rarity === 'S'` → `mintSSBT`

---

### 3. Prompt Agent 使用 PROMPT_PRIVATE_KEY 调用合约

**文件：** `app/api/payment/simple.ts`  
**行号：** 35-36

```typescript
// Prioritize PROMPT_PRIVATE_KEY, otherwise use PAYMENT_PRIVATE_KEY
const privateKey = process.env.PROMPT_PRIVATE_KEY || process.env.PAYMENT_PRIVATE_KEY || '';
```

**说明：**
- `makeContractPayment` 优先使用 `PROMPT_PRIVATE_KEY`
- 这意味着合约调用是由 Prompt Agent 的私钥签名的

---

## 完整调用链

```
用户支付给 Generate Agent
    ↓
Generate Agent 验证支付
    ↓
Generate Agent 调用 Prompt Agent（第一次，无 X-PAYMENT）
    ↓
Prompt Agent 返回 402
    ↓
Generate Agent 支付给 Prompt Agent
    ↓
Generate Agent 调用 Prompt Agent（第二次，带 X-PAYMENT + referrer）
    ↓
Prompt Agent 验证支付
    ↓
Prompt Agent 随机生成 SBT 级别（N/R/S）
    ↓
Prompt Agent 调用 makeContractPayment(rarity, referrer) ← 【关键步骤】
    ↓
makeContractPayment 根据 rarity 选择方法：
  - rarity === 'N' → mintNSBT
  - rarity === 'R' → mintRSBT
  - rarity === 'S' → mintSSBT
    ↓
使用 PROMPT_PRIVATE_KEY 签名交易
    ↓
发送交易到合约
    ↓
合约执行 mintNSBT/mintRSBT/mintSSBT
    ↓
SBT 铸造给用户，referrer 信息存储到合约
```

---

## 其他可能的调用者

虽然 `makeContractPayment` 也被其他 Agent 调用，但在当前流程中：

### A2A Agent (`app/api/a2a-agent/task/route.ts`)
- 用于 `make_payment` capability
- 但这里固定使用 `rarity = 'N'`，不会根据随机数选择级别

### payment-helper (`app/api/a2a-agent/payment-helper.ts`)
- 用于 inter-agent payment
- 但这里不传递 `rarity` 参数，使用默认值

---

## 总结

**mintNSBT/mintRSBT/mintSSBT 这些方法主要是被 Prompt Agent 调用的：**

1. **Prompt Agent** 在验证支付后，随机生成 SBT 级别
2. **Prompt Agent** 调用 `makeContractPayment`，传递 `rarity` 和 `referrer`
3. **makeContractPayment** 根据 `rarity` 选择对应的合约方法
4. 使用 **PROMPT_PRIVATE_KEY** 签名交易
5. 发送交易到合约，执行 `mintNSBT/mintRSBT/mintSSBT`

因此，**Prompt Agent 是调用这些合约方法的主要 Agent**。

