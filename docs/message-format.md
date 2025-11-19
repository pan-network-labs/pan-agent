# 消息格式说明

本文档说明 referrer 在整个流程中的消息格式。

## 1. Generate Agent 第一次调用 Prompt Agent（无 X-PAYMENT）

### 请求格式

**URL:** `POST /api/prompt-agent/task`

**Headers:**
```json
{
  "Content-Type": "application/json"
}
```

**Request Body:**
```json
{
  "topic": "A beautiful abstract artwork",
  "style": "abstract",
  "additionalRequirements": "rich in color, full of creativity",
  "referrer": "0xABC123..." // 可选，推荐人地址（字符串格式）
}
```

**说明：**
- `referrer` 字段在 request body 中传递
- 如果 `referrer` 不存在，则传递 `undefined` 或不包含该字段
- `referrer` 是字符串格式，可以是地址或推荐码

---

## 2. Prompt Agent 返回 402 响应（Payment Required）

### 响应格式

**Status Code:** `402 Payment Required`

**Response Body:**
```json
{
  "x402Version": 1,
  "accepts": [
    {
      "scheme": "exact",
      "network": "BSCTest",
      "currency": "BNB",
      "address": "0xD2509adAAB191DDAcBFb37396815caB27CA21bD6",
      "maxAmountRequired": "1000000000000000", // Wei 格式（字符串）
      "resource": "https://example.com/api/prompt-agent/task?address=0xD2509adAAB191DDAcBFb37396815caB27CA21bD6",
      "description": "Payment required to access prompt generation service",
      "mimeType": "application/json",
      "ext": {
        "referrer": "0xABC123..." // 可选，从 request body 中提取的 referrer
      }
    }
  ]
}
```

**说明：**
- `ext.referrer` 字段包含从 request body 中提取的 referrer
- 如果 request body 中没有 referrer，则 `ext` 字段可能不存在，或 `ext.referrer` 为 `undefined`

---

## 3. Generate Agent 第二次调用 Prompt Agent（带 X-PAYMENT）

### 请求格式

**URL:** `POST /api/prompt-agent/task`

**Headers:**
```json
{
  "Content-Type": "application/json",
  "X-PAYMENT": "dHhIYXNo..." // Base64 编码的交易哈希
}
```

**Request Body:**
```json
{
  "topic": "A beautiful abstract artwork",
  "style": "abstract",
  "additionalRequirements": "rich in color, full of creativity",
  "userAddress": "0x74cC09316deab81EE874839e1DA9E84Ec066369C", // 用户地址（用于接收 SBT）
  "referrer": "0xABC123..." // 可选，从第一次 402 响应的 ext.referrer 中提取
}
```

**说明：**
- `X-PAYMENT` header 包含 Base64 编码的交易哈希（Generate Agent 支付给 Prompt Agent 的交易）
- `userAddress` 是用户地址，用于接收 SBT
- `referrer` 从第一次 402 响应的 `ext.referrer` 中提取，并在 request body 中传递

---

## 4. Prompt Agent 调用合约铸造 SBT

### 合约方法调用

**合约地址:** `0xD2509adAAB191DDAcBFb37396815caB27CA21bD6`

**方法签名:**
```solidity
// N 级别
function mintNSBT(address recipient, string memory description, string memory referrer) payable returns (uint256 tokenId)

// R 级别
function mintRSBT(address recipient, string memory description, string memory referrer) payable returns (uint256 tokenId)

// S 级别
function mintSSBT(address recipient, string memory description, string memory referrer) payable returns (uint256 tokenId)
```

**调用参数:**
```javascript
{
  recipient: "0x74cC09316deab81EE874839e1DA9E84Ec066369C", // 用户地址（接收 SBT）
  description: "Prompt Agent Service Fee", // 描述
  referrer: "0xABC123..." // 推荐人（字符串格式，如果为空则传空字符串 ""）
}
```

**说明：**
- `recipient` 是用户地址，SBT 将铸造给该地址
- `description` 是 SBT 的描述信息
- `referrer` 是字符串格式，从 request body 中提取，如果不存在则传递空字符串 `""`

---

## 5. Prompt Agent 返回成功响应

### 响应格式

**Status Code:** `200 OK`

**Response Body:**
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "data": "环境变量中的提示词（根据级别）", // Prompt 内容
    "rarity": "N" // SBT 级别：N, R, 或 S
  }
}
```

**说明：**
- `data.data` 包含根据 SBT 级别从环境变量中读取的 prompt
- `data.rarity` 包含随机生成的 SBT 级别（N, R, 或 S）

---

## 完整流程示例

### 步骤 1: Generate Agent → Prompt Agent（第一次调用）

**Request:**
```http
POST /api/prompt-agent/task HTTP/1.1
Content-Type: application/json

{
  "topic": "A beautiful abstract artwork",
  "style": "abstract",
  "additionalRequirements": "rich in color, full of creativity",
  "referrer": "0xABC123..."
}
```

**Response:**
```http
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "x402Version": 1,
  "accepts": [{
    "scheme": "exact",
    "network": "BSCTest",
    "currency": "BNB",
    "address": "0xD2509adAAB191DDAcBFb37396815caB27CA21bD6",
    "maxAmountRequired": "1000000000000000",
    "resource": "https://example.com/api/prompt-agent/task?address=0xD2509adAAB191DDAcBFb37396815caB27CA21bD6",
    "description": "Payment required to access prompt generation service",
    "mimeType": "application/json",
    "ext": {
      "referrer": "0xABC123..."
    }
  }]
}
```

### 步骤 2: Generate Agent → Prompt Agent（第二次调用，带 X-PAYMENT）

**Request:**
```http
POST /api/prompt-agent/task HTTP/1.1
Content-Type: application/json
X-PAYMENT: dHhIYXNo...

{
  "topic": "A beautiful abstract artwork",
  "style": "abstract",
  "additionalRequirements": "rich in color, full of creativity",
  "userAddress": "0x74cC09316deab81EE874839e1DA9E84Ec066369C",
  "referrer": "0xABC123..."
}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "code": 200,
  "msg": "success",
  "data": {
    "data": "A beautiful abstract artwork, rich in color, full of creativity",
    "rarity": "N"
  }
}
```

### 步骤 3: Prompt Agent → 合约（铸造 SBT）

**合约调用:**
```javascript
mintNSBT(
  "0x74cC09316deab81EE874839e1DA9E84Ec066369C", // recipient
  "Prompt Agent Service Fee", // description
  "0xABC123..." // referrer
)
```

---

## 关键点总结

1. **Referrer 传递方式：**
   - 仅通过 **request body** 传递（不再使用 URL 查询参数）
   - 在第一次调用和第二次调用时都通过 body 传递

2. **Referrer 格式：**
   - 字符串格式（`string`）
   - 可以是地址（如 `"0xABC123..."`）或推荐码
   - 如果不存在，传递 `undefined` 或空字符串 `""`

3. **Referrer 来源：**
   - 第一次调用：从 Generate Agent 的请求 URL 中提取（用户访问页面时的 `?referrer=...`）
   - 第二次调用：从第一次 402 响应的 `ext.referrer` 中提取

4. **Referrer 使用：**
   - 在 402 响应中返回（`ext.referrer`）
   - 在调用合约铸造 SBT 时传递（作为 `referrer` 参数）

