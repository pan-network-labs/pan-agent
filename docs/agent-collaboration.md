# Agent 协作文档

## 概述

本项目包含两个 A2A Agent，它们可以相互协作：

1. **Prompt Agent** (`/api/prompt-agent`) - 生成提示词
2. **Image Generation Agent** (`/api/a2a-agent`) - 生成图片

## 架构图

```
┌─────────────────────────────────────────────────────────┐
│                   用户或其他 Agent                      │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ 调用 generate_image_with_prompt
                     ▼
┌─────────────────────────────────────────────────────────┐
│         Image Generation Agent                          │
│         /api/a2a-agent                                  │
│                                                          │
│  1. 接收请求 (topic, style, ...)                       │
│  2. 调用 Prompt Agent                                   │
│  3. 获取生成的 prompt                                   │
│  4. 使用 prompt 生成图片                                │
│  5. 返回图片 URL                                        │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ A2A 协议调用
                     │ POST /api/prompt-agent/task
                     │ { method: "generate_prompt", ... }
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Prompt Agent                               │
│              /api/prompt-agent                          │
│                                                          │
│  1. 接收请求 (topic, style, ...)                       │
│  2. 生成优化的 prompt                                 │
│  3. 返回 prompt                                         │
└─────────────────────────────────────────────────────────┘
```

## 使用流程

### 方式 1: 直接使用 Prompt Agent

```typescript
// 1. 调用 Prompt Agent 生成 prompt
const promptResponse = await fetch('http://localhost:3000/api/prompt-agent/task', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'generate_prompt',
    params: {
      topic: '一只可爱的小猫咪',
      style: '抽象',
    },
    id: 1,
  }),
});

const promptResult = await promptResponse.json();
const prompt = promptResult.result.prompt;

// 2. 使用生成的 prompt 调用 Image Generation Agent
const imageResponse = await fetch('http://localhost:3000/api/a2a-agent/task', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-PAYMENT': base64EncodedTxHash,
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'generate_image',
    params: { prompt },
    id: 2,
  }),
});
```

### 方式 2: 使用 Image Generation Agent 的自动调用功能（推荐）

```typescript
// Image Generation Agent 会自动调用 Prompt Agent
const response = await fetch('http://localhost:3000/api/a2a-agent/task', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-PAYMENT': base64EncodedTxHash,
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'generate_image_with_prompt',
    params: {
      topic: '一只可爱的小猫咪',
      style: '抽象',
      additionalRequirements: '色彩鲜艳',
      // promptAgentUrl: 'http://localhost:3000/api/prompt-agent' // 可选
    },
    id: 1,
  }),
});

const result = await response.json();
// result.result.imageUrl - 生成的图片 URL
// result.result.prompt - 使用的 prompt
// result.result.topic - 原始主题
```

## Image Generation Agent 的新方法

### `generate_image_with_prompt`

这是新增的方法，它会：
1. 接收主题、风格等参数
2. 自动调用 Prompt Agent 生成 prompt
3. 使用生成的 prompt 生成图片
4. 返回图片 URL 和使用的 prompt

**参数：**
- `topic` (string, 必需): 图片主题
- `style` (string, 可选): 艺术风格
- `additionalRequirements` (string, 可选): 额外要求
- `promptAgentUrl` (string, 可选): Prompt Agent 的 URL（默认从环境变量读取）

**响应：**
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

## 环境变量配置

### Image Generation Agent 需要：

```env
# Prompt Agent 的 URL（可选，默认：http://localhost:3000/api/prompt-agent）
PROMPT_AGENT_URL=http://localhost:3000/api/prompt-agent

# 其他配置...
ZHIPUAI_API_KEY=...
PAYMENT_PRIVATE_KEY=...
```

## Agent 发现

两个 Agent 都可以被其他 A2A Agent 发现：

```typescript
// 发现 Prompt Agent
const promptCard = await fetch('http://localhost:3000/api/prompt-agent/.well-known/agent.json')
  .then(res => res.json());

// 发现 Image Generation Agent
const imageCard = await fetch('http://localhost:3000/api/a2a-agent/.well-known/agent.json')
  .then(res => res.json());
```

## 优势

1. **模块化**：每个 Agent 专注于自己的功能
2. **可重用**：Prompt Agent 可以被其他 Agent 调用
3. **符合 A2A 协议**：两个 Agent 都完全符合 Google A2A 协议
4. **易于扩展**：可以轻松添加更多 Agent 或功能

## 扩展建议

1. **增强 Prompt Agent**：
   - 集成 AI 模型（GPT、Claude）来生成更智能的 prompt
   - 支持多种 prompt 风格模板
   - 支持 prompt 优化和迭代

2. **添加更多 Agent**：
   - Image Enhancement Agent（图片增强）
   - Style Transfer Agent（风格迁移）
   - Image Analysis Agent（图片分析）

3. **Agent 编排**：
   - 实现 Agent 编排服务，自动协调多个 Agent 完成复杂任务

