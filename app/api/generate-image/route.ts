/**
 * 智谱AI图片生成API
 * 
 * 请求方式：POST
 * 请求地址：/api/generate-image
 * 
 * 请求参数（JSON格式）：
 * {
 *   "prompt": "string" // 必需，用户输入的提示词（字符串类型）
 * }
 * 
 * 请求示例：
 * {
 *   "prompt": "一只可爱的小猫咪"
 * }
 * 
 * 响应格式（成功）：
 * {
 *   "code": 200,
 *   "msg": "success",
 *   "data": {
 *     "data": "https://..." // 生成的图片URL
 *   }
 * }
 * 
 * 响应格式（失败）：
 * {
 *   "code": 400/500,
 *   "msg": "错误信息",
 *   "data": {
 *     "data": ""
 *   }
 * }
 * 
 * 说明：
 * - 实际发送给智谱AI的prompt会自动添加前缀："异常抽象的油画："
 * - 图片尺寸固定为：1024x1024
 * - 需要配置环境变量：ZHIPUAI_API_KEY
 */

import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

// CORS响应头配置
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-PAYMENT',
    'Access-Control-Max-Age': '86400',
  };
}

// 获取支付验证配置（从环境变量）
function getPaymentConfig() {
  const config = {
    price: process.env.PAYMENT_PRICE || '0.01',
    currency: process.env.PAYMENT_CURRENCY || 'BNB',
    network: process.env.PAYMENT_NETWORK || 'BSCTest',
    address: process.env.PAYMENT_ADDRESS || '',
    minAmount: process.env.PAYMENT_MIN_AMOUNT || '0.01',
    rpcUrl: process.env.PAYMENT_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/',
  };

  // 验证必要的配置
  if (!config.address) {
    throw new Error('PAYMENT_ADDRESS 环境变量未配置');
  }

  return config;
}

// 验证支付信息
async function validatePayment(xPaymentHeader: string | null): Promise<{ valid: boolean; error?: any }> {
  const PAYMENT_CONFIG = getPaymentConfig();

  // 1. 检查是否有 X-PAYMENT 请求头
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

  try {
    // 2. Base64 解码获取交易哈希
    const tsHash = Buffer.from(xPaymentHeader, 'base64').toString('utf-8');
    
    // 3. 连接 BSC Testnet
    const provider = new ethers.JsonRpcProvider(PAYMENT_CONFIG.rpcUrl);
    
    // 4. 查询交易信息
    const tx = await provider.getTransaction(tsHash);
    if (!tx) {
      return { valid: false, error: '交易不存在' };
    }

    // 5. 等待交易确认并获取收据
    const receipt = await provider.getTransactionReceipt(tsHash);
    if (!receipt) {
      return { valid: false, error: '交易尚未确认' };
    }

    // 6. 打印交易信息
    console.log('交易信息:');
    console.log('交易哈希:', tsHash);
    console.log('发送方:', tx.from);
    console.log('接收方:', tx.to);
    console.log('交易金额:', ethers.formatEther(tx.value), 'BNB');
    console.log('交易状态:', receipt.status === 1 ? '成功' : '失败');

    // 7. 验证收款地址和金额
    const toAddress = tx.to?.toLowerCase();
    const expectedAddress = PAYMENT_CONFIG.address.toLowerCase();
    const amount = parseFloat(ethers.formatEther(tx.value));
    const minAmount = parseFloat(PAYMENT_CONFIG.minAmount);

    if (toAddress !== expectedAddress) {
      console.log(`收款地址不匹配: 期望 ${expectedAddress}, 实际 ${toAddress}`);
      return { valid: false, error: '收款地址不匹配' };
    }

    if (amount < minAmount) {
      console.log(`交易金额不足: 期望 >= ${minAmount} BNB, 实际 ${amount} BNB`);
      return { valid: false, error: '交易金额不足' };
    }

    // 8. 验证交易是否成功
    if (receipt.status !== 1) {
      return { valid: false, error: '交易失败' };
    }

    return { valid: true };
  } catch (error) {
    console.error('支付验证错误:', error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : '支付验证失败',
    };
  }
}

// 处理预检请求（OPTIONS）
export async function OPTIONS() {
  return NextResponse.json({}, { headers: getCorsHeaders() });
}

export async function POST(request: NextRequest) {
  try {
    // 1. 支付验证（在函数最开始）
    const PAYMENT_CONFIG = getPaymentConfig();
    const xPaymentHeader = request.headers.get('X-PAYMENT');
    
    // 如果 X-PAYMENT 没有信息，直接返回 402 和支付信息
    if (!xPaymentHeader) {
      return NextResponse.json(
        {
          price: PAYMENT_CONFIG.price,
          currency: PAYMENT_CONFIG.currency,
          network: PAYMENT_CONFIG.network,
          address: PAYMENT_CONFIG.address,
        },
        {
          status: 402,
          headers: getCorsHeaders(),
        }
      );
    }
    
    // 如果有 X-PAYMENT 信息，验证支付
    const paymentValidation = await validatePayment(xPaymentHeader);
    
    if (!paymentValidation.valid) {
      // 验证失败时返回 402 和支付信息
      return NextResponse.json(
        {
          price: PAYMENT_CONFIG.price,
          currency: PAYMENT_CONFIG.currency,
          network: PAYMENT_CONFIG.network,
          address: PAYMENT_CONFIG.address,
        },
        {
          status: 402,
          headers: getCorsHeaders(),
        }
      );
    }

    // 2. 解析请求体
    const body = await request.json();
    const { prompt } = body;

    // 3. 验证必需参数
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({
        code: 400,
        msg: '缺少必需的参数: prompt',
        data: { data: '' }
      }, { 
        status: 400,
        headers: getCorsHeaders()
      });
    }

    // 4. 获取API密钥（从环境变量）
    const apiKey = process.env.ZHIPUAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        code: 500,
        msg: '未配置API密钥，请设置环境变量 ZHIPUAI_API_KEY',
        data: { data: '' }
      }, { 
        status: 500,
        headers: getCorsHeaders()
      });
    }

    // 5. 调用智谱AI API
    // 请求参数：
    // - model: 使用cogview-3-flash模型
    // - prompt: 用户提示词 + 系统前缀"异常抽象的油画："
    // - size: 图片尺寸 1024x1024
    const response = await fetch('https://open.bigmodel.cn/api/paas/v4/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'cogview-3-flash',
        prompt: `异常抽象的油画：${prompt}`,
        size: '1024x1024',
      }),
    });

    // 6. 处理智谱AI API响应
    if (!response.ok) {
      const errorData = await response.text();
      console.error('智谱AI API错误:', errorData);
      return NextResponse.json({
        code: response.status,
        msg: '图片生成失败',
        data: { data: errorData }
      }, { 
        status: response.status,
        headers: getCorsHeaders()
      });
    }

    // 7. 解析成功响应并提取图片URL
    const data = await response.json();
    const imageUrl = data.data?.[0]?.file_url || data.data?.[0]?.url;
    
    // 返回统一格式：{ code: 200, msg: "success", data: { data: "图片URL" } }
    return NextResponse.json({
      code: 200,
      msg: 'success',
      data: { data: imageUrl }
    }, {
      headers: getCorsHeaders()
    });
  } catch (error) {
    console.error('生成图片时发生错误:', error);
    return NextResponse.json({
      code: 500,
      msg: '服务器内部错误',
      data: { data: error instanceof Error ? error.message : '未知错误' }
    }, { 
      status: 500,
      headers: getCorsHeaders()
    });
  }
}

