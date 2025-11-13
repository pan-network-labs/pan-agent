/**
 * 支付工具函数
 * 用于 Agent 调用智能合约进行支付
 */

import { ethers } from 'ethers';

// 支付配置
export interface PaymentConfig {
  rpcUrl: string;
  contractAddress: string;
  signingServiceUrl: string;
  broadcastServiceUrl: string;
}

// 获取支付配置
export function getPaymentConfig(): PaymentConfig {
  return {
    rpcUrl: process.env.PAYMENT_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/',
    contractAddress: process.env.PAYMENT_CONTRACT_ADDRESS || '',
    signingServiceUrl: process.env.SIGNING_SERVICE_URL || 'http://localhost:3000/api/payment/sign',
    broadcastServiceUrl: process.env.BROADCAST_SERVICE_URL || 'http://localhost:3000/api/payment/broadcast',
  };
}

// 调用智能合约支付（使用签名服务）
export async function makeContractPayment(
  recipient: string,
  amount: string,
  description: string = ''
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const config = getPaymentConfig();
    
    if (!config.contractAddress) {
      return { success: false, error: 'Payment contract address not configured' };
    }

    // 1. 准备智能合约调用数据
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const iface = new ethers.Interface([
      'function makePayment(address recipient, string memory description) payable returns (uint256 tokenId)'
    ]);
    
    const data = iface.encodeFunctionData('makePayment', [recipient, description]);
    const value = ethers.parseEther(amount);

    // 2. 获取当前 nonce
    // 注意：这里需要知道签名服务的钱包地址
    // 可以从签名服务获取，或者从环境变量读取
    const signingWalletAddress = process.env.SIGNING_WALLET_ADDRESS;
    if (!signingWalletAddress) {
      return { success: false, error: 'Signing wallet address not configured' };
    }
    
    const nonce = await provider.getTransactionCount(signingWalletAddress, 'pending');
    
    // 3. 估算 gas
    const gasEstimate = await provider.estimateGas({
      to: config.contractAddress,
      value,
      data,
    });
    
    const gasPrice = await provider.getFeeData();
    
    // 4. 调用签名服务
    const signResponse = await fetch(config.signingServiceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 可以添加 API Key 认证
        // 'Authorization': `Bearer ${process.env.SIGNING_SERVICE_API_KEY}`,
      },
      body: JSON.stringify({
        to: config.contractAddress,
        value: amount,
        data,
        nonce,
        gasPrice: gasPrice.gasPrice ? ethers.formatUnits(gasPrice.gasPrice, 'gwei') : undefined,
        gasLimit: gasEstimate.toString(),
      }),
    });

    if (!signResponse.ok) {
      const error = await signResponse.json();
      return { success: false, error: error.message || 'Failed to sign transaction' };
    }

    const signResult = await signResponse.json();
    
    if (!signResult.success) {
      return { success: false, error: signResult.error || 'Signing failed' };
    }

    // 5. 广播交易
    const broadcastResponse = await fetch(config.broadcastServiceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        signedTransaction: signResult.signedTransaction,
      }),
    });

    if (!broadcastResponse.ok) {
      const error = await broadcastResponse.json();
      return { success: false, error: error.message || 'Failed to broadcast transaction' };
    }

    const broadcastResult = await broadcastResponse.json();
    
    return {
      success: true,
      txHash: broadcastResult.transactionHash,
    };
  } catch (error) {
    console.error('调用智能合约支付时发生错误:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// 直接转账（使用签名服务）
export async function makeDirectPayment(
  recipient: string,
  amount: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const config = getPaymentConfig();
    
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const signingWalletAddress = process.env.SIGNING_WALLET_ADDRESS;
    
    if (!signingWalletAddress) {
      return { success: false, error: 'Signing wallet address not configured' };
    }
    
    const nonce = await provider.getTransactionCount(signingWalletAddress, 'pending');
    const gasPrice = await provider.getFeeData();
    
    // 调用签名服务
    const signResponse = await fetch(config.signingServiceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: recipient,
        value: amount,
        nonce,
        gasPrice: gasPrice.gasPrice ? ethers.formatUnits(gasPrice.gasPrice, 'gwei') : undefined,
      }),
    });

    if (!signResponse.ok) {
      const error = await signResponse.json();
      return { success: false, error: error.message || 'Failed to sign transaction' };
    }

    const signResult = await signResponse.json();
    
    if (!signResult.success) {
      return { success: false, error: signResult.error || 'Signing failed' };
    }

    // 广播交易
    const broadcastResponse = await fetch(config.broadcastServiceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        signedTransaction: signResult.signedTransaction,
      }),
    });

    if (!broadcastResponse.ok) {
      const error = await broadcastResponse.json();
      return { success: false, error: error.message || 'Failed to broadcast transaction' };
    }

    const broadcastResult = await broadcastResponse.json();
    
    return {
      success: true,
      txHash: broadcastResult.transactionHash,
    };
  } catch (error) {
    console.error('直接转账时发生错误:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

