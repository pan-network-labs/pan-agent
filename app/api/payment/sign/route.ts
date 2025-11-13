/**
 * 支付签名服务端点
 * 
 * 这是一个独立的签名服务，用于安全地签名支付交易
 * 私钥存储在环境变量或更安全的位置（如 HSM、密钥管理服务）
 * 
 * 安全建议：
 * 1. 使用环境变量存储私钥（生产环境使用密钥管理服务）
 * 2. 添加 IP 白名单
 * 3. 添加请求频率限制
 * 4. 添加请求签名验证
 * 5. 记录所有签名请求
 */

import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

// CORS响应头配置
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

// 验证请求来源（可选，增强安全性）
function validateRequest(request: NextRequest): boolean {
  // 可以添加 IP 白名单检查
  // const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
  // return allowedIPs.includes(clientIp);
  
  // 可以添加 API Key 验证
  // const apiKey = request.headers.get('Authorization');
  // return validateApiKey(apiKey);
  
  return true; // 简化版本，生产环境应该添加验证
}

// POST /api/payment/sign - 签名支付交易
export async function POST(request: NextRequest) {
  try {
    // 1. 验证请求
    if (!validateRequest(request)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: getCorsHeaders() }
      );
    }

    // 2. 解析请求体
    const body = await request.json();
    const { to, value, data, nonce, gasPrice, gasLimit } = body;

    // 3. 验证必需参数
    if (!to || !value) {
      return NextResponse.json(
        { error: 'Missing required parameters: to, value' },
        { status: 400, headers: getCorsHeaders() }
      );
    }

    // 4. 获取私钥（从环境变量，生产环境应使用密钥管理服务）
    const privateKey = process.env.PAYMENT_PRIVATE_KEY;
    if (!privateKey) {
      console.error('PAYMENT_PRIVATE_KEY not configured');
      return NextResponse.json(
        { error: 'Signing service not configured' },
        { status: 500, headers: getCorsHeaders() }
      );
    }

    // 5. 创建钱包和提供者
    const rpcUrl = process.env.PAYMENT_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/';
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    // 6. 构建交易
    const tx: ethers.TransactionRequest = {
      to,
      value: ethers.parseEther(value.toString()),
      data: data || '0x',
    };

    // 如果提供了 nonce，使用它；否则自动获取
    if (nonce !== undefined) {
      tx.nonce = nonce;
    } else {
      tx.nonce = await provider.getTransactionCount(wallet.address);
    }

    // 如果提供了 gas 参数，使用它们；否则自动估算
    if (gasPrice) {
      tx.gasPrice = ethers.parseUnits(gasPrice.toString(), 'gwei');
    }
    if (gasLimit) {
      tx.gasLimit = BigInt(gasLimit);
    }

    // 7. 签名交易
    const signedTx = await wallet.signTransaction(tx);
    
    // 8. 记录签名操作（用于审计）
    console.log('Transaction signed:', {
      from: wallet.address,
      to,
      value: value.toString(),
      nonce: tx.nonce,
      timestamp: new Date().toISOString(),
    });

    // 9. 返回签名后的交易
    return NextResponse.json(
      {
        success: true,
        signedTransaction: signedTx,
        from: wallet.address,
        to,
        value: value.toString(),
        nonce: tx.nonce,
      },
      { headers: getCorsHeaders() }
    );
  } catch (error) {
    console.error('签名交易时发生错误:', error);
    return NextResponse.json(
      {
        error: 'Failed to sign transaction',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}

// 处理预检请求
export async function OPTIONS() {
  return NextResponse.json({}, { headers: getCorsHeaders() });
}

