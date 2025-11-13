# 钱包地址配置

## 默认钱包地址

### Generate Agent 收款地址
- **地址**: `0x74cc09316deab81ee874839e1da9e84ec066369c`
- **用途**: 用户支付给 Generate Agent 的收款地址
- **环境变量**: `PAYMENT_ADDRESS`

### Prompt Agent 收款地址
- **地址**: 使用智能合约地址（合约直接收款）
- **用途**: Generate Agent 支付给 Prompt Agent 的收款地址（通过智能合约）
- **环境变量**: `PAYMENT_CONTRACT_ADDRESS`

## 配置说明

### 环境变量覆盖

如果设置了环境变量，会优先使用环境变量的值：

```env
# Generate Agent 收款地址（用户支付给 Generate Agent）
PAYMENT_ADDRESS=0x74cc09316deab81ee874839e1da9e84ec066369c

# Prompt Agent 收款地址（Generate Agent 支付给 Prompt Agent，通过智能合约）
PAYMENT_CONTRACT_ADDRESS=<智能合约地址>
```

### 代码中的默认值

如果没有设置环境变量，代码会使用以下默认值：

- **Generate Agent**: `0x74cc09316deab81ee874839e1da9e84ec066369c`
- **Prompt Agent**: 使用 `PAYMENT_CONTRACT_ADDRESS`（智能合约地址，合约直接收款）

## 支付流程

```
用户
  ↓ 支付 0.02 BNB
Generate Agent (0x74cc09316deab81ee874839e1da9e84ec066369c)
  ↓ 自动支付 0.01 BNB（通过智能合约）
智能合约 (PAYMENT_CONTRACT_ADDRESS)
  ↓ 合约直接收款
Prompt Agent（通过智能合约收款）
  ↓ 返回 prompt
Generate Agent
  ↓ 生成图片
返回结果
```

## 验证

### 检查 Generate Agent 收款地址

```bash
# 访问 Agent Card
curl http://localhost:3000/api/a2a-agent/.well-known/agent.json | jq '.payment.address'
# 应该返回: "0x74cc09316deab81ee874839e1da9e84ec066369c"
```

### 检查 Prompt Agent 收款地址

```bash
# 访问 Agent Card
curl http://localhost:3000/api/prompt-agent/.well-known/agent.json | jq '.payment.address'
# 应该返回: <智能合约地址>（PAYMENT_CONTRACT_ADDRESS）
```

## 注意事项

1. **Generate Agent 钱包私钥**: 需要配置 `PAYMENT_PRIVATE_KEY` 环境变量，用于 Generate Agent 自动支付给 Prompt Agent
2. **地址验证**: 支付验证会检查交易是否支付给正确的合约地址
3. **智能合约支付**: 合约直接收款，不需要 `recipient` 参数，资金直接发送到合约地址

