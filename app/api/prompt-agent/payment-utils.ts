/**
 * Prompt Agent 支付验证工具
 * 
 * Prompt Agent 是付费服务，价格为 0.001 BNB
 * 需要完整的支付验证（X-PAYMENT 机制）
 */

import { ethers } from 'ethers';

// 获取支付配置
export function getPaymentConfig() {
  // Prompt Agent 价格从环境变量读取，环境变量应该是 Wei 格式（字符串）
  // 默认 0.001 BNB = 1000000000000000 Wei
  const priceEnv = process.env.PROMPT_AGENT_PRICE || '1000000000000000';
  const minAmountEnv = process.env.PROMPT_AGENT_MIN_AMOUNT || '1000000000000000';
  
  // 判断是 BNB 格式还是 Wei 格式（BNB 格式通常小于 1e15，Wei 格式通常大于 1e15）
  const priceWei = parseFloat(priceEnv) < 1e15 
    ? ethers.parseEther(priceEnv).toString() 
    : priceEnv;
  const minAmountWei = parseFloat(minAmountEnv) < 1e15 
    ? ethers.parseEther(minAmountEnv).toString() 
    : minAmountEnv;
  
  // ============================================================================
  // 【重要】Prompt Agent 收款地址配置说明：
  // ============================================================================
  // PAYMENT_CONTRACT_ADDRESS: 智能合约地址（必需）
  //   - 用途：Generate Agent 支付给 Prompt Agent 的收款地址（通过智能合约）
  //   - 功能：接收 Generate Agent 的支付，并给用户发放 SBT Token
  //   - 说明：Generate Agent 调用 Prompt Agent 时，会通过智能合约支付
  //   - 流程：Generate Agent → 调用合约 makePayment → 合约给用户发放 SBT
  //   - 示例：0x1956f3E39c7a9Bdd8E35a0345379692C3f433898
  //
  // 注意：Prompt Agent 不使用 PAYMENT_ADDRESS（普通钱包地址）
  //      Prompt Agent 只接收来自 Generate Agent 的合约支付
  // ============================================================================
  const contractAddress = process.env.PAYMENT_CONTRACT_ADDRESS || '';
  
  // 记录使用的地址（用于调试）
  if (contractAddress) {
    console.log(`📋 Prompt Agent 收款地址配置: PAYMENT_CONTRACT_ADDRESS（智能合约）`);
    console.log(`   地址: ${contractAddress}`);
  } else {
    console.warn('⚠️  Prompt Agent 收款地址未配置: PAYMENT_CONTRACT_ADDRESS 为空');
  }
  
  const config = {
    price: priceWei, // Wei 格式
    currency: process.env.PROMPT_AGENT_CURRENCY || 'BNB',
    network: process.env.PROMPT_AGENT_NETWORK || 'BSCTest',
    // Prompt Agent 收款地址：使用智能合约地址（合约直接收款，给用户发放 SBT）
    address: contractAddress,
    minAmount: minAmountWei, // Wei 格式
    rpcUrl: process.env.PAYMENT_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/',
  };

  return config;
}

// 验证支付信息
export async function validatePayment(xPaymentHeader: string | null): Promise<{ valid: boolean; error?: any }> {
  const PAYMENT_CONFIG = getPaymentConfig();

  // 必须提供 X-PAYMENT 头
  if (!xPaymentHeader) {
    return {
      valid: false,
      error: {
        price: PAYMENT_CONFIG.price,
        currency: PAYMENT_CONFIG.currency,
        network: PAYMENT_CONFIG.network,
        address: PAYMENT_CONFIG.address,
      },
    };
  }

  // 完整验证逻辑（与 generate agent 相同）
  try {
    console.log('Prompt Agent 开始验证支付，X-PAYMENT 头:', xPaymentHeader);
    const tsHash = Buffer.from(xPaymentHeader, 'base64').toString('utf-8');
    console.log('解码后的交易哈希:', tsHash);
    
    const provider = new ethers.JsonRpcProvider(PAYMENT_CONFIG.rpcUrl);
    const tx = await provider.getTransaction(tsHash);
    
    if (!tx) {
      console.error('Prompt Agent 支付验证失败: 交易不存在', tsHash);
      return { valid: false, error: '交易不存在' };
    }

    console.log('Prompt Agent 找到交易:', {
      hash: tsHash,
      from: tx.from,
      to: tx.to,
      value: tx.value.toString(),
      blockNumber: tx.blockNumber,
    });

    const receipt = await provider.getTransactionReceipt(tsHash);
    if (!receipt) {
      console.error('Prompt Agent 支付验证失败: 交易尚未确认', tsHash);
      return { valid: false, error: '交易尚未确认' };
    }

    console.log('Prompt Agent 交易信息:');
    console.log('交易哈希:', tsHash);
    console.log('发送方:', tx.from);
    console.log('接收方（合约地址）:', tx.to);
    console.log('交易金额:', ethers.formatEther(tx.value), 'BNB');
    console.log('交易状态:', receipt.status === 1 ? '成功' : '失败');
    console.log('期望的合约地址:', PAYMENT_CONFIG.address);
    console.log('环境变量 PAYMENT_CONTRACT_ADDRESS:', process.env.PAYMENT_CONTRACT_ADDRESS || '(未设置)');

    // 验证支付：检查交易的 to 地址是否是合约地址（合约直接收款）
    if (PAYMENT_CONFIG.address) {
      const expectedAddress = PAYMENT_CONFIG.address.toLowerCase();
      const toAddress = tx.to?.toLowerCase();
      const amountWei = BigInt(tx.value.toString());
      const minAmountWei = BigInt(PAYMENT_CONFIG.minAmount);

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📍 Prompt Agent 地址验证:');
      console.log('  - 期望地址（来自 PAYMENT_CONTRACT_ADDRESS）:', expectedAddress);
      console.log('  - 实际交易接收地址:', toAddress);
      console.log('  - 地址是否匹配:', toAddress === expectedAddress ? '✅ 匹配' : '❌ 不匹配');
      console.log('  - 支付金额 (Wei):', amountWei.toString());
      console.log('  - 最小金额 (Wei):', minAmountWei.toString());
      console.log('  - 金额是否足够:', amountWei >= minAmountWei ? '✅ 足够' : '❌ 不足');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // 检查交易是否发送到合约地址
      if (toAddress !== expectedAddress) {
        console.error('Prompt Agent 支付验证失败: 收款地址不匹配', {
          expected: expectedAddress,
          actual: toAddress,
        });
        return { valid: false, error: `收款地址不匹配（应发送到合约地址 ${expectedAddress}，实际发送到 ${toAddress}）` };
      }

      if (amountWei < minAmountWei) {
        console.error('Prompt Agent 支付验证失败: 交易金额不足', {
          required: minAmountWei.toString(),
          actual: amountWei.toString(),
        });
        return { valid: false, error: `交易金额不足（需要至少 ${ethers.formatEther(minAmountWei)} BNB，实际 ${ethers.formatEther(amountWei)} BNB）` };
      }
    } else {
      console.error('Prompt Agent 支付验证失败: PAYMENT_CONTRACT_ADDRESS 未配置');
      return { valid: false, error: 'PAYMENT_CONTRACT_ADDRESS 未配置' };
    }

    if (receipt.status !== 1) {
      console.error('Prompt Agent 支付验证失败: 交易失败', {
        status: receipt.status,
        hash: tsHash,
      });
      return { valid: false, error: '交易失败' };
    }

    console.log('Prompt Agent 支付验证成功');
    return { valid: true };
  } catch (error) {
    console.error('支付验证错误:', error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : '支付验证失败',
    };
  }
}

