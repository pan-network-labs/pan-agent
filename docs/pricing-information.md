# Agent 调用价格参数

## 概述

每个 A2A Agent 的能力（capability）现在都包含 `pricing` 字段，用于暴露调用该能力所需的价格信息。

## 价格信息结构

### 在 Agent Card 中的位置

价格信息出现在两个地方：

1. **全局支付信息** (`payment` 字段)
   - 默认价格
   - 支付要求
   - 网络和地址信息

2. **每个能力的价格** (`capabilities[].pricing` 字段)
   - 每个能力的具体价格
   - 可能包含特殊说明

### 价格字段结构

```json
{
  "capabilities": [
    {
      "name": "generate_image",
      "pricing": {
        "price": "0.01",
        "currency": "BNB",
        "network": "BSCTest",
        "address": "0x316fb57ae002066a406c649c42ed33d04ac0c8f2",
        "note": "可选说明"
      }
    }
  ],
  "payment": {
    "required": true,
    "defaultPrice": "0.01",
    "currency": "BNB",
    "network": "BSCTest",
    "address": "0x316fb57ae002066a406c649c42ed33d04ac0c8f2",
    "minAmount": "0.01",
    "pricingModel": "per_call",
    "note": "每个能力的具体价格请查看 capabilities[].pricing 字段"
  }
}
```

## 价格字段说明

### capabilities[].pricing

| 字段 | 类型 | 说明 |
|------|------|------|
| `price` | string | 调用该能力所需的价格 |
| `currency` | string | 货币类型（如：BNB） |
| `network` | string | 区块链网络（如：BSCTest） |
| `address` | string | 收款地址（可选） |
| `note` | string | 价格说明（可选） |

### payment 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `required` | boolean | 是否必须支付 |
| `defaultPrice` | string | 默认价格 |
| `currency` | string | 货币类型 |
| `network` | string | 区块链网络 |
| `address` | string | 收款地址 |
| `minAmount` | string | 最小支付金额 |
| `pricingModel` | string | 定价模式（per_call, free 等） |
| `note` | string | 说明信息 |

## 使用示例

### 获取能力价格

```typescript
// 1. 获取 Agent Card
const response = await fetch('http://localhost:3000/api/a2a-agent/.well-known/agent.json');
const agentCard = await response.json();

// 2. 查找特定能力的价格
const generateImageCapability = agentCard.capabilities.find(
  cap => cap.name === 'generate_image'
);

if (generateImageCapability?.pricing) {
  console.log('价格:', generateImageCapability.pricing.price);
  console.log('货币:', generateImageCapability.pricing.currency);
  console.log('网络:', generateImageCapability.pricing.network);
  console.log('地址:', generateImageCapability.pricing.address);
}
```

### 检查是否需要支付

```typescript
// 检查全局支付要求
if (agentCard.payment?.required) {
  console.log('需要支付:', agentCard.payment.defaultPrice, agentCard.payment.currency);
  
  // 检查特定能力的价格
  const capability = agentCard.capabilities.find(cap => cap.name === 'generate_image');
  if (capability?.pricing) {
    console.log('能力价格:', capability.pricing.price);
  }
}
```

### 在 Agent 间协作时使用价格信息

```typescript
// Image Generation Agent 调用 Prompt Agent 前检查价格
const promptAgentCard = await getAgentCard('http://localhost:3000/api/prompt-agent');

const generatePromptCapability = promptAgentCard.card.capabilities.find(
  cap => cap.name === 'generate_prompt'
);

if (generatePromptCapability?.pricing) {
  const price = generatePromptCapability.pricing.price;
  
  if (price === '0') {
    console.log('Prompt Agent 免费，可以直接调用');
  } else {
    console.log('需要支付:', price, generatePromptCapability.pricing.currency);
    // 执行支付逻辑
  }
}
```

## 当前项目的价格配置

### Image Generation Agent

- `generate_image`: 0.01 BNB
- `generate_image_with_prompt`: 0.01 BNB（包含 Prompt Agent 调用费用）
- `make_payment`: 免费（此方法用于支付，本身不收费）

### Prompt Agent

- `generate_prompt`: 免费

## 可视化展示

在 `/agents` 页面中，每个能力都会显示：
- 价格标签（右上角）
- 免费能力显示为绿色"免费"
- 付费能力显示价格和货币
- 价格说明（如果有）

## 环境变量配置

价格信息从环境变量读取：

```env
PAYMENT_PRICE=0.01
PAYMENT_CURRENCY=BNB
PAYMENT_NETWORK=BSCTest
PAYMENT_ADDRESS=0x316fb57ae002066a406c649c42ed33d04ac0c8f2
PAYMENT_MIN_AMOUNT=0.01
```

## 优势

1. **透明定价**：调用者可以提前知道每个能力的价格
2. **灵活定价**：不同能力可以有不同的价格
3. **易于发现**：通过 Agent Card 自动发现价格信息
4. **支持免费能力**：可以标记某些能力为免费

