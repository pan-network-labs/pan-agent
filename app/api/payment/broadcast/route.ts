/**
 * 交易广播服务端点
 * 
 * 用于广播已签名的交易到区块链网络
 * 这个服务不需要私钥，只需要签名后的交易数据
 */

import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

// CORS响应头配置
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

// POST /api/payment/broadcast - 广播已签名的交易
export async function POST(request: NextRequest) {
  try {
    // 1. 解析请求体
    const body = await request.json();
    const { signedTransaction } = body;

    if (!signedTransaction) {
      return NextResponse.json(
        { error: 'Missing signedTransaction parameter' },
        { status: 400, headers: getCorsHeaders() }
      );
    }

    // 2. 连接区块链网络
    const rpcUrl = process.env.PAYMENT_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/';
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // 3. 广播交易
    const txResponse = await provider.broadcastTransaction(signedTransaction);
    
    console.log('Transaction broadcasted:', {
      hash: txResponse.hash,
      timestamp: new Date().toISOString(),
    });

    // 4. 等待交易确认（可选）
    // const receipt = await txResponse.wait();
    
    // 5. 返回交易哈希
    return NextResponse.json(
      {
        success: true,
        transactionHash: txResponse.hash,
        // receipt: receipt, // 如果需要等待确认，可以返回收据
      },
      { headers: getCorsHeaders() }
    );
  } catch (error) {
    console.error('广播交易时发生错误:', error);
    return NextResponse.json(
      {
        error: 'Failed to broadcast transaction',
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

