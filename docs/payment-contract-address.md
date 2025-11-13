# PAYMENT_CONTRACT_ADDRESS 说明

## 什么是 PAYMENT_CONTRACT_ADDRESS？

`PAYMENT_CONTRACT_ADDRESS` 是智能合约的地址，用于通过智能合约进行支付。这个合约实现了 `makePayment` 函数，可以接收支付并转发给指定的收款地址。

## 是否必须？

**不是必须的，取决于支付方式：**

### 1. 使用智能合约支付（需要 PAYMENT_CONTRACT_ADDRESS）

如果使用 `makeContractPayment` 函数，**必须**配置 `PAYMENT_CONTRACT_ADDRESS`。

**使用场景：**
- Generate Agent 自动支付给 Prompt Agent（当前实现）
- 需要记录支付信息（如 SBT Token）
- 需要额外的支付逻辑（如分成、手续费等）

**代码位置：**
```typescript
// app/api/a2a-agent/payment-helper.ts
const paymentResult = await makeContractPayment(
  recipient,
  pricing.price,
  description
);
```

**环境变量：**
```env
PAYMENT_CONTRACT_ADDRESS=0x<智能合约地址>
PAYMENT_PRIVATE_KEY=<Generate Agent 钱包私钥>
```

### 2. 使用直接转账（不需要 PAYMENT_CONTRACT_ADDRESS）

如果使用 `makeDirectPayment` 函数，**不需要** `PAYMENT_CONTRACT_ADDRESS`。

**使用场景：**
- 简单的直接转账
- 不需要额外的支付逻辑
- 不需要记录支付信息

**代码位置：**
```typescript
// app/api/payment/simple.ts
const paymentResult = await makeDirectPayment(
  recipient,
  amount
);
```

**环境变量：**
```env
PAYMENT_PRIVATE_KEY=<Generate Agent 钱包私钥>
# 不需要 PAYMENT_CONTRACT_ADDRESS
```

## 当前项目的使用情况

### Generate Agent 自动支付给 Prompt Agent

当前实现使用 `makeContractPayment`，所以**需要**配置 `PAYMENT_CONTRACT_ADDRESS`：

```typescript
// app/api/a2a-agent/payment-helper.ts
// 5. 调用支付功能
const paymentResult = await makeContractPayment(
  recipient,
  pricing.price,
  `支付给 ${discovery.card.name} 的 ${capabilityName} 能力`
);
```

### 如果改为直接转账

如果想使用直接转账，可以修改 `payment-helper.ts`：

```typescript
// 改为使用直接转账
const paymentResult = await makeDirectPayment(
  recipient,
  pricing.price
);
```

这样就不需要 `PAYMENT_CONTRACT_ADDRESS` 了。

## 智能合约接口

如果使用智能合约支付，合约需要实现以下接口：

```solidity
function makePayment(address recipient, string memory description) 
    payable 
    returns (uint256 tokenId)
```

**功能：**
- 接收支付（`payable`）
- 将资金转发给 `recipient`
- 可选：记录支付信息（如 SBT Token）
- 返回 Token ID（如果有）

## 配置建议

### 方案 1: 使用智能合约支付（推荐）

**优点：**
- 可以记录支付信息
- 可以发行 SBT Token
- 可以添加额外的支付逻辑

**缺点：**
- 需要部署智能合约
- 需要配置合约地址
- Gas 费用稍高

**环境变量：**
```env
PAYMENT_CONTRACT_ADDRESS=0x<智能合约地址>
PAYMENT_PRIVATE_KEY=<Generate Agent 钱包私钥>
```

### 方案 2: 使用直接转账（简单）

**优点：**
- 简单直接
- 不需要智能合约
- Gas 费用较低

**缺点：**
- 无法记录支付信息
- 无法发行 SBT Token
- 功能有限

**环境变量：**
```env
PAYMENT_PRIVATE_KEY=<Generate Agent 钱包私钥>
# 不需要 PAYMENT_CONTRACT_ADDRESS
```

## 如何选择？

### 如果您的智能合约已部署

如果您已经部署了支付智能合约，使用方案 1（智能合约支付）。

### 如果还没有智能合约

如果您还没有智能合约，可以选择：

1. **部署智能合约**（如果需要记录支付信息或 SBT Token）
2. **使用直接转账**（如果只需要简单转账）

## 修改为直接转账

如果想改为直接转账，修改 `app/api/a2a-agent/payment-helper.ts`：

```typescript
// 将 makeContractPayment 改为 makeDirectPayment
const paymentResult = await makeDirectPayment(
  recipient,
  pricing.price
);
```

这样就不需要 `PAYMENT_CONTRACT_ADDRESS` 了。

## 总结

- **使用智能合约支付**：需要 `PAYMENT_CONTRACT_ADDRESS` ✅
- **使用直接转账**：不需要 `PAYMENT_CONTRACT_ADDRESS` ❌
- **当前实现**：使用智能合约支付，所以需要配置 `PAYMENT_CONTRACT_ADDRESS`

