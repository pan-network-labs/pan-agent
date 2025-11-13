# Prompt Agent

这是一个符合 Google A2A 协议的提示词生成代理。

## 功能

根据主题、风格等要求生成图片生成的提示词（prompt）。

## 端点

### 1. 获取代理卡片
```
GET /api/prompt-agent/.well-known/agent.json
```

### 2. 处理任务请求
```
POST /api/prompt-agent/task
```

## 支持的方法

### `generate_prompt`

根据主题生成提示词。

**请求示例：**
```json
{
  "jsonrpc": "2.0",
  "method": "generate_prompt",
  "params": {
    "topic": "一只可爱的小猫咪",
    "style": "抽象",
    "additionalRequirements": "色彩鲜艳"
  },
  "id": 1
}
```

**成功响应：**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "prompt": "一幅抽象风格的画作，主题是：一只可爱的小猫咪，色彩鲜艳",
    "topic": "一只可爱的小猫咪"
  },
  "id": 1
}
```

## 使用示例

```typescript
const response = await fetch('http://localhost:3000/api/prompt-agent/task', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
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

const result = await response.json();
console.log('生成的 prompt:', result.result.prompt);
```

## 与其他 Agent 的协作

这个 Agent 可以被其他 A2A Agent 调用，例如：
- Image Generation Agent 可以调用它来生成 prompt，然后使用该 prompt 生成图片

