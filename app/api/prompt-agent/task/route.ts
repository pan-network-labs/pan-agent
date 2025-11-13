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
import { getCorsHeaders, generatePrompt } from '../utils';
import { getPaymentConfig, validatePayment } from '../payment-utils';
import { createX402Response } from '../../x402-utils';

// 处理预检请求（OPTIONS）
export async function OPTIONS() {
  return NextResponse.json({}, { headers: getCorsHeaders() });
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
    const { topic, style, additionalRequirements } = body;

    // 验证必需参数
    if (!topic || typeof topic !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'topic parameter is required and must be a string',
        },
        {
          status: 400,
          headers: getCorsHeaders(),
        }
      );
    }

    // 3. 生成 prompt
    const result = await generatePrompt(topic, style, additionalRequirements);
    
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || '生成 prompt 失败',
        },
        {
          status: 500,
          headers: getCorsHeaders(),
        }
      );
    }

    // 4. 返回成功响应
    return NextResponse.json(
      {
        success: true,
        prompt: result.prompt,
        topic: topic,
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

