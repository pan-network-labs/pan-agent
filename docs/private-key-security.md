# 服务器私钥安全建议

## 如果必须在服务器上存储私钥，请遵循以下安全实践：

### 1. 环境变量管理
- ✅ **使用环境变量**，不要硬编码在代码中
- ✅ **使用 `.env` 文件**，并确保 `.gitignore` 已配置
- ✅ **生产环境使用密钥管理服务**（AWS Secrets Manager、HashiCorp Vault 等）

### 2. 文件权限
- ✅ 限制 `.env` 文件权限：`chmod 600 .env`
- ✅ 确保只有应用进程可以读取

### 3. 服务器安全
- ✅ 使用防火墙限制访问
- ✅ 定期更新系统和依赖
- ✅ 使用 HTTPS
- ✅ 实施访问控制（IP 白名单等）

### 4. 监控和审计
- ✅ 记录所有使用私钥的操作
- ✅ 监控异常交易
- ✅ 设置交易金额和频率限制

### 5. 最小权限原则
- ✅ 只给必要的权限
- ✅ 使用专门的支付钱包，不要使用主钱包
- ✅ 定期轮换私钥（如果可能）

### 6. 备份和恢复
- ✅ 安全备份私钥（加密存储）
- ✅ 制定恢复计划

## 环境变量配置示例

```env
# 支付私钥（生产环境应使用密钥管理服务）
PAYMENT_PRIVATE_KEY=0x你的私钥

# 支付钱包地址（用于获取 nonce）
PAYMENT_WALLET_ADDRESS=0x钱包地址

# RPC URL
PAYMENT_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/

# 智能合约地址
PAYMENT_CONTRACT_ADDRESS=0x合约地址
```

## 代码示例

如果直接在 Agent 中使用私钥：

```typescript
import { ethers } from 'ethers';

const privateKey = process.env.PAYMENT_PRIVATE_KEY!;
const provider = new ethers.JsonRpcProvider(process.env.PAYMENT_RPC_URL);
const wallet = new ethers.Wallet(privateKey, provider);

// 调用智能合约支付
async function makePayment(recipient: string, amount: string) {
  const contractAddress = process.env.PAYMENT_CONTRACT_ADDRESS!;
  const iface = new ethers.Interface([
    'function makePayment(address recipient, string memory description) payable returns (uint256 tokenId)'
  ]);
  
  const data = iface.encodeFunctionData('makePayment', [recipient, '']);
  const tx = await wallet.sendTransaction({
    to: contractAddress,
    value: ethers.parseEther(amount),
    data,
  });
  
  return tx.hash;
}
```

## 风险提示

⚠️ **注意**：在服务器上存储私钥存在以下风险：
- 服务器被攻破可能导致私钥泄露
- 代码泄露可能导致私钥暴露
- 需要更严格的安全措施

## 建议

如果可能，还是考虑：
- 使用独立的签名服务（即使在同一服务器，也可以分离）
- 使用硬件安全模块（HSM）
- 使用多签钱包
- 定期安全审计

