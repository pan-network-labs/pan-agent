# A2A Agent 暴露与发现机制

## 概述

A2A (Agent-to-Agent) 协议使用 **Agent Card** 作为 Agent 的"名片"，通过 HTTP 端点暴露 Agent 的能力和接口信息。其他 Agent 或客户端可以通过标准化的方式发现和调用这些 Agent。

## 1. Agent 如何暴露自己

### 1.1 通过 HTTP 端点暴露 Agent Card

每个 A2A Agent 都通过 HTTP GET 端点暴露自己的 Agent Card：

#### 标准路径（A2A 协议推荐）
```
GET /.well-known/agent.json
```

#### 项目中的实现

**Image Generation Agent:**
- 标准路径：`GET /api/a2a-agent/.well-known/agent.json`

**Prompt Agent:**
- 标准路径：`GET /api/prompt-agent/.well-known/agent.json`

### 1.2 Agent Card 的内容

Agent Card 是一个 JSON 文档，包含：

```json
{
  "@context": "https://a2a.plus/context.jsonld",
  "@type": "Agent",
  "name": "Image Generation Agent",
  "description": "一个基于智谱AI的图片生成代理...",
  "version": "1.0.0",
  "capabilities": [
    {
      "name": "generate_image",
      "description": "根据文本提示词生成图片",
      "inputSchema": { ... },
      "outputSchema": { ... }
    }
  ],
  "endpoints": {
    "task": "http://localhost:3000/api/a2a-agent/task",
    "agentCard": "http://localhost:3000/api/a2a-agent/.well-known/agent.json"
  },
  "payment": { ... },
  "metadata": { ... }
}
```

### 1.3 代码实现

```typescript
// app/api/a2a-agent/.well-known/agent.json/route.ts
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const agentCard = getAgentCard(baseUrl);
  
  return NextResponse.json(agentCard, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
```

## 2. Agent 如何被发现

### 2.1 发现方式

#### 方式 1: 直接访问标准路径（推荐）

如果知道 Agent 的基础 URL，可以直接访问标准路径：

```typescript
// 知道基础 URL
const baseUrl = 'http://localhost:3000/api/a2a-agent';

// 直接访问标准路径
const response = await fetch(`${baseUrl}/.well-known/agent.json`);
const agentCard = await response.json();
```

#### 方式 2: 从端点推断（智能发现）

如果只知道 task 端点，可以自动推断 Agent Card 的位置：

```typescript
// 只知道 task 端点
const taskEndpoint = 'http://localhost:3000/api/a2a-agent/task';

// 自动推断基础 URL
const baseUrl = taskEndpoint.replace(/\/task$/, '');

// 尝试标准路径
const response = await fetch(`${baseUrl}/.well-known/agent.json`);
const agentCard = await response.json();
```

#### 方式 3: 使用发现函数（推荐）

项目提供了智能发现函数：

```typescript
import { discoverAgentCard } from '@/app/api/a2a-agent/agent-client';

// 从任意端点自动发现
const result = await discoverAgentCard('http://localhost:3000/api/a2a-agent/task');

if (result.success) {
  console.log('Agent 名称:', result.card.name);
  console.log('能力列表:', result.card.capabilities);
}
```

### 2.2 智能发现策略

`getAgentCard()` 函数会按优先级尝试多个路径：

```typescript
// app/api/a2a-agent/agent-client.ts
const possiblePaths = [
  `${baseUrl}/.well-known/agent.json`,  // 1. 标准路径（最高优先级）
  `${baseUrl}/agent-card`,               // 2. 兼容路径
  `${baseUrl}/agentCard`,                // 3. 驼峰命名变体
  `${baseUrl}/card`,                     // 4. 简化路径
];

// 依次尝试，找到第一个可用的路径
for (const path of possiblePaths) {
  const response = await fetch(path);
  if (response.ok) {
    return await response.json();
  }
}
```

### 2.3 从 Agent Card 获取端点

Agent Card 中包含 `endpoints` 字段，声明了所有端点：

```typescript
// 1. 获取 Agent Card
const cardResult = await getAgentCard('http://localhost:3000/api/a2a-agent');

// 2. 从 Agent Card 中获取 task 端点
const taskEndpoint = cardResult.card.endpoints.task;
// taskEndpoint = "http://localhost:3000/api/a2a-agent/task"

// 3. 使用 task 端点调用 Agent
const response = await fetch(taskEndpoint, {
  method: 'POST',
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'generate_image',
    params: { prompt: '...' },
    id: 1,
  }),
});
```

## 3. 完整的工作流程

### 3.1 Agent 暴露流程

```
1. Agent 启动
   ↓
2. 提供 HTTP 端点
   - GET /.well-known/agent.json (标准路径)
   - GET /agent-card (兼容路径)
   ↓
3. 端点返回 Agent Card JSON
   - 包含能力声明 (capabilities)
   - 包含端点信息 (endpoints)
   - 包含元数据 (metadata)
```

### 3.2 Agent 发现流程

```
1. 客户端知道 Agent 的基础 URL 或端点
   ↓
2. 尝试访问标准路径
   GET /.well-known/agent.json
   ↓
3. 如果失败，尝试兼容路径
   GET /agent-card
   ↓
4. 获取 Agent Card
   ↓
5. 解析 Agent Card
   - 读取能力列表
   - 读取端点信息
   - 验证 Agent 类型
   ↓
6. 使用 Agent Card 中的信息调用 Agent
```

### 3.3 Agent 间协作流程

```
Image Generation Agent
   ↓
1. 需要调用 Prompt Agent
   ↓
2. 发现 Prompt Agent
   discoverAgentCard('http://localhost:3000/api/prompt-agent/task')
   ↓
3. 获取 Prompt Agent Card
   - 发现能力：generate_prompt
   - 获取端点：/api/prompt-agent/task
   ↓
4. 调用 Prompt Agent
   POST /api/prompt-agent/task
   { method: "generate_prompt", params: {...} }
   ↓
5. 获取生成的 prompt
   ↓
6. 使用 prompt 生成图片
```

## 4. 实际示例

### 示例 1: 手动发现 Agent

```typescript
// 步骤 1: 访问 Agent Card
const response = await fetch('http://localhost:3000/api/a2a-agent/.well-known/agent.json');
const agentCard = await response.json();

// 步骤 2: 查看能力
console.log('Agent 名称:', agentCard.name);
console.log('能力列表:', agentCard.capabilities.map(c => c.name));
// 输出: ['generate_image', 'generate_image_with_prompt', 'make_payment']

// 步骤 3: 获取 task 端点
const taskEndpoint = agentCard.endpoints.task;

// 步骤 4: 调用 Agent
const result = await fetch(taskEndpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'generate_image',
    params: { prompt: '一只可爱的小猫咪' },
    id: 1,
  }),
});
```

### 示例 2: 使用发现函数

```typescript
import { discoverAgentCard, callA2AAgent } from '@/app/api/a2a-agent/agent-client';

// 自动发现 Agent
const discovery = await discoverAgentCard('http://localhost:3000/api/a2a-agent/task');

if (discovery.success) {
  const agentCard = discovery.card;
  
  // 查看能力
  const capabilities = agentCard.capabilities;
  
  // 调用 Agent
  const result = await callA2AAgent({
    agentUrl: 'http://localhost:3000/api/a2a-agent',
    method: 'generate_image',
    params: { prompt: '一只可爱的小猫咪' },
  });
}
```

### 示例 3: Agent 间协作

```typescript
// Image Generation Agent 调用 Prompt Agent
import { callPromptAgent } from '@/app/api/a2a-agent/agent-client';

// 1. 调用 Prompt Agent（自动发现）
const promptResult = await callPromptAgent(
  'http://localhost:3000/api/prompt-agent',  // 基础 URL
  '一只可爱的小猫咪',                        // topic
  '抽象'                                     // style
);

// 2. 使用生成的 prompt
if (promptResult.success) {
  const prompt = promptResult.prompt;
  
  // 3. 调用 Image Generation Agent
  const imageResult = await generateImage(prompt);
}
```

## 5. 标准路径的优势

### 5.1 符合 A2A 协议规范

使用 `/.well-known/agent.json` 是 A2A 协议推荐的标准路径，具有以下优势：

1. **标准化**：所有 A2A Agent 都使用相同的路径
2. **易于发现**：客户端可以自动尝试标准路径
3. **互操作性**：不同实现的 Agent 可以互相发现

### 5.2 发现优先级

```
/.well-known/agent.json  ← A2A 协议标准路径
```

## 6. 项目中的实现位置

### 6.1 Agent Card 端点

- **标准路径**: `app/api/a2a-agent/.well-known/agent.json/route.ts`

### 6.2 发现函数

- **智能发现**: `app/api/a2a-agent/agent-client.ts` - `discoverAgentCard()`
- **获取 Agent Card**: `app/api/a2a-agent/agent-client.ts` - `getAgentCard()`

### 6.3 Agent Card 生成

- **生成函数**: `app/api/a2a-agent/utils.ts` - `getAgentCard()`

## 7. 总结

### Agent 暴露
- ✅ 通过 HTTP GET 端点暴露 Agent Card
- ✅ 使用标准路径 `/.well-known/agent.json`
- ✅ Agent Card 包含完整的能力和端点信息

### Agent 发现
- ✅ 可以通过标准路径直接访问
- ✅ 可以从端点 URL 自动推断
- ✅ 支持多种路径的智能发现
- ✅ 可以从 Agent Card 获取所有端点信息

### 互操作性
- ✅ 符合 A2A 协议标准
- ✅ 可以被其他 A2A Agent 发现
- ✅ 可以调用其他 A2A Agent
- ✅ 支持 Agent 间协作

