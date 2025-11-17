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
 * - 使用通义万相 wan2.5-t2i-preview 模型生成图片
 * - 图片尺寸固定为：1024*1024，水印：false
 * - 需要配置环境变量：QWEN_API_KEY、PAYMENT_PRIVATE_KEY、PAYMENT_CONTRACT_ADDRESS
 * - 可选环境变量：PROMPT_AGENT_URL（如果不设置，会自动使用当前请求的域名构建）
 */

import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { createX402Response } from '../../x402-utils';
import { callPromptAgentWithPayment } from '../../a2a-agent/agent-client';

// CORS响应头配置（允许所有来源）
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
  // 如果环境变量是 BNB 格式（如 "0.005"），转换为 Wei；如果已经是 Wei 格式，直接使用
  const priceEnv = process.env.PAYMENT_PRICE || '5000000000000000'; // 默认 0.005 BNB = 5000000000000000 Wei
  const minAmountEnv = process.env.PAYMENT_MIN_AMOUNT || process.env.PAYMENT_PRICE || '5000000000000000';
  
  // 判断是 BNB 格式还是 Wei 格式（BNB 格式通常小于 1e15，Wei 格式通常大于 1e15）
  const priceWei = parseFloat(priceEnv) < 1e15 
    ? ethers.parseEther(priceEnv).toString() 
    : priceEnv;
  const minAmountWei = parseFloat(minAmountEnv) < 1e15 
    ? ethers.parseEther(minAmountEnv).toString() 
    : minAmountEnv;
  
  // ============================================================================
  // 【重要】Generate Agent 收款地址配置说明：
  // ============================================================================
  // PAYMENT_ADDRESS: 普通钱包地址（用户支付给 Generate Agent）
  //   - 用途：用户直接转账给 Generate Agent 的收款地址（不通过合约）
  //   - 功能：接收用户支付，Generate Agent 收到后会自动调用 Prompt Agent
  //   - 说明：用户支付给 Generate Agent 是直接转账，不通过智能合约
  //   - 示例：0x74cc09316deab81ee874839e1da9e84ec066369c
  //
  // 注意：Generate Agent 不使用 PAYMENT_CONTRACT_ADDRESS
  //      PAYMENT_CONTRACT_ADDRESS 用于 Generate Agent 支付给 Prompt Agent（通过合约）
  // ============================================================================
  const paymentAddress = process.env.PAYMENT_ADDRESS || '0x74cc09316deab81ee874839e1da9e84ec066369c';
  
  // 记录使用的地址类型（用于调试）
  console.log(`📋 Generate Agent 收款地址配置: PAYMENT_ADDRESS（普通钱包）`);
  console.log(`   用途：用户直接转账给 Generate Agent 的收款地址`);
  console.log(`   地址: ${paymentAddress}`);
  console.log(`   注意：Generate Agent 支付给 Prompt Agent 使用 PAYMENT_CONTRACT_ADDRESS（智能合约）`);
  
  const config = {
    price: priceWei, // Wei 格式
    currency: process.env.PAYMENT_CURRENCY || 'BNB',
    network: process.env.PAYMENT_NETWORK || 'BSCTest',
    address: paymentAddress, // 用户支付给 Generate Agent 的地址（普通钱包）
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
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔍 Generate Agent 开始验证支付');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 接收到的 X-PAYMENT 头:', xPaymentHeader);
    
    const tsHash = Buffer.from(xPaymentHeader, 'base64').toString('utf-8');
    console.log('📝 Base64 解码后的交易哈希:', tsHash);
    
    // 3. 连接 BSC Testnet
    console.log('🌐 连接 RPC 节点:', PAYMENT_CONFIG.rpcUrl);
    const provider = new ethers.JsonRpcProvider(PAYMENT_CONFIG.rpcUrl);
    
    // 4. 查询交易信息
    console.log('🔎 查询交易信息...');
    const tx = await provider.getTransaction(tsHash);
    if (!tx) {
      console.error('❌ 交易不存在:', tsHash);
      return { valid: false, error: '交易不存在' };
    }

    // 5. 等待交易确认并获取收据
    console.log('⏳ 等待交易确认...');
    const receipt = await provider.getTransactionReceipt(tsHash);
    if (!receipt) {
      console.error('❌ 交易尚未确认:', tsHash);
      return { valid: false, error: '交易尚未确认' };
    }

    // 6. 打印交易信息
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 交易信息:');
    console.log('  - 交易哈希:', tsHash);
    console.log('  - 发送方:', tx.from);
    console.log('  - 接收方（合约地址）:', tx.to);
    console.log('  - 交易金额 (Wei):', tx.value.toString());
    console.log('  - 交易金额 (BNB):', ethers.formatEther(tx.value));
    console.log('  - 交易状态:', receipt.status === 1 ? '✅ 成功' : '❌ 失败');
    console.log('  - 区块号:', receipt.blockNumber?.toString() || 'N/A');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 7. 验证收款地址和金额（使用 Wei 格式比较）
    const expectedAddress = PAYMENT_CONFIG.address.toLowerCase();
    const amountWei = BigInt(tx.value.toString());
    const minAmountWei = BigInt(PAYMENT_CONFIG.minAmount);

    // 验证交易的 to 地址
    // Generate Agent 收款：用户直接转账到 PAYMENT_ADDRESS（普通钱包地址）
    // 注意：Generate Agent 不使用智能合约收款，用户是直接转账
    const toAddress = tx.to?.toLowerCase();
    const isValidRecipient = toAddress === expectedAddress;
    
    console.log('🔐 验证收款地址（用户直接转账给 Generate Agent）:');
    console.log('  - 期望地址（PAYMENT_ADDRESS）:', expectedAddress);
    console.log('  - 实际交易接收地址:', toAddress);
    console.log('  - 匹配结果:', isValidRecipient ? '✅ 匹配' : '❌ 不匹配');
    console.log('  - 环境变量 PAYMENT_ADDRESS:', process.env.PAYMENT_ADDRESS || '(未设置，使用默认值)');
    console.log('  - 说明：用户直接转账给 Generate Agent，不通过智能合约');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💰 验证支付金额:');
    console.log('  - 期望最小金额 (Wei):', PAYMENT_CONFIG.minAmount);
    console.log('  - 期望最小金额 (BNB):', ethers.formatEther(PAYMENT_CONFIG.minAmount));
    console.log('  - 实际支付金额 (Wei):', amountWei.toString());
    console.log('  - 实际支付金额 (BNB):', ethers.formatEther(amountWei.toString()));
    console.log('  - 金额是否足够:', amountWei >= minAmountWei ? '✅ 足够' : '❌ 不足');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (!isValidRecipient) {
      console.error('❌ 收款地址不匹配');
      console.error('  期望:', expectedAddress);
      console.error('  实际:', toAddress);
      return { valid: false, error: `收款地址不匹配（期望: ${expectedAddress}, 实际: ${toAddress}）` };
    }

    if (amountWei < minAmountWei) {
      console.error('❌ 交易金额不足');
      console.error('  期望 >=', ethers.formatEther(PAYMENT_CONFIG.minAmount), 'BNB');
      console.error('  实际:', ethers.formatEther(tx.value.toString()), 'BNB');
      return { valid: false, error: `交易金额不足（期望 >= ${ethers.formatEther(PAYMENT_CONFIG.minAmount)} BNB, 实际 ${ethers.formatEther(tx.value.toString())} BNB）` };
    }

    // 9. 验证交易是否成功
    if (receipt.status !== 1) {
      console.error('❌ 交易失败（状态码:', receipt.status, ')');
      return { valid: false, error: '交易失败' };
    }

    // 10. 返回用户地址（用于后续给用户发放 SBT）
    console.log('✅ 支付验证成功');
    console.log('  - 用户地址:', tx.from);
    console.log('═══════════════════════════════════════════════════════════');
    return { valid: true, userAddress: tx.from };
  } catch (error) {
    console.error('═══════════════════════════════════════════════════════════');
    console.error('❌ 支付验证错误:');
    console.error('  错误类型:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('  错误消息:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('  错误堆栈:', error.stack);
    }
    console.error('═══════════════════════════════════════════════════════════');
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

// 从请求头中获取正确的域名（支持 Vercel）
function getBaseUrl(request: NextRequest): string {
  // 1. 优先使用生产环境 URL（避免预览部署 URL 的身份验证问题）
  // 检查是否是预览部署 URL（包含随机字符串）
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = request.headers.get('host');
  
  // 如果是预览部署 URL（包含随机字符串），使用生产环境 URL
  const isPreviewDeployment = (forwardedHost || host || '').match(/^[a-z0-9-]+-[a-z0-9]+-[a-z0-9]+\.vercel\.app$/);
  
  if (isPreviewDeployment) {
    console.log('检测到预览部署 URL，使用生产环境 URL');
    return 'https://pan-agent.vercel.app';
  }
  
  // 2. 使用 x-forwarded-host（Vercel 会设置）
  if (forwardedHost) {
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    return `${protocol}://${forwardedHost}`;
  }
  
  // 3. 使用 host 头
  if (host) {
    const protocol = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    return `${protocol}://${host}`;
  }
  
  // 4. 使用 Vercel 环境变量（如果可用且不是预览部署）
  if (process.env.VERCEL_URL && !process.env.VERCEL_URL.match(/^[a-z0-9-]+-[a-z0-9]+-[a-z0-9]+\.vercel\.app$/)) {
    return `https://${process.env.VERCEL_URL}`;
  }
  
  // 5. 从 request.url 中提取（备用）
  try {
    const url = new URL(request.url);
    // 如果 URL 包含 localhost，说明可能是开发环境，否则使用 URL 的 host
    if (!url.host.includes('localhost')) {
      return `${url.protocol}//${url.host}`;
    }
  } catch (e) {
    // 忽略错误
  }
  
  // 6. 最后的备用方案：使用生产环境 URL
  return 'https://pan-agent.vercel.app';
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
      console.log('═══════════════════════════════════════════════════════════');
      console.log('❌ Generate Agent 支付验证失败，返回 402 响应');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('📋 验证失败原因:', paymentValidation.error);
      console.log('📋 验证错误详情:', JSON.stringify(paymentValidation.error, null, 2));
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('💰 期望的支付信息:');
      console.log('  - 合约地址:', PAYMENT_CONFIG.address);
      console.log('  - 支付金额 (Wei):', PAYMENT_CONFIG.price);
      console.log('  - 支付金额 (BNB):', ethers.formatEther(PAYMENT_CONFIG.price));
      console.log('  - 最小金额 (Wei):', PAYMENT_CONFIG.minAmount);
      console.log('  - 最小金额 (BNB):', ethers.formatEther(PAYMENT_CONFIG.minAmount));
      console.log('  - 货币:', PAYMENT_CONFIG.currency);
      console.log('  - 网络:', PAYMENT_CONFIG.network);
      console.log('═══════════════════════════════════════════════════════════');
      
      // 构建错误信息
      const errorMessage = typeof paymentValidation.error === 'string' 
        ? paymentValidation.error 
        : JSON.stringify(paymentValidation.error);
      
      const x402Response = createX402Response({
        price: PAYMENT_CONFIG.price,
        currency: PAYMENT_CONFIG.currency,
        network: PAYMENT_CONFIG.network,
        address: PAYMENT_CONFIG.address,
        resource: resource,
        description: `Payment validation failed: ${errorMessage}`,
        mimeType: 'application/json',
        referrer: referrer, // 如果有 referrer，包含在响应中
        error: errorMessage, // 错误信息
        errorDetails: paymentValidation.error, // 错误详情
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
    let sbtRarity: string | null = null; // SBT 级别（N、R、S）
    try {
      // 获取 Prompt Agent URL（优先使用环境变量，否则使用当前请求的域名自动构建）
      // 使用 getBaseUrl 函数获取正确的域名（支持 Vercel）
      const baseUrl = getBaseUrl(request);
      // 如果 PROMPT_AGENT_URL 包含 localhost，说明是开发环境配置，在生产环境应该忽略
      const envPromptAgentUrl = process.env.PROMPT_AGENT_URL;
      const agentUrl = (envPromptAgentUrl && !envPromptAgentUrl.includes('localhost')) 
        ? envPromptAgentUrl 
        : `${baseUrl}/api/prompt-agent`;
      
      console.log('═══════════════════════════════════════════════════════════');
      console.log('🔗 Generate Agent 准备调用 Prompt Agent');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('当前请求 URL:', requestUrl.toString());
      console.log('VERCEL_URL 环境变量:', process.env.VERCEL_URL || '(未设置)');
      console.log('请求头 x-forwarded-host:', request.headers.get('x-forwarded-host') || '(未设置)');
      console.log('请求头 host:', request.headers.get('host') || '(未设置)');
      console.log('请求头 x-forwarded-proto:', request.headers.get('x-forwarded-proto') || '(未设置)');
      console.log('Base URL (计算后):', baseUrl);
      console.log('PROMPT_AGENT_URL 环境变量:', envPromptAgentUrl || '(未设置)');
      console.log('PROMPT_AGENT_URL 是否包含 localhost:', envPromptAgentUrl?.includes('localhost') ? '是（将被忽略）' : '否');
      console.log('最终使用的 Prompt Agent URL:', agentUrl);
      console.log('═══════════════════════════════════════════════════════════');
      
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
        // 检查是否是 Prompt Agent 返回的 402 错误（这是 Agent 间的支付问题，不应该返回给用户）
        if (promptResult.error?.status === 402 || (promptResult.error?.data && typeof promptResult.error.data === 'object' && promptResult.error.data.x402Version)) {
          // 这是 Prompt Agent 的 402 响应，不应该返回给用户
          // 这是 Generate Agent 内部的支付问题，应该返回 500 错误
          console.error('调用 Prompt Agent 失败: Prompt Agent 返回 402（这是 Generate Agent 内部的支付问题）');
          console.error('Prompt Agent 402 响应:', JSON.stringify(promptResult.error?.data || promptResult.error, null, 2));
          return NextResponse.json(
            {
              code: 500,
              msg: '调用 Prompt Agent 失败: 内部支付处理异常，请稍后重试',
              data: {
                error: {
                  type: 'Prompt Agent 402 Error',
                  message: 'Generate Agent 向 Prompt Agent 支付验证失败（内部支付问题）',
                  details: promptResult.error?.data || promptResult.error,
                },
              },
            },
            {
              status: 500,
              headers: getCorsHeaders(),
            }
          );
        }
        
        // 提取错误信息（包括合约支付错误）
        const errorMessage = promptResult.error?.message || promptResult.error || '调用 Prompt Agent 失败';
        const errorType = promptResult.error?.type || 'Unknown Error';
        const errorDetails = promptResult.error?.details || promptResult.error?.data || promptResult;
        
        console.error('调用 Prompt Agent 失败:', errorMessage);
        console.error('错误类型:', errorType);
        console.error('错误详情:', JSON.stringify(errorDetails, null, 2));
        
        return NextResponse.json(
          {
            code: 500,
            msg: `调用 Prompt Agent 失败: ${errorMessage}`,
            data: {
              error: {
                type: errorType,
                message: errorMessage,
                details: errorDetails,
              },
            },
          },
          {
            status: 500,
            headers: getCorsHeaders(),
          }
        );
      }

      finalPrompt = promptResult.prompt;
      sbtRarity = promptResult.rarity || null; // 获取 SBT 级别（N、R、S）
      console.log('从 Prompt Agent 获取的 prompt:', finalPrompt);
      console.log('SBT 级别:', sbtRarity || '未返回');
    } catch (error) {
      console.error('═══════════════════════════════════════════════════════════');
      console.error('❌ Generate Agent 调用 Prompt Agent 时发生异常错误:');
      console.error('═══════════════════════════════════════════════════════════');
      console.error('错误类型:', error instanceof Error ? error.constructor.name : typeof error);
      console.error('错误消息:', error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        console.error('错误堆栈:', error.stack);
      }
      console.error('═══════════════════════════════════════════════════════════');
      
      // 构建详细的错误信息（返回给客户端）
      const errorDetails = error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
        type: error.constructor.name,
      } : {
        type: typeof error,
        value: String(error),
      };
      
      return NextResponse.json(
        {
          code: 500,
          msg: `调用 Prompt Agent 失败: ${error instanceof Error ? error.message : '未知错误'}`,
          data: {
            error: errorDetails,
          },
        },
        {
          status: 500,
          headers: getCorsHeaders(),
        }
      );
    }

    // 3. 调用通义万相生成图片（异步API）
    const qwenApiKey = process.env.QWEN_API_KEY;
    if (!qwenApiKey) {
      return NextResponse.json(
        {
          code: 500,
          msg: 'QWEN_API_KEY 环境变量未配置',
          data: null,
        },
        {
          status: 500,
          headers: getCorsHeaders(),
        }
      );
    }

    // 构建完整的 prompt
    const fullPrompt = `${finalPrompt}`;
    
    console.log('调用通义万相生成图片，完整 prompt:', fullPrompt);
    console.log('使用模型: wan2.5-t2i-preview');
    console.log('分辨率: 1024*1024');
    console.log('水印: false');

    // 步骤1：创建异步任务（新加坡地域）
    const createTaskResponse = await fetch('https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis', {
      method: 'POST',
      headers: {
        'X-DashScope-Async': 'enable',
        'Authorization': `Bearer ${qwenApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'wan2.5-t2i-preview',
        input: {
          prompt: fullPrompt,
        },
        parameters: {
          size: '1024*1024',
          n: 1,
          watermark: false,
        },
      }),
    });

    if (!createTaskResponse.ok) {
      const errorText = await createTaskResponse.text();
      console.error('通义万相创建任务失败:', errorText);
      return NextResponse.json(
        {
          code: 500,
          msg: `通义万相创建任务失败: ${errorText}`,
          data: null,
        },
        {
          status: 500,
          headers: getCorsHeaders(),
        }
      );
    }

    const createTaskData = await createTaskResponse.json();
    const taskId = createTaskData.output?.task_id;
    
    if (!taskId) {
      console.error('通义万相响应格式错误（缺少 task_id）:', createTaskData);
      return NextResponse.json(
        {
          code: 500,
          msg: '通义万相响应格式错误（缺少 task_id）',
          data: null,
        },
        {
          status: 500,
          headers: getCorsHeaders(),
        }
      );
    }

    console.log('任务创建成功，task_id:', taskId);
    console.log('开始轮询任务结果...');

    // 步骤2：轮询获取任务结果
    const maxAttempts = 60; // 最多轮询60次（约2分钟）
    const pollInterval = 2000; // 每2秒轮询一次
    let imageUrl: string | null = null;
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      attempts++;

      const queryResponse = await fetch(`https://dashscope-intl.aliyuncs.com/api/v1/tasks/${taskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${qwenApiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!queryResponse.ok) {
        const errorText = await queryResponse.text();
        console.error(`查询任务结果失败（第${attempts}次）:`, errorText);
        continue;
      }

      const queryData = await queryResponse.json();
      const taskStatus = queryData.output?.task_status;

      console.log(`第${attempts}次查询，任务状态:`, taskStatus);

      if (taskStatus === 'SUCCEEDED') {
        const results = queryData.output?.results;
        if (results && results[0] && results[0].url) {
          imageUrl = results[0].url;
          console.log('图片生成成功，URL:', imageUrl);
          break;
        } else {
          console.error('任务成功但响应格式错误（缺少 url）:', queryData);
          return NextResponse.json(
            {
              code: 500,
              msg: '任务成功但响应格式错误（缺少 url）',
              data: null,
            },
            {
              status: 500,
              headers: getCorsHeaders(),
            }
          );
        }
      } else if (taskStatus === 'FAILED') {
        console.error('任务失败:', queryData);
        return NextResponse.json(
          {
            code: 500,
            msg: `图片生成任务失败: ${queryData.output?.message || '未知错误'}`,
            data: null,
          },
          {
            status: 500,
            headers: getCorsHeaders(),
          }
        );
      } else if (taskStatus === 'PENDING' || taskStatus === 'RUNNING') {
        // 继续等待
        continue;
      } else {
        console.warn('未知的任务状态:', taskStatus);
      }
    }

    if (!imageUrl) {
      console.error('任务超时，未获取到图片URL');
      return NextResponse.json(
        {
          code: 500,
          msg: '图片生成超时，请稍后重试',
          data: null,
        },
        {
          status: 500,
          headers: getCorsHeaders(),
        }
      );
    }

    // 4. 返回成功响应（包含 SBT 级别信息）
    return NextResponse.json(
      {
        code: 200,
        msg: 'success',
        data: {
          data: imageUrl,
          rarity: sbtRarity || null, // 返回 SBT 级别（N、R、S）
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

