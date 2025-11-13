# X402 支付流程完整说明

## 流程概述

完整的支付流程如下：

```
用户 → Generate Agent (X-PAYMENT) → Prompt Agent (X-PAYMENT) → 返回 prompt → Generate Agent 生成图片
```

## 详细步骤

### 1. 用户调用 Generate Agent

用户需要先支付给 Generate Agent，然后调用：

```bash
POST /api/a2a-agent/task
Headers:
  X-PAYMENT: <base64(txHash)>
Body:
{
  "jsonrpc": "2.0",
  "method": "generate_image_with_prompt",
  "params": {
    "topic": "一只可爱的小猫咪",
    "style": "抽象"
  },
  "id": 1
}
```

**支付验证：**
- Generate Agent 验证 X-PAYMENT 头
- 检查交易是否支付给正确的地址
- 检查金额是否 >= 0.01 BNB

### 2. Generate Agent 调用 Prompt Agent

Generate Agent 收到用户的支付后，需要调用 Prompt Agent：

**自动支付机制：**
1. Generate Agent 发现 Prompt Agent 的 Agent Card
2. 检查 `generate_prompt` 能力的价格
3. 如果价格 > 0：
   - Generate Agent 使用自己的钱包支付给 Prompt Agent
   - 获取交易哈希
   - 编码为 X-PAYMENT 头
4. 如果价格 = 0（免费）：
   - 传递用户的 X-PAYMENT（用于审计）

**调用 Prompt Agent：**
```typescript
// 自动准备支付
const paymentPrep = await preparePaymentForAgent(agentUrl, 'generate_prompt');

// 调用 Prompt Agent
const promptResult = await callPromptAgent(
  agentUrl,
  topic,
  style,
  additionalRequirements,
  paymentPrep.xPayment || userXPayment // 传递 X-PAYMENT
);
```

### 3. Prompt Agent 验证支付

Prompt Agent 收到请求后：

**如果价格 > 0：**
- 验证 X-PAYMENT 头
- 检查交易是否支付给 Prompt Agent 的地址
- 检查金额是否足够

**Prompt Agent 是付费的（0.01 BNB）：**
- 必须提供 X-PAYMENT 头
- 验证交易是否支付给智能合约地址（PAYMENT_CONTRACT_ADDRESS）
- 验证金额是否 >= 0.01 BNB

### 4. Prompt Agent 返回 Prompt

Prompt Agent 验证通过后，生成并返回 prompt：

```json
{
  "jsonrpc": "2.0",
  "result": {
    "prompt": "一幅抽象风格的画作，主题是：一只可爱的小猫咪",
    "topic": "一只可爱的小猫咪"
  },
  "id": 1
}
```

### 5. Generate Agent 生成图片

Generate Agent 收到 prompt 后，使用智谱AI生成图片：

```typescript
const imageResult = await generateImage(promptResult.prompt);
```

### 6. 返回最终结果

Generate Agent 返回图片 URL 和相关信息：

```json
{
  "jsonrpc": "2.0",
  "result": {
    "imageUrl": "https://...",
    "prompt": "一幅抽象风格的画作，主题是：一只可爱的小猫咪",
    "topic": "一只可爱的小猫咪"
  },
  "id": 1
}
```

## 支付机制详解

### X-PAYMENT 头格式

X-PAYMENT 头是交易哈希的 Base64 编码：

```typescript
// 编码
const txHash = "0x1234...";
const xPayment = Buffer.from(txHash, 'utf-8').toString('base64');

// 解码
const decoded = Buffer.from(xPayment, 'base64').toString('utf-8');
```

### 支付验证流程

1. **接收 X-PAYMENT 头**
2. **Base64 解码获取交易哈希**
3. **查询区块链获取交易详情**
4. **验证交易状态**（必须成功）
5. **验证收款地址**（智能合约或直接转账）
6. **验证金额**（>= 最小金额）

### Agent 间自动支付

当 Generate Agent 需要调用付费的 Prompt Agent 时：

```typescript
// 1. 发现 Agent Card
const discovery = await discoverAgentCard(`${agentUrl}/task`);

// 2. 查找能力价格
const capability = discovery.card.capabilities.find(
  cap => cap.name === 'generate_prompt'
);

// 3. 检查价格
const price = parseFloat(capability.pricing.price);
if (price > 0) {
  // 4. 执行支付（合约直接收款，不需要 recipient 参数）
  const paymentResult = await makeContractPayment(
    capability.pricing.price,
    '支付给 Prompt Agent'
  );
  
  // 5. 编码为 X-PAYMENT
  const xPayment = Buffer.from(paymentResult.txHash, 'utf-8').toString('base64');
}
```

## 当前配置

### Generate Agent
- **价格**: 0.02 BNB
- **网络**: BSCTest
- **地址**: 从环境变量 `PAYMENT_ADDRESS` 读取

### Prompt Agent
- **价格**: 0.01 BNB（付费）
- **网络**: BSCTest
- **地址**: 从环境变量 `PAYMENT_CONTRACT_ADDRESS` 读取（智能合约地址，合约直接收款）

## 环境变量

```env
# Generate Agent 支付配置
PAYMENT_PRICE=0.02
PAYMENT_CURRENCY=BNB
PAYMENT_NETWORK=BSCTest
PAYMENT_ADDRESS=0x316fb57ae002066a406c649c42ed33d04ac0c8f2
PAYMENT_MIN_AMOUNT=0.02
PAYMENT_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/
PAYMENT_CONTRACT_ADDRESS=<智能合约地址>
PAYMENT_PRIVATE_KEY=<Generate Agent 钱包私钥>

# Prompt Agent 支付配置
PROMPT_AGENT_PRICE=0.01
PROMPT_AGENT_CURRENCY=BNB
PROMPT_AGENT_NETWORK=BSCTest
# Prompt Agent 使用智能合约地址（合约直接收款）
PAYMENT_CONTRACT_ADDRESS=<智能合约地址>
PROMPT_AGENT_MIN_AMOUNT=0.01
```

## 测试流程

### 1. 测试用户支付给 Generate Agent

```bash
# 1. 先支付（获取交易哈希）
# 2. 编码交易哈希
echo -n "0x<txHash>" | base64

# 3. 调用 Generate Agent
curl -X POST http://localhost:3000/api/a2a-agent/task \
  -H "Content-Type: application/json" \
  -H "X-PAYMENT: <base64(txHash)>" \
  -d '{
    "jsonrpc": "2.0",
    "method": "generate_image_with_prompt",
    "params": {
      "topic": "一只可爱的小猫咪",
      "style": "抽象"
    },
    "id": 1
  }'
```

### 2. 验证流程

1. ✅ Generate Agent 验证用户支付（0.02 BNB）
2. ✅ Generate Agent 发现 Prompt Agent
3. ✅ Generate Agent 检查 Prompt Agent 价格（0.01 BNB，付费）
4. ✅ Generate Agent 自动支付给 Prompt Agent（通过智能合约）
5. ✅ Generate Agent 传递 X-PAYMENT 给 Prompt Agent
6. ✅ Prompt Agent 验证 X-PAYMENT（验证交易是否支付到合约地址）
7. ✅ Prompt Agent 生成 prompt
8. ✅ Generate Agent 使用 prompt 生成图片
9. ✅ 返回结果

## 注意事项

1. **合约直接收款**：Prompt Agent 使用智能合约直接收款，不需要 `recipient` 参数，资金直接发送到合约地址
2. **自动支付**：如果 Prompt Agent 是付费的，Generate Agent 会自动支付到合约地址
3. **支付失败处理**：如果自动支付失败，会返回错误并阻止流程
4. **交易确认**：支付验证需要交易已确认（receipt.status === 1）
5. **地址验证**：Prompt Agent 验证交易是否支付到 `PAYMENT_CONTRACT_ADDRESS`（合约地址）

