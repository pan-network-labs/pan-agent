# 402 响应数据格式说明

## 概述

当 API 返回 402 状态码（Payment Required）时，响应体包含 x402 标准格式的支付信息。

## 数据格式

### x402 标准格式

```json
{
  "x402Version": 1,
  "accepts": [
    {
      "scheme": "exact",
      "network": "BSCTest",
      "currency": "BNB",
      "address": "0x572a218854da215873ff55ebbef9d766a415527b",
      "maxAmountRequired": "20000000000000000",
      "resource": "http://localhost:3000/api/generate-agent/task?address=0x572a218854da215873ff55ebbef9d766a415527b",
      "description": "Payment required to generate image",
      "mimeType": "application/json"
    }
  ]
}
```

## 字段说明

### 顶层字段

- **`x402Version`** (number): x402 协议版本号，当前为 `1`
- **`accepts`** (array): 可接受的支付方式数组，通常包含一个元素

### accepts 数组中的对象字段

- **`scheme`** (string): 支付方案，当前使用 `"exact"`（精确支付）
- **`network`** (string): 区块链网络名称，如 `"BSCTest"`（BSC 测试网）
- **`currency`** (string): 货币类型，如 `"BNB"`
- **`address`** (string): 收款地址（智能合约地址或钱包地址）
- **`maxAmountRequired`** (string): 所需支付的最大金额，**Wei 格式的字符串**（如 `"20000000000000000"` 表示 0.02 BNB）
- **`resource`** (string): 需要支付的资源的完整 URL，包含地址查询参数
- **`description`** (string): 资源的描述信息
- **`mimeType`** (string): 资源响应的 MIME 类型，通常为 `"application/json"`

## 实际示例

### Generate Agent 的 402 响应

```json
{
  "x402Version": 1,
  "accepts": [
    {
      "scheme": "exact",
      "network": "BSCTest",
      "currency": "BNB",
      "address": "0x572a218854da215873ff55ebbef9d766a415527b",
      "maxAmountRequired": "20000000000000000",
      "resource": "http://localhost:3000/api/generate-agent/task?address=0x572a218854da215873ff55ebbef9d766a415527b",
      "description": "Payment required to generate image",
      "mimeType": "application/json"
    }
  ]
}
```

### Prompt Agent 的 402 响应

```json
{
  "x402Version": 1,
  "accepts": [
    {
      "scheme": "exact",
      "network": "BSCTest",
      "currency": "BNB",
      "address": "0x54B694Ec8c04C2b9153598f7830a7ef3e05C3cf1",
      "maxAmountRequired": "10000000000000000",
      "resource": "http://localhost:3000/api/prompt-agent/task?address=0x54B694Ec8c04C2b9153598f7830a7ef3e05C3cf1",
      "description": "Payment required to access prompt generation service",
      "mimeType": "application/json"
    }
  ]
}
```

## 在前端查看

当收到 402 响应时，支付弹窗中会显示一个可展开的区域，点击 **"📋 查看 402 响应数据格式"** 即可查看完整的响应数据。

## 金额格式说明

- **`maxAmountRequired`** 字段使用 **Wei 格式的字符串**
- 1 BNB = 10^18 Wei
- 示例：
  - `"10000000000000000"` = 0.01 BNB
  - `"20000000000000000"` = 0.02 BNB

## 使用方式

### 在浏览器中查看

1. 访问测试页面：`http://localhost:3000`
2. 点击"生成图片"按钮
3. 当出现支付弹窗时，点击 **"📋 查看 402 响应数据格式"** 展开查看

### 通过 API 测试

```bash
# 测试 Generate Agent 的 402 响应
curl -X POST "http://localhost:3000/api/generate-agent/task" \
  -H "Content-Type: application/json" \
  -d '{}'

# 测试 Prompt Agent 的 402 响应
curl -X POST "http://localhost:3000/api/prompt-agent/task" \
  -H "Content-Type: application/json" \
  -d '{"topic": "测试"}'
```

## 注意事项

1. **金额格式**：`maxAmountRequired` 是 Wei 格式的字符串，不是 BNB 格式
2. **地址格式**：`address` 字段包含收款地址（通常是智能合约地址）
3. **resource URL**：包含完整的资源 URL，可用于重新请求
4. **向后兼容**：如果 `address` 字段不存在，可以从 `resource` URL 的查询参数中提取

