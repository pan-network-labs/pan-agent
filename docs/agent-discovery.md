# Agent 发现机制

## 问题

如果知道 Agent 的端点（如 task 端点），能否自动发现 Agent Card？

## 答案

**是的！** 可以通过以下几种方式：

### 方式 1: 从端点推断基础 URL

如果知道 task 端点，可以推断出 Agent 的基础 URL，然后尝试获取 Agent Card。

例如：
- Task 端点：`http://example.com/api/a2a-agent/task`
- 推断基础 URL：`http://example.com/api/a2a-agent`
- Agent Card 路径：`http://example.com/api/a2a-agent/.well-known/agent.json`

### 方式 2: 标准路径发现

A2A 协议建议使用标准路径：`/.well-known/agent.json`

例如：
- 基础 URL：`http://example.com/api/a2a-agent`
- Agent Card：`http://example.com/api/a2a-agent/.well-known/agent.json`

### 方式 3: 从 Agent Card 中获取端点

Agent Card 中包含 `endpoints` 字段，声明了所有端点：

```json
{
  "endpoints": {
    "task": "http://example.com/api/a2a-agent/task",
    "agentCard": "http://example.com/api/a2a-agent/.well-known/agent.json"
  }
}
```

## 实现

项目中的 `getAgentCard()` 函数支持智能发现：

```typescript
import { getAgentCard, discoverAgentCard } from '@/app/api/a2a-agent/agent-client';

// 方式 1: 直接提供基础 URL
const result = await getAgentCard('http://localhost:3000/api/a2a-agent');

// 方式 2: 从端点自动发现（推荐）
const result = await discoverAgentCard('http://localhost:3000/api/a2a-agent/task');
```

### 发现策略

`getAgentCard()` 函数使用 A2A 协议标准路径：

- `/.well-known/agent.json` - A2A 协议标准路径

## 使用示例

### 示例 1: 从 task 端点发现

```typescript
// 只知道 task 端点
const taskEndpoint = 'http://localhost:3000/api/a2a-agent/task';

// 自动发现 Agent Card
const result = await discoverAgentCard(taskEndpoint);

if (result.success) {
  console.log('Agent 名称:', result.card.name);
  console.log('能力列表:', result.card.capabilities);
}
```

### 示例 2: 从 Agent Card 获取端点

```typescript
// 先获取 Agent Card
const cardResult = await getAgentCard('http://localhost:3000/api/a2a-agent');

if (cardResult.success) {
  const card = cardResult.card;
  
  // 从 Agent Card 中获取 task 端点
  const taskEndpoint = card.endpoints.task;
  console.log('Task 端点:', taskEndpoint);
  
  // 可以使用这个端点调用 Agent
  // ...
}
```

## 最佳实践

1. **使用标准路径**：如果可能，使用 `/.well-known/agent.json` 作为 Agent Card 路径
2. **在 Agent Card 中声明端点**：确保 Agent Card 的 `endpoints` 字段包含所有端点
3. **使用发现函数**：使用 `discoverAgentCard()` 而不是硬编码路径

## 当前项目实现

项目使用 A2A 协议标准路径 `/.well-known/agent.json`。

