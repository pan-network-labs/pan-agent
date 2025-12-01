# Vercel KV 配置指南

## 1. 在 Vercel 官网配置 KV Database

### 步骤：

1. **登录 Vercel Dashboard**
   - 访问 https://vercel.com
   - 登录你的账号

2. **进入项目设置**
   - 选择你的项目
   - 点击 **Storage** 标签页

3. **创建 KV Database**
   - 点击 **Create Database**
   - 选择 **KV** (Redis)
   - 输入数据库名称（例如：`pan-agent-kv`）
   - 选择区域（建议选择离你最近的区域）
   - 点击 **Create**

4. **获取连接信息**
   - Vercel 会自动将以下环境变量添加到你的项目中：
     - `KV_URL` - Redis 连接 URL
     - `KV_REST_API_URL` - REST API URL
     - `KV_REST_API_TOKEN` - REST API Token
     - `KV_REST_API_READ_ONLY_TOKEN` - 只读 Token

5. **验证环境变量**
   - 在项目设置中，进入 **Settings** → **Environment Variables**
   - 确认上述环境变量已自动添加

## 2. 本地开发配置

### 在 `.env.local` 文件中添加：

```bash
# Vercel KV 配置（从 Vercel Dashboard 复制）
KV_URL=your_kv_url_here
KV_REST_API_URL=your_rest_api_url_here
KV_REST_API_TOKEN=your_rest_api_token_here
KV_REST_API_READ_ONLY_TOKEN=your_read_only_token_here
```

### 如何获取本地开发的环境变量：

1. 在 Vercel Dashboard 中，进入你的项目
2. 点击 **Storage** → 选择你的 KV Database
3. 在 **.env.local** 部分，复制所有环境变量
4. 粘贴到项目的 `.env.local` 文件中

## 3. 代码已自动配置

代码已经配置为使用 Vercel KV，无需额外修改：

- ✅ `@vercel/kv` 包已安装
- ✅ `txhash-store.ts` 已更新为使用 KV
- ✅ `payment-utils.ts` 已更新为异步调用

## 4. 功能说明

### 自动过期清理
- 每个交易哈希会在 KV 中存储 24 小时
- 24 小时后自动过期删除
- 无需手动清理

### 错误处理
- 如果 KV 暂时不可用，代码会记录错误但不会中断服务
- 验证会继续执行（降级处理）

## 5. 验证配置

部署到 Vercel 后，检查日志：

```
✅ Transaction hash marked as used in KV: 0x...
   Expires in: 24 hours
```

如果看到这个日志，说明 KV 配置成功！

## 6. 费用说明

- **免费计划**：每月 256 MB 存储，100,000 次读取，100,000 次写入
- **Pro 计划**：每月 1 GB 存储，1,000,000 次读取，1,000,000 次写入

对于交易哈希存储（每个约 100 字节），免费计划可以存储约 250 万个交易哈希。

## 7. 故障排查

### 问题：`kv is not defined`

**解决方案：**
- 确认环境变量已正确配置
- 确认 `@vercel/kv` 包已安装：`npm install @vercel/kv`

### 问题：连接超时

**解决方案：**
- 检查网络连接
- 确认 KV Database 区域设置正确
- 检查 Vercel Dashboard 中 KV Database 状态

### 问题：本地开发无法连接

**解决方案：**
- 确认 `.env.local` 文件存在
- 确认环境变量值正确（从 Vercel Dashboard 复制）
- 重启开发服务器：`npm run dev`

