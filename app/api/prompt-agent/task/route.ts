/**
 * Prompt Agent Task 端点
 * POST /api/prompt-agent/task
 * 
 * HTTP 格式的 API（非 JSON-RPC 2.0）
 * 
 * 请求格式：
 * {
 *   "topic": "string", // 必需，图片主题
 *   "style": "string", // 可选，艺术风格
 *   "additionalRequirements": "string" // 可选，额外要求
 * }
 * 
 * 响应格式（成功）：
 * {
 *   "success": true,
 *   "prompt": "string",
 *   "topic": "string"
 * }
 * 
 * 响应格式（失败）：
 * {
 *   "success": false,
 *   "error": "string"
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCorsHeaders } from '../utils';
import { getPaymentConfig, validatePayment } from '../payment-utils';
import { createX402Response } from '../../x402-utils';
import { makeContractPayment, SBTRarity } from '../../payment/simple';
import { ethers } from 'ethers';

// 处理预检请求（OPTIONS）
export async function OPTIONS() {
  return NextResponse.json({}, { headers: getCorsHeaders() });
}

/**
 * 随机生成 SBT 级别
 * N级: 94.75%
 * R级: 5%
 * S级: 0.25%
 */
function generateRandomRarity(): SBTRarity {
  const random = Math.random() * 100; // 0-100 的随机数
  
  if (random < 0.25) {
    // S级: 0-0.25 (0.25%)
    return 'S';
  } else if (random < 5.25) {
    // R级: 0.25-5.25 (5%)
    return 'R';
  } else {
    // N级: 5.25-100 (94.75%)
    return 'N';
  }
}

// POST /api/prompt-agent/task - 处理任务请求（HTTP 格式）
export async function POST(request: NextRequest) {
  try {
    // 1. 支付验证（X-PAYMENT 机制）
    const PAYMENT_CONFIG = getPaymentConfig();
    const xPaymentHeader = request.headers.get('X-PAYMENT');
    
    // 获取当前请求的 URL 作为 resource
    const requestUrl = new URL(request.url);
    const resource = requestUrl.toString();
    
    // 从查询参数中获取 referrer（推广人地址）
    const referrer = requestUrl.searchParams.get('referrer') || undefined;
    
    // 必须提供 X-PAYMENT
    if (!xPaymentHeader) {
      // 使用 x402 标准格式（直接返回，不在 error.data 中）
      const x402Response = createX402Response({
        price: PAYMENT_CONFIG.price,
        currency: PAYMENT_CONFIG.currency,
        network: PAYMENT_CONFIG.network,
        address: PAYMENT_CONFIG.address,
        resource: resource,
        description: 'Payment required to access prompt generation service',
        mimeType: 'application/json',
        referrer: referrer, // 如果有 referrer，包含在响应中
      });
      
      console.log('Prompt Agent 返回 402 响应（合约交易信息）:');
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
    
    // 验证支付
    const paymentValidation = await validatePayment(xPaymentHeader);
    
    if (!paymentValidation.valid) {
      // 使用 x402 标准格式（直接返回，不在 error.data 中）
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
      
      console.log('Prompt Agent 支付验证失败，返回 402 响应（合约交易信息）:');
      console.log('完整 x402 响应:', JSON.stringify(x402Response, null, 2));
      console.log('合约地址:', PAYMENT_CONFIG.address);
      console.log('支付金额 (Wei):', PAYMENT_CONFIG.price);
      console.log('支付金额 (BNB):', (BigInt(PAYMENT_CONFIG.price) / BigInt(1e18)).toString());
      console.log('Referrer:', referrer || '(空字符串)');
      console.log('验证错误:', paymentValidation.error);
      
      return NextResponse.json(
        x402Response,
        {
          status: 402,
          headers: getCorsHeaders(),
        }
      );
    }

    // 2. 解析 HTTP 请求体
    const body = await request.json();

    // 3. 获取用户地址（recipient，用于发放 SBT）
    // 优先级：
    // 1. 从请求体中获取 userAddress（Generate Agent 传递的，因为 X-PAYMENT 中的交易是 Generate Agent 发起的）
    // 2. 如果请求体中没有，则从 X-PAYMENT 交易中提取（用户直接调用 Prompt Agent 的情况）
    let userAddress: string | undefined = body.userAddress;
    
    if (!userAddress) {
      // 如果请求体中没有 userAddress，尝试从交易中获取（用户直接调用的情况）
      try {
        const tsHash = Buffer.from(xPaymentHeader, 'base64').toString('utf-8');
        const provider = new ethers.JsonRpcProvider(PAYMENT_CONFIG.rpcUrl);
        const tx = await provider.getTransaction(tsHash);
        if (tx) {
          userAddress = tx.from;
          console.log('从交易中获取用户地址（用户直接调用）:', userAddress);
        }
      } catch (error) {
        console.error('获取用户地址失败:', error);
      }
    } else {
      console.log('从请求体中获取用户地址（Agent 间调用）:', userAddress);
    }

    if (!userAddress) {
      return NextResponse.json(
        {
          code: 500,
          msg: '无法获取用户地址（用于发放 SBT）',
          data: null,
        },
        {
          status: 500,
          headers: getCorsHeaders(),
        }
      );
    }

    // 4. 随机生成 SBT 级别（N: 94.75%, R: 5%, S: 0.25%）
    const rarity = generateRandomRarity();
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🎲 随机生成 SBT 级别');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('生成的级别:', rarity, `(${rarity === 'N' ? 'N级（普通）' : rarity === 'R' ? 'R级（稀有）' : 'S级（超级稀有）'})`);
    console.log('概率分布: N级 94.75%, R级 5%, S级 0.25%');
    console.log('═══════════════════════════════════════════════════════════');

    // 5. 使用 PROMPT_PRIVATE_KEY 调用合约生成对应级别的 SBT
    const promptPrivateKey = process.env.PROMPT_PRIVATE_KEY;
    if (!promptPrivateKey) {
      return NextResponse.json(
        {
          code: 500,
          msg: 'PROMPT_PRIVATE_KEY 未配置',
          data: null,
        },
        {
          status: 500,
          headers: getCorsHeaders(),
        }
      );
    }

    // 验证 PROMPT_PRIVATE_KEY 对应的地址
    const provider = new ethers.JsonRpcProvider(PAYMENT_CONFIG.rpcUrl);
    const promptWallet = new ethers.Wallet(promptPrivateKey, provider);
    const promptWalletAddress = promptWallet.address;
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔑 使用 PROMPT_PRIVATE_KEY 调用合约');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('PROMPT_PRIVATE_KEY 对应的钱包地址:', promptWalletAddress);
    console.log('⚠️  请确保此地址已被授权为合约的 minter');
    console.log('═══════════════════════════════════════════════════════════');

    // 将支付金额从 Wei 转换为 BNB 格式
    const amountBNB = ethers.formatEther(PAYMENT_CONFIG.price);
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('💰 调用合约生成 SBT');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('使用的私钥: PROMPT_PRIVATE_KEY');
    console.log('钱包地址 (minter):', promptWalletAddress);
    console.log('用户地址 (recipient):', userAddress);
    console.log('SBT 级别:', rarity);
    console.log('支付金额 (BNB):', amountBNB);
    console.log('合约地址:', PAYMENT_CONFIG.address);
    console.log('Referrer:', referrer || '(空字符串)');
    console.log('═══════════════════════════════════════════════════════════');

    // makeContractPayment 会自动从环境变量读取 PROMPT_PRIVATE_KEY（优先）或 PAYMENT_PRIVATE_KEY
    const sbtResult = await makeContractPayment(
      amountBNB,
      `Prompt Agent 服务费用`,
      userAddress, // 用户地址（接收 SBT）
      PAYMENT_CONFIG.address, // 合约地址
      referrer || '', // 推广人
      rarity // SBT 级别
    );

    if (!sbtResult.success) {
      console.error('═══════════════════════════════════════════════════════════');
      console.error('❌ 生成 SBT 失败');
      console.error('═══════════════════════════════════════════════════════════');
      console.error('使用的钱包地址 (minter):', promptWalletAddress);
      console.error('错误信息:', sbtResult.error);
      console.error('═══════════════════════════════════════════════════════════');
      console.error('⚠️  可能的原因：');
      console.error('  1. 钱包地址未被授权为合约的 minter');
      console.error('  2. 钱包余额不足');
      console.error('  3. 合约调用参数错误');
      console.error('═══════════════════════════════════════════════════════════');
      
      return NextResponse.json(
        {
          code: 500,
          msg: `生成 SBT 失败: ${sbtResult.error}`,
          data: {
            error: sbtResult.error,
            minterAddress: promptWalletAddress,
            hint: '请确保 PROMPT_PRIVATE_KEY 对应的地址已被授权为合约的 minter',
            ...(sbtResult.errorDetails || {}), // 包含授权地址信息
          },
        },
        {
          status: 500,
          headers: getCorsHeaders(),
        }
      );
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ SBT 生成成功');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('使用的钱包地址 (minter):', promptWalletAddress);
    console.log('交易哈希:', sbtResult.txHash);
    console.log('SBT 级别:', rarity);
    console.log('用户地址 (recipient):', userAddress);
    console.log('═══════════════════════════════════════════════════════════');

    // 6. 根据 SBT 级别从环境变量中读取对应的提示词（直接使用，不进行任何替换）
    const promptEnvKey = rarity === 'N' ? 'PROMPT_N' : rarity === 'R' ? 'PROMPT_R' : 'PROMPT_S';
    const finalPrompt = process.env[promptEnvKey];

    if (!finalPrompt) {
      return NextResponse.json(
        {
          success: false,
          error: `${promptEnvKey} 环境变量未配置`,
        },
        {
          status: 500,
          headers: getCorsHeaders(),
        }
      );
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📝 使用提示词');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('使用的环境变量:', promptEnvKey);
    console.log('SBT 级别:', rarity);
    console.log('提示词:', finalPrompt);
    console.log('═══════════════════════════════════════════════════════════');

    // 7. 返回成功响应
    return NextResponse.json(
      {
        code: 200,
        msg: 'success',
        data: {
          data: finalPrompt, // 直接返回环境变量中的提示词
          rarity: rarity, // 返回生成的 SBT 级别
        },
      },
      {
        headers: getCorsHeaders(),
      }
    );
  } catch (error) {
    console.error('处理任务时发生错误:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      },
      {
        status: 500,
        headers: getCorsHeaders(),
      }
    );
  }
}

