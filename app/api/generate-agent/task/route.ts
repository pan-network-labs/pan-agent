/**
 * Generate Agent Task 端点
 * POST /api/generate-agent/task
 * 
 * 处理 HTTP 格式的任务请求
 * 
 * 请求参数（JSON格式）：
 * {
 *   "topic": "string", // 可选，图片主题（如果不提供则使用默认主题）
 * }
 * 
 * 说明：
 * - 需要先支付（X-PAYMENT 机制），否则返回 402 状态码
 * - Generate Agent 会自动调用 Prompt Agent 获取 prompt，并自动支付给 Prompt Agent（0.01 BNB）
 * - 实际发送给智谱AI的prompt会自动添加前缀："异常抽象的油画："
 * - 图片尺寸固定为：1024x1024
 * - 需要配置环境变量：ZHIPUAI_API_KEY、PAYMENT_PRIVATE_KEY、PAYMENT_CONTRACT_ADDRESS
 * - 可选环境变量：PROMPT_AGENT_URL（如果不设置，会自动使用当前请求的域名构建）
 */

import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { createX402Response } from '../../../x402-utils';
import { callPromptAgentWithPayment } from '../../a2a-agent/agent-client';

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
// 环境变量中的价格应该是 Wei 格式（字符串）
function getPaymentConfig() {
  // 如果环境变量是 BNB 格式（如 "0.02"），转换为 Wei；如果已经是 Wei 格式，直接使用
  const priceEnv = process.env.PAYMENT_PRICE || '20000000000000000'; // 默认 0.02 BNB = 20000000000000000 Wei
  const minAmountEnv = process.env.PAYMENT_MIN_AMOUNT || process.env.PAYMENT_PRICE || '20000000000000000';
  
  // 判断是 BNB 格式还是 Wei 格式（BNB 格式通常小于 1e15，Wei 格式通常大于 1e15）
  const priceWei = parseFloat(priceEnv) < 1e15 
    ? ethers.parseEther(priceEnv).toString() 
    : priceEnv;
  const minAmountWei = parseFloat(minAmountEnv) < 1e15 
    ? ethers.parseEther(minAmountEnv).toString() 
    : minAmountEnv;
  
  // 优先使用 PAYMENT_CONTRACT_ADDRESS（合约地址），如果没有则使用 PAYMENT_ADDRESS
  const contractAddress = process.env.PAYMENT_CONTRACT_ADDRESS || process.env.PAYMENT_ADDRESS || '';
  
  const config = {
    price: priceWei, // Wei 格式
    currency: process.env.PAYMENT_CURRENCY || 'BNB',
    network: process.env.PAYMENT_NETWORK || 'BSCTest',
    address: contractAddress, // 使用合约地址
    minAmount: minAmountWei, // Wei 格式
    rpcUrl: process.env.PAYMENT_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/',
  };

  return config;
}

// 验证支付信息
async function validatePayment(xPaymentHeader: string | null): Promise<{ valid: boolean; userAddress?: string; error?: any }> {
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
    console.log('接收方（合约地址）:', tx.to);
    console.log('交易金额:', ethers.formatEther(tx.value), 'BNB');
    console.log('交易状态:', receipt.status === 1 ? '成功' : '失败');

    // 7. 验证收款地址和金额（使用 Wei 格式比较）
    const expectedAddress = PAYMENT_CONFIG.address.toLowerCase();
    const amountWei = BigInt(tx.value.toString());
    const minAmountWei = BigInt(PAYMENT_CONFIG.minAmount);

    // 验证交易的 to 地址（支持直接支付和智能合约支付）
    // 直接支付：to 地址是 PAYMENT_ADDRESS
    // 智能合约支付：to 地址是合约地址（合约直接收款，不再需要 recipient 参数）
    const toAddress = tx.to?.toLowerCase();
    const isValidRecipient = toAddress === expectedAddress;
    
    console.log(`验证 to 地址: 期望 ${expectedAddress}, 实际 ${toAddress}`);

    if (!isValidRecipient) {
      console.log('收款地址不匹配');
      return { valid: false, error: '收款地址不匹配' };
    }

    if (amountWei < minAmountWei) {
      console.log(`交易金额不足: 期望 >= ${ethers.formatEther(PAYMENT_CONFIG.minAmount)} BNB, 实际 ${ethers.formatEther(tx.value.toString())} BNB`);
      return { valid: false, error: '交易金额不足' };
    }

    // 9. 验证交易是否成功
    if (receipt.status !== 1) {
      return { valid: false, error: '交易失败' };
    }

    // 10. 返回用户地址（用于后续给用户发放 SBT）
    return { valid: true, userAddress: tx.from };
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
    
    // 获取当前请求的 URL 作为 resource
    const requestUrl = new URL(request.url);
    const resource = requestUrl.toString();
    
    // 从查询参数中获取 referrer（推广人地址）
    const referrer = requestUrl.searchParams.get('referrer') || undefined;

    // 如果 X-PAYMENT 没有信息，直接返回 402 和支付信息（x402 标准格式）
    if (!xPaymentHeader) {
      const x402Response = createX402Response({
        price: PAYMENT_CONFIG.price,
        currency: PAYMENT_CONFIG.currency,
        network: PAYMENT_CONFIG.network,
        address: PAYMENT_CONFIG.address,
        resource: resource,
        description: 'Payment required to generate image',
        mimeType: 'application/json',
        referrer: referrer, // 如果有 referrer，包含在响应中
      });
      
      console.log('Generate Agent 返回 402 响应（合约交易信息）:');
      console.log('完整 x402 响应:', JSON.stringify(x402Response, null, 2));
      console.log('合约地址:', PAYMENT_CONFIG.address);
      console.log('支付金额 (Wei):', PAYMENT_CONFIG.price);
      console.log('支付金额 (BNB):', (BigInt(PAYMENT_CONFIG.price) / BigInt(1e18)).toString());
      console.log('货币:', PAYMENT_CONFIG.currency);
      console.log('网络:', PAYMENT_CONFIG.network);
      console.log('Referrer:', referrer || '(空字符串)');
      console.log('Resource:', resource);
      
      return NextResponse.json(
        x402Response,
        {
          status: 402,
          headers: getCorsHeaders(),
        }
      );
    }
    
    // 如果有 X-PAYMENT 信息，验证支付
    const paymentValidation = await validatePayment(xPaymentHeader);
    
    // 获取用户地址（从支付交易中）
    const userAddress = paymentValidation.userAddress;
    
    if (!paymentValidation.valid) {
      // 验证失败时返回 402 和支付信息（x402 标准格式）
      const x402Response = createX402Response({
        price: PAYMENT_CONFIG.price,
        currency: PAYMENT_CONFIG.currency,
        network: PAYMENT_CONFIG.network,
        address: PAYMENT_CONFIG.address,
        resource: resource,
        description: 'Payment validation failed, please retry',
        mimeType: 'application/json',
        referrer: referrer, // 如果有 referrer，包含在响应中
      });
      
      return NextResponse.json(
        x402Response,
        {
          status: 402,
          headers: getCorsHeaders(),
        }
      );
    }

    // 2. 调用 Prompt Agent 获取 prompt（自动处理支付流程）
    // 流程：先调用 → 收到 402 → 解析支付信息 → 向智能合约支付（传入用户地址作为 recipient） → 重新调用
    // 使用默认主题，让 Prompt Agent 自动生成 prompt
    let finalPrompt: string;
    try {
      // 获取 Prompt Agent URL（优先使用环境变量，否则使用当前请求的域名自动构建）
      // 注意：requestUrl 已经在函数开头定义过了，这里直接使用
      const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;
      const agentUrl = process.env.PROMPT_AGENT_URL || `${baseUrl}/api/prompt-agent`;
      
      // 使用默认主题，Prompt Agent 会自动生成 prompt
      const defaultTopic = '一幅美丽的抽象艺术作品';
      
      // 调用 Prompt Agent（自动处理支付流程，传入用户地址用于发放 SBT）
      // 从请求 URL 中获取 referrer，传递给 Prompt Agent
      const referrer = requestUrl.searchParams.get('referrer') || '';
      
      console.log('Generate Agent 调用 Prompt Agent，传递的 referrer:', referrer || '(空字符串)');
      
      const promptResult = await callPromptAgentWithPayment(
        agentUrl,
        defaultTopic,
        '抽象',
        '色彩丰富，充满创意',
        userAddress, // 传入用户地址，用于给用户发放 SBT
        referrer || undefined // 传递 referrer 给 Prompt Agent（Prompt Agent 会将其包含在 402 响应中）
      );

      if (!promptResult.success || !promptResult.prompt) {
        const errorMessage = promptResult.error?.message || promptResult.error || '调用 Prompt Agent 失败';
        console.error('调用 Prompt Agent 失败:', errorMessage);
        return NextResponse.json(
          {
            code: 500,
            msg: `调用 Prompt Agent 失败: ${errorMessage}`,
            data: null,
          },
          {
            status: 500,
            headers: getCorsHeaders(),
          }
        );
      }

      finalPrompt = promptResult.prompt;
      console.log('从 Prompt Agent 获取的 prompt:', finalPrompt);
    } catch (error) {
      console.error('调用 Prompt Agent 时发生错误:', error);
      return NextResponse.json(
        {
          code: 500,
          msg: `调用 Prompt Agent 失败: ${error instanceof Error ? error.message : '未知错误'}`,
          data: null,
        },
        {
          status: 500,
          headers: getCorsHeaders(),
        }
      );
    }

    // 3. 调用智谱AI生成图片
    const zhipuApiKey = process.env.ZHIPUAI_API_KEY;
    if (!zhipuApiKey) {
      return NextResponse.json(
        {
          code: 500,
          msg: 'ZHIPUAI_API_KEY 环境变量未配置',
          data: null,
        },
        {
          status: 500,
          headers: getCorsHeaders(),
        }
      );
    }

    // 构建完整的 prompt（添加前缀）
    const fullPrompt = `异常抽象的油画：${finalPrompt}`;
    
    console.log('调用智谱AI生成图片，完整 prompt:', fullPrompt);

    const zhipuResponse = await fetch('https://open.bigmodel.cn/api/paas/v4/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${zhipuApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'cogview-3-flash',
        prompt: fullPrompt,
        size: '1024x1024',
        n: 1,
      }),
    });

    if (!zhipuResponse.ok) {
      const errorText = await zhipuResponse.text();
      console.error('智谱AI API 错误:', errorText);
      return NextResponse.json(
        {
          code: 500,
          msg: `智谱AI API 调用失败: ${errorText}`,
          data: null,
        },
        {
          status: 500,
          headers: getCorsHeaders(),
        }
      );
    }

    const zhipuData = await zhipuResponse.json();
    
    if (!zhipuData.data || !zhipuData.data[0] || !zhipuData.data[0].url) {
      console.error('智谱AI 响应格式错误:', zhipuData);
      return NextResponse.json(
        {
          code: 500,
          msg: '智谱AI 响应格式错误',
          data: null,
        },
        {
          status: 500,
          headers: getCorsHeaders(),
        }
      );
    }

    const imageUrl = zhipuData.data[0].url;
    console.log('图片生成成功，URL:', imageUrl);

    // 4. 返回成功响应
    return NextResponse.json(
      {
        code: 200,
        msg: 'success',
        data: {
          data: imageUrl,
        },
      },
      {
        headers: getCorsHeaders(),
      }
    );
  } catch (error) {
    console.error('处理请求时发生错误:', error);
    return NextResponse.json(
      {
        code: 500,
        msg: error instanceof Error ? error.message : '未知错误',
        data: null,
      },
      {
        status: 500,
        headers: getCorsHeaders(),
      }
    );
  }
}

