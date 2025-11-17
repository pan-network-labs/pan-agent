/**
 * 简化的支付工具函数
 * 直接在服务器上使用私钥进行支付
 * 
 * 注意：确保私钥安全存储在环境变量中
 */

import { ethers } from 'ethers';

// 获取支付配置
function getPaymentConfig() {
  // ============================================================================
  // 【重要】合约支付配置说明：
  // ============================================================================
  // PAYMENT_CONTRACT_ADDRESS: 智能合约地址（必需，用于合约支付）
  //   - 用途：Generate Agent 支付给 Prompt Agent 时调用的合约地址
  //   - 功能：接收 Generate Agent 的支付，并给用户（recipient）发放 SBT Token
  //   - 使用场景：
  //     * Generate Agent 支付给 Prompt Agent（通过合约 makePayment 方法）
  //   - 流程：Generate Agent → 调用合约 makePayment(recipient, description, referrer) → 合约给用户发放 SBT
  //   - 示例：0x1956f3E39c7a9Bdd8E35a0345379692C3f433898
  //
  // PAYMENT_PRIVATE_KEY: Generate Agent 的钱包私钥
  //   - 用途：Generate Agent 自动支付给 Prompt Agent 时使用的私钥
  //
  // PROMPT_PRIVATE_KEY: Prompt Agent 的钱包私钥（优先使用）
  //   - 用途：Prompt Agent 调用合约生成 SBT 时使用的私钥
  //   - 优先级：如果存在 PROMPT_PRIVATE_KEY，优先使用它；否则使用 PAYMENT_PRIVATE_KEY
  //
  // 注意：用户支付给 Generate Agent 不使用此配置
  //      用户支付给 Generate Agent 是直接转账到 PAYMENT_ADDRESS（普通钱包地址）
  // ============================================================================
  const contractAddress = process.env.PAYMENT_CONTRACT_ADDRESS || '';
  
  // 优先使用 PROMPT_PRIVATE_KEY，否则使用 PAYMENT_PRIVATE_KEY
  const privateKey = process.env.PROMPT_PRIVATE_KEY || process.env.PAYMENT_PRIVATE_KEY || '';
  
  // 记录配置信息（用于调试）
  if (contractAddress) {
    console.log(`📋 合约支付配置: PAYMENT_CONTRACT_ADDRESS（智能合约）`);
    console.log(`   合约地址: ${contractAddress}`);
  } else {
    console.warn('⚠️  合约地址未配置: PAYMENT_CONTRACT_ADDRESS 为空');
  }
  
  if (process.env.PROMPT_PRIVATE_KEY) {
    console.log(`📋 使用的私钥: PROMPT_PRIVATE_KEY（Prompt Agent）`);
  } else if (process.env.PAYMENT_PRIVATE_KEY) {
    console.log(`📋 使用的私钥: PAYMENT_PRIVATE_KEY（Generate Agent）`);
  }
  
  return {
    rpcUrl: process.env.PAYMENT_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/',
    contractAddress: contractAddress,
    privateKey: privateKey,
  };
}

// SBT 级别类型
export type SBTRarity = 'N' | 'R' | 'S';

// 调用智能合约支付（合约直接收款，给 recipient 发放 SBT）
export async function makeContractPayment(
  amount: string,
  description: string = '',
  recipient: string, // 必需：接收 SBT 的地址（用户付款的钱包地址）
  contractAddress?: string, // 可选：指定合约地址（如果不提供，使用环境变量中的地址）
  referrer: string = '', // 可选：推广人（字符串格式，默认为空字符串）
  rarity: SBTRarity = 'N' // 可选：SBT 级别（N级、R级、S级），默认为 N级
): Promise<{ success: boolean; txHash?: string; error?: string; errorDetails?: any }> {
  try {
    const config = getPaymentConfig();
    
    // 直接使用配置中的私钥（已优先使用 PROMPT_PRIVATE_KEY，否则使用 PAYMENT_PRIVATE_KEY）
    const usedPrivateKey = config.privateKey;
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔍 makeContractPayment 私钥检查');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('PROMPT_PRIVATE_KEY 是否存在:', process.env.PROMPT_PRIVATE_KEY ? '是' : '否');
    console.log('PAYMENT_PRIVATE_KEY 是否存在:', process.env.PAYMENT_PRIVATE_KEY ? '是' : '否');
    console.log('最终使用的私钥来源:', process.env.PROMPT_PRIVATE_KEY ? 'PROMPT_PRIVATE_KEY（Prompt Agent）' : 'PAYMENT_PRIVATE_KEY（Generate Agent）');
    if (usedPrivateKey) {
      const testWallet = new ethers.Wallet(usedPrivateKey);
      console.log('使用的私钥对应的地址:', testWallet.address);
    }
    console.log('═══════════════════════════════════════════════════════════');
    
    if (!usedPrivateKey) {
      return { success: false, error: 'Private key not configured (neither PROMPT_PRIVATE_KEY nor PAYMENT_PRIVATE_KEY in env)' };
    }
    
    // 使用提供的地址或环境变量中的地址
    const targetAddress = contractAddress || config.contractAddress;
    if (!targetAddress) {
      return { success: false, error: 'Contract address not configured' };
    }

    // 验证 recipient 地址格式
    if (!recipient || !ethers.isAddress(recipient)) {
      return { success: false, error: 'Invalid recipient address' };
    }

    // 1. 创建钱包和提供者
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const wallet = new ethers.Wallet(usedPrivateKey, provider);

    // 2. 检查钱包余额
    const balance = await provider.getBalance(wallet.address);
    const value = ethers.parseEther(amount);
    const minBalance = value + ethers.parseEther('0.001'); // 预留一些 gas 费用
    
    if (balance < minBalance) {
      return {
        success: false,
        error: `钱包余额不足。需要: ${ethers.formatEther(minBalance)} BNB, 当前余额: ${ethers.formatEther(balance)} BNB`,
      };
    }

    // 3. 准备智能合约调用数据
    // 根据 rarity 选择不同的合约方法：
    // - N级：mintNSBT(address recipient, string memory description, string memory referrer) payable returns (uint256 tokenId)
    // - R级：mintRSBT(address recipient, string memory description, string memory referrer) payable returns (uint256 tokenId)
    // - S级：mintSSBT(address recipient, string memory description, string memory referrer) payable returns (uint256 tokenId)
    // recipient 用于给用户发放 SBT
    // referrer 用于统计推广人（可选，如果没有提供则使用空字符串）
    
    // 根据 rarity 选择方法名
    const methodName = rarity === 'N' ? 'mintNSBT' : rarity === 'R' ? 'mintRSBT' : 'mintSSBT';
    
    const iface = new ethers.Interface([
      `function ${methodName}(address recipient, string memory description, string memory referrer) payable returns (uint256 tokenId)`
    ]);
    
    // referrer 已经是字符串格式，如果没有提供则使用空字符串
    const referrerString = typeof referrer === 'string' ? referrer : '';
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔄 makeContractPayment 开始执行');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 接收到的参数:');
    console.log('  - 合约地址:', targetAddress);
    console.log('  - 支付金额 (BNB):', amount);
    console.log('  - 支付金额 (Wei):', ethers.parseEther(amount).toString());
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎯 SBT 发放目标钱包地址 (recipient):', recipient);
    console.log('   ⚠️  合约将向此地址发放 SBT Token');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  - Description:', description || '(空字符串)');
    console.log('  - Referrer:', referrerString || '(空字符串)');
    console.log('  - SBT 级别:', rarity, `(${rarity === 'N' ? 'N级（普通）' : rarity === 'R' ? 'R级（稀有）' : 'S级（超级稀有）'})`);
    console.log('  - 合约方法:', methodName);
    console.log('═══════════════════════════════════════════════════════════');
    
    // 编码函数调用数据（使用根据 rarity 选择的方法名）
    const data = iface.encodeFunctionData(methodName, [recipient, description || '', referrerString]);
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📦 编码后的合约调用数据 (data):', data);
    console.log('📤 传递给合约的参数:');
    console.log('  - recipient (SBT 接收者):', recipient);
    console.log('  - description:', description || '(空字符串)');
    console.log('  - referrer:', referrerString || '(空字符串)');

    // 4. 估算 gas 并设置足够的 gas limit
    let gasLimit: bigint;
    try {
      const gasEstimate = await provider.estimateGas({
        from: wallet.address,
        to: targetAddress,
        value,
        data,
      });
      console.log('Gas 估算成功:', gasEstimate.toString());
      
      // 增加 30% 的缓冲，确保有足够的 gas
      gasLimit = (gasEstimate * BigInt(130)) / BigInt(100);
      console.log('设置 Gas Limit:', gasLimit.toString(), '(估算值的 130%)');
    } catch (gasError: any) {
      // Gas 估算失败，说明合约调用会失败
      let errorMessage = '合约调用失败（gas 估算失败）';
      let authorizedMinterAddress: string | null = null;
      
      if (gasError?.reason) {
        errorMessage = `合约调用失败: ${gasError.reason}`;
      } else if (gasError?.message) {
        // 尝试从错误消息中提取有用信息
        const msg = gasError.message;
        if (msg.includes('execution reverted')) {
          errorMessage = '合约执行被回退，可能是合约的 require 检查失败。请检查：1) recipient 地址是否有效 2) 合约状态是否允许此操作 3) 支付金额是否满足合约要求';
        } else {
          errorMessage = `合约调用失败: ${msg}`;
        }
      }
      
      // 如果是 "Only authorized minter" 错误，查询合约的授权 minter 地址
      if (errorMessage.includes('Only authorized minter') || errorMessage.includes('authorized minter')) {
        try {
          const contract = new ethers.Contract(targetAddress, ['function authorizedMinter() view returns (address)'], provider);
          authorizedMinterAddress = await contract.authorizedMinter();
          console.log('查询到合约的授权 minter 地址:', authorizedMinterAddress);
        } catch (queryError) {
          console.error('查询授权 minter 地址失败:', queryError);
        }
      }
      
      // 检查实际使用的私钥来源
      const isUsingPromptKey = !!process.env.PROMPT_PRIVATE_KEY;
      
      console.error('═══════════════════════════════════════════════════════════');
      console.error('❌ 合约调用失败（Gas 估算阶段）');
      console.error('═══════════════════════════════════════════════════════════');
      console.error('当前使用的钱包地址:', wallet.address);
      console.error('使用的私钥来源:', isUsingPromptKey ? 'PROMPT_PRIVATE_KEY（Prompt Agent）' : 'PAYMENT_PRIVATE_KEY（Generate Agent）');
      if (authorizedMinterAddress) {
        console.error('合约的授权 minter 地址:', authorizedMinterAddress);
        console.error('⚠️  地址不匹配！请检查：');
        if (isUsingPromptKey) {
          console.error('   当前使用 PROMPT_PRIVATE_KEY，但该私钥对应的地址不是授权的 minter');
          console.error('   解决方案：将 PROMPT_PRIVATE_KEY 环境变量更新为对应地址', authorizedMinterAddress, '的私钥');
        } else {
          console.error('   当前使用 PAYMENT_PRIVATE_KEY，但该私钥对应的地址不是授权的 minter');
          console.error('   解决方案：将 PAYMENT_PRIVATE_KEY 环境变量更新为对应地址', authorizedMinterAddress, '的私钥');
        }
      }
      console.error('═══════════════════════════════════════════════════════════');
      
      // 构建详细的错误信息
      const detailedError: any = {
        message: errorMessage,
        currentAddress: wallet.address,
        privateKeySource: isUsingPromptKey ? 'PROMPT_PRIVATE_KEY (env var)' : 'PAYMENT_PRIVATE_KEY (env var)',
      };
      
      if (authorizedMinterAddress) {
        detailedError.authorizedMinterAddress = authorizedMinterAddress;
        if (isUsingPromptKey) {
          detailedError.solution = `请将 PROMPT_PRIVATE_KEY 环境变量更新为对应地址 ${authorizedMinterAddress} 的私钥`;
        } else {
          detailedError.solution = `请将 PAYMENT_PRIVATE_KEY 环境变量更新为对应地址 ${authorizedMinterAddress} 的私钥`;
        }
      }
      
      return {
        success: false,
        error: errorMessage,
        errorDetails: detailedError,
      };
    }

    // 5. 发送交易，调用合约的 makePayment 方法（设置足够的 gas limit）
    const tx = await wallet.sendTransaction({
      to: targetAddress,
      value,
      data, // 包含合约方法调用数据
      gasLimit, // 设置足够的 gas limit
    });

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ 支付交易已发送到合约');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📝 交易信息:');
    console.log('  - 交易哈希:', tx.hash);
    console.log('  - 发送方 (支付钱包):', wallet.address);
    console.log('  - 接收方 (合约地址):', targetAddress);
    console.log('  - 支付金额 (BNB):', amount);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎯 SBT 发放目标钱包地址 (recipient):', recipient);
    console.log('   ⚠️  合约将向此地址发放 SBT Token');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  - Description:', description || '(空字符串)');
    console.log('  - Referrer:', referrerString || '(空字符串)');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('⏳ 等待交易确认...');

    // 6. 等待交易确认（必须等待，确保交易成功）
    let receipt: ethers.TransactionReceipt | null;
    try {
      receipt = await tx.wait();
      
      // 检查 receipt 是否为 null
      if (!receipt) {
        console.error('❌ 交易确认失败: receipt 为 null');
        return {
          success: false,
          error: '交易已发送但确认失败: receipt 为 null',
          txHash: tx.hash, // 仍然返回交易哈希，用户可以手动检查
        };
      }
      
      console.log('═══════════════════════════════════════════════════════════');
      console.log('✅ 交易已确认');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('📋 交易收据信息:');
      console.log('  - 交易哈希:', receipt.hash);
      console.log('  - 区块号:', receipt.blockNumber?.toString() || 'N/A');
      console.log('  - Gas 使用:', receipt.gasUsed?.toString() || 'N/A');
      console.log('  - 交易状态:', receipt.status === 1 ? '✅ 成功' : '❌ 失败');
      console.log('═══════════════════════════════════════════════════════════');
      
      // 检查交易状态
      if (receipt.status !== 1) {
        console.error('❌ 交易失败（状态码:', receipt.status, ')');
        console.error('交易可能被回退，合约不会有记录');
        return {
          success: false,
          error: `交易失败（状态码: ${receipt.status}）。交易可能被回退，请检查合约日志或交易详情。`,
        };
      }
      
      // 解析合约事件（PaymentReceived, SBTMinted）
      const contractInterface = new ethers.Interface([
        'event PaymentReceived(uint256 indexed tokenId, address indexed payer, address indexed recipient, uint256 amount, uint256 timestamp)',
        'event SBTMinted(uint256 indexed tokenId, address indexed owner, address indexed recipient, uint256 amount, uint8 rarity)',
      ]);
      
      console.log('📊 解析合约事件...');
      for (const log of receipt.logs) {
        try {
          const parsedLog = contractInterface.parseLog(log);
          if (parsedLog) {
            console.log('  - 事件名称:', parsedLog.name);
            if (parsedLog.name === 'PaymentReceived') {
              console.log('    - Token ID:', parsedLog.args.tokenId?.toString());
              console.log('    - Payer:', parsedLog.args.payer);
              console.log('    - Recipient:', parsedLog.args.recipient);
              console.log('    - Amount:', parsedLog.args.amount?.toString());
            } else if (parsedLog.name === 'SBTMinted') {
              console.log('    - Token ID:', parsedLog.args.tokenId?.toString());
              console.log('    - Owner:', parsedLog.args.owner);
              console.log('    - Recipient:', parsedLog.args.recipient);
              console.log('    - Amount:', parsedLog.args.amount?.toString());
              console.log('    - Rarity:', parsedLog.args.rarity?.toString());
            }
          }
        } catch (e) {
          // 忽略无法解析的日志（可能是其他合约的事件）
        }
      }
      
      console.log('═══════════════════════════════════════════════════════════');
      console.log('✅ 合约调用成功，SBT 已发放');
      console.log('═══════════════════════════════════════════════════════════');
    } catch (waitError: any) {
      console.error('═══════════════════════════════════════════════════════════');
      console.error('❌ 等待交易确认时发生错误:');
      console.error('═══════════════════════════════════════════════════════════');
      console.error('错误类型:', waitError instanceof Error ? waitError.constructor.name : typeof waitError);
      console.error('错误消息:', waitError instanceof Error ? waitError.message : String(waitError));
      if (waitError instanceof Error && waitError.stack) {
        console.error('错误堆栈:', waitError.stack);
      }
      console.error('═══════════════════════════════════════════════════════════');
      
      // 即使等待失败，也返回交易哈希（交易可能已经发送）
      return {
        success: false,
        error: `交易已发送但确认失败: ${waitError instanceof Error ? waitError.message : '未知错误'}`,
        txHash: tx.hash, // 仍然返回交易哈希，用户可以手动检查
      };
    }

    return {
      success: true,
      txHash: tx.hash,
    };
  } catch (error: any) {
    console.error('调用智能合约支付时发生错误:', error);
    
    // 提取更详细的错误信息
    let errorMessage = 'Unknown error';
    let authorizedMinterAddress: string | null = null;
    let currentAddress: string | null = null;
    
    // 尝试获取当前使用的钱包地址
    try {
      const config = getPaymentConfig();
      if (config.privateKey) {
        const provider = new ethers.JsonRpcProvider(config.rpcUrl);
        const wallet = new ethers.Wallet(config.privateKey, provider);
        currentAddress = wallet.address;
      }
    } catch (e) {
      // 忽略获取地址的错误
    }
    
    if (error instanceof Error) {
      errorMessage = error.message;
      
      // 如果是合约执行错误，提供更详细的说明
      if (error.message.includes('execution reverted')) {
        errorMessage = '合约执行被回退。可能的原因：1) recipient 地址无效或不允许 2) 合约状态不允许此操作 3) 支付金额不满足合约要求 4) 合约的其他业务逻辑检查失败';
      } else if (error.message.includes('insufficient funds')) {
        errorMessage = '钱包余额不足，无法支付';
      } else if (error.message.includes('nonce')) {
        errorMessage = '交易 nonce 错误，请稍后重试';
      }
    } else if (error?.reason) {
      errorMessage = error.reason;
    } else if (error?.message) {
      errorMessage = error.message;
    }
    
    // 如果是 "Only authorized minter" 错误，查询合约的授权 minter 地址
    if (errorMessage.includes('Only authorized minter') || errorMessage.includes('authorized minter')) {
      try {
        const config = getPaymentConfig();
        const targetAddress = contractAddress || config.contractAddress;
        if (targetAddress) {
          const provider = new ethers.JsonRpcProvider(config.rpcUrl);
          const contract = new ethers.Contract(targetAddress, ['function authorizedMinter() view returns (address)'], provider);
          authorizedMinterAddress = await contract.authorizedMinter();
          console.log('查询到合约的授权 minter 地址:', authorizedMinterAddress);
        }
      } catch (queryError) {
        console.error('查询授权 minter 地址失败:', queryError);
      }
    }
    
    // 检查实际使用的私钥来源
    const isUsingPromptKey = !!process.env.PROMPT_PRIVATE_KEY;
    
    console.error('═══════════════════════════════════════════════════════════');
    console.error('❌ 合约调用失败');
    console.error('═══════════════════════════════════════════════════════════');
    if (currentAddress) {
      console.error('当前使用的钱包地址:', currentAddress);
      console.error('使用的私钥来源:', isUsingPromptKey ? 'PROMPT_PRIVATE_KEY（Prompt Agent）' : 'PAYMENT_PRIVATE_KEY（Generate Agent）');
    }
    if (authorizedMinterAddress) {
      console.error('合约的授权 minter 地址:', authorizedMinterAddress);
      console.error('⚠️  地址不匹配！');
      if (isUsingPromptKey) {
        console.error('   当前使用 PROMPT_PRIVATE_KEY，但该私钥对应的地址不是授权的 minter');
        console.error('   解决方案：将 PROMPT_PRIVATE_KEY 环境变量更新为对应地址', authorizedMinterAddress, '的私钥');
      } else {
        console.error('   当前使用 PAYMENT_PRIVATE_KEY，但该私钥对应的地址不是授权的 minter');
        console.error('   解决方案：将 PAYMENT_PRIVATE_KEY 环境变量更新为对应地址', authorizedMinterAddress, '的私钥');
      }
    }
    console.error('═══════════════════════════════════════════════════════════');
    
    // 构建详细的错误信息
    const errorDetails: any = {
      message: errorMessage,
    };
    
    if (currentAddress) {
      errorDetails.currentAddress = currentAddress;
      errorDetails.privateKeySource = isUsingPromptKey ? 'PROMPT_PRIVATE_KEY (env var)' : 'PAYMENT_PRIVATE_KEY (env var)';
    }
    
    if (authorizedMinterAddress) {
      errorDetails.authorizedMinterAddress = authorizedMinterAddress;
      if (isUsingPromptKey) {
        errorDetails.solution = `请将 PROMPT_PRIVATE_KEY 环境变量更新为对应地址 ${authorizedMinterAddress} 的私钥`;
      } else {
        errorDetails.solution = `请将 PAYMENT_PRIVATE_KEY 环境变量更新为对应地址 ${authorizedMinterAddress} 的私钥`;
      }
    }
    
    return {
      success: false,
      error: errorMessage,
      errorDetails: Object.keys(errorDetails).length > 1 ? errorDetails : undefined,
    };
  }
}

// 直接转账
export async function makeDirectPayment(
  recipient: string,
  amount: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const config = getPaymentConfig();
    
    if (!config.privateKey) {
      return { success: false, error: 'PAYMENT_PRIVATE_KEY not configured' };
    }

    // 1. 创建钱包和提供者
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const wallet = new ethers.Wallet(config.privateKey, provider);

    // 2. 发送交易
    const tx = await wallet.sendTransaction({
      to: recipient,
      value: ethers.parseEther(amount),
    });

    console.log('转账交易已发送:', {
      hash: tx.hash,
      from: wallet.address,
      to: recipient,
      amount,
    });

    return {
      success: true,
      txHash: tx.hash,
    };
  } catch (error) {
    console.error('直接转账时发生错误:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// 获取钱包地址
export function getWalletAddress(): string | null {
  const config = getPaymentConfig();
  
  if (!config.privateKey) {
    return null;
  }

  try {
    const wallet = new ethers.Wallet(config.privateKey);
    return wallet.address;
  } catch {
    return null;
  }
}

