# 安全支付服务

## 概述

这是一个安全的支付服务实现，使用**独立签名服务**模式，避免在主服务器上暴露私钥。

## 架构

```
┌─────────────────┐
│  Agent 服务器    │  (不存储私钥)
│  (业务逻辑)      │
└────────┬────────┘
         │ 1. 请求签名
         ▼
┌─────────────────┐
│  签名服务        │  (存储私钥)
│  /api/payment/  │
│     sign        │
└────────┬────────┘
         │ 2. 返回签名后的交易
         ▼
┌─────────────────┐
│  Agent 服务器    │
└────────┬────────┘
         │ 3. 广播交易
         ▼
┌─────────────────┐
│  广播服务        │  (不存储私钥)
│  /api/payment/  │
│   broadcast     │
└────────┬────────┘
         │ 4. 提交到区块链
         ▼
┌─────────────────┐
│   区块链网络     │
└─────────────────┘
```

## 端点

### 1. 签名服务
**POST** `/api/payment/sign`

签名支付交易，私钥存储在此服务中。

**请求：**
```json
{
  "to": "0x合约地址或收款地址",
  "value": "0.01",
  "data": "0x...",  // 可选，智能合约调用数据
  "nonce": 123,     // 可选，自动获取
  "gasPrice": "5",  // 可选，自动获取
  "gasLimit": "21000" // 可选，自动估算
}
```

**响应：**
```json
{
  "success": true,
  "signedTransaction": "0x...",
  "from": "0x签名钱包地址",
  "to": "0x...",
  "value": "0.01",
  "nonce": 123
}
```

### 2. 广播服务
**POST** `/api/payment/broadcast`

广播已签名的交易到区块链。

**请求：**
```json
{
  "signedTransaction": "0x签名后的交易数据"
}
```

**响应：**
```json
{
  "success": true,
  "transactionHash": "0x交易哈希"
}
```

## 环境变量配置

### 签名服务需要配置：
```env
# 支付私钥（仅签名服务需要）
PAYMENT_PRIVATE_KEY=0x你的私钥

# 签名服务的钱包地址（Agent 服务器需要，用于获取 nonce）
SIGNING_WALLET_ADDRESS=0x钱包地址

# RPC URL
PAYMENT_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/

# 智能合约地址（如果使用合约支付）
PAYMENT_CONTRACT_ADDRESS=0x合约地址
```

### Agent 服务器需要配置：
```env
# 签名服务 URL（可以是同一服务器或独立服务器）
SIGNING_SERVICE_URL=http://localhost:3000/api/payment/sign

# 广播服务 URL
BROADCAST_SERVICE_URL=http://localhost:3000/api/payment/broadcast

# 签名服务的钱包地址（用于获取 nonce）
SIGNING_WALLET_ADDRESS=0x钱包地址

# RPC URL
PAYMENT_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/

# 智能合约地址
PAYMENT_CONTRACT_ADDRESS=0x合约地址
```

## 使用示例

### 在 Agent 中调用智能合约支付

```typescript
import { makeContractPayment } from '@/app/api/payment/utils';

// 调用智能合约支付
const result = await makeContractPayment(
  '0x316fb57ae002066a406c649c42ed33d04ac0c8f2', // recipient
  '0.01', // amount (BNB)
  '支付描述' // description
);

if (result.success) {
  console.log('支付成功，交易哈希:', result.txHash);
} else {
  console.error('支付失败:', result.error);
}
```

### 直接转账

```typescript
import { makeDirectPayment } from '@/app/api/payment/utils';

// 直接转账
const result = await makeDirectPayment(
  '0x316fb57ae002066a406c649c42ed33d04ac0c8f2', // recipient
  '0.01' // amount (BNB)
);

if (result.success) {
  console.log('转账成功，交易哈希:', result.txHash);
}
```

## 安全建议

### 1. 签名服务安全
- ✅ 私钥存储在环境变量中（生产环境使用密钥管理服务，如 AWS Secrets Manager、HashiCorp Vault）
- ✅ 添加 IP 白名单限制
- ✅ 添加 API Key 认证
- ✅ 记录所有签名操作
- ✅ 使用 HTTPS
- ✅ 考虑使用硬件安全模块（HSM）

### 2. 部署建议
- **开发环境**：签名服务和 Agent 可以在同一服务器
- **生产环境**：签名服务应该部署在独立的、更安全的服务器上
- **高安全要求**：考虑使用 HSM 或密钥管理服务

### 3. 监控和审计
- 记录所有签名请求
- 监控异常交易
- 设置交易金额限制
- 设置交易频率限制

## 部署选项

### 选项 1: 同一服务器（开发/测试）
```
Agent 服务器
├── /api/payment/sign (签名服务)
├── /api/payment/broadcast (广播服务)
└── /api/a2a-agent/task (Agent 业务逻辑)
```

### 选项 2: 独立签名服务（推荐生产环境）
```
Agent 服务器                   签名服务服务器
├── /api/payment/broadcast     ├── /api/payment/sign
└── /api/a2a-agent/task        └── (存储私钥)
```

### 选项 3: 使用第三方服务
- AWS KMS (密钥管理服务)
- HashiCorp Vault
- Azure Key Vault
- Google Cloud KMS

## 优势

1. ✅ **私钥隔离**：主服务器不存储私钥
2. ✅ **易于审计**：所有签名操作都有日志
3. ✅ **灵活部署**：可以独立部署签名服务
4. ✅ **安全性高**：即使 Agent 服务器被攻破，私钥仍然安全
5. ✅ **易于扩展**：可以添加多个签名服务实现高可用

