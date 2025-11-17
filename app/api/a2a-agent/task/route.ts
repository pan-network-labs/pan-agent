/**
 * A2A Agent Task 端点
 * POST /api/a2a-agent/task
 * 
 * 处理 HTTP 格式的任务请求
 * 使用查询参数 ?action=xxx 来指定调用的能力
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCorsHeaders, getPaymentConfig, validatePayment, generateImage } from '../utils';
import { makeContractPayment, makeDirectPayment } from '../../payment/simple';
import { callPromptAgent } from '../agent-client';
import { preparePaymentForAgent } from '../payment-helper';
import { createX402Response } from '../../x402-utils';

// 处理预检请求（OPTIONS）
export async function OPTIONS() {
  return NextResponse.json({}, { headers: getCorsHeaders() });
}

// POST /api/a2a-agent/task - 处理任务请求（HTTP 格式）
export async function POST(request: NextRequest) {
  try {
    // 1. 支付验证
    const PAYMENT_CONFIG = getPaymentConfig();
    const xPaymentHeader = request.headers.get('X-PAYMENT');
    
    // 获取当前请求的 URL 作为 resource
    const requestUrl = new URL(request.url);
    const resource = requestUrl.toString();
    
    // 从查询参数中获取 action（能力名称）和 referrer（推广人地址）
    const action = requestUrl.searchParams.get('action') || 'generate_image';
    const referrer = requestUrl.searchParams.get('referrer') || undefined;
    
    if (!xPaymentHeader) {
      // 使用 x402 标准格式
      const x402Response = createX402Response({
        price: PAYMENT_CONFIG.price,
        currency: PAYMENT_CONFIG.currency,
        network: PAYMENT_CONFIG.network,
        address: PAYMENT_CONFIG.address,
        resource: resource,
        description: 'Payment required to access this agent',
        mimeType: 'application/json',
        referrer: referrer,
      });
      
      return NextResponse.json(
        x402Response,
        {
          status: 402,
          headers: getCorsHeaders(),
        }
      );
    }
    
    const paymentValidation = await validatePayment(xPaymentHeader);
    
    // 获取用户地址（从支付交易中）
    const userAddress = paymentValidation.userAddress;
    
    if (!paymentValidation.valid) {
      // 使用 x402 标准格式
      const x402Response = createX402Response({
        price: PAYMENT_CONFIG.price,
        currency: PAYMENT_CONFIG.currency,
        network: PAYMENT_CONFIG.network,
        address: PAYMENT_CONFIG.address,
        resource: resource,
        description: 'Payment validation failed, please retry',
        mimeType: 'application/json',
        referrer: referrer,
      });
      
      return NextResponse.json(
        x402Response,
        {
          status: 402,
          headers: getCorsHeaders(),
        }
      );
    }

    // 2. 解析 HTTP 请求体
    const body = await request.json().catch(() => ({}));

    // 3. 处理 generate_image 能力
    if (action === 'generate_image') {
      const { prompt } = body;
      
      if (!prompt || typeof prompt !== 'string') {
        return NextResponse.json(
          {
            code: 400,
            msg: 'prompt parameter is required and must be a string',
            data: null,
          },
          {
            status: 400,
            headers: getCorsHeaders(),
          }
        );
      }

      // 4. 生成图片
      const result = await generateImage(prompt);
      
      if (!result.success) {
        return NextResponse.json(
          {
            code: 500,
            msg: result.error || '图片生成失败',
            data: null,
          },
          {
            status: 500,
            headers: getCorsHeaders(),
          }
        );
      }

      // 5. 返回成功响应
      return NextResponse.json(
        {
          code: 200,
          msg: 'success',
          data: {
            imageUrl: result.imageUrl,
            prompt: prompt,
          },
        },
        {
          headers: getCorsHeaders(),
        }
      );
    }

    // 3. 处理 generate_image_with_prompt 能力（调用 Prompt Agent）
    if (action === 'generate_image_with_prompt') {
      const { topic, style, additionalRequirements, promptAgentUrl } = body;
      
      if (!topic || typeof topic !== 'string') {
        return NextResponse.json(
          {
            code: 400,
            msg: 'topic parameter is required and must be a string',
            data: null,
          },
          {
            status: 400,
            headers: getCorsHeaders(),
          }
        );
      }

      // 获取 Prompt Agent URL（优先使用参数，然后环境变量，最后使用当前请求的域名自动构建）
      const requestUrl = new URL(request.url);
      const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;
      const agentUrl = promptAgentUrl || process.env.PROMPT_AGENT_URL || `${baseUrl}/api/prompt-agent`;
      
      // 4. 为 Prompt Agent 准备支付（X-PAYMENT 机制）
      // Prompt Agent 是付费的（0.01 BNB），需要自动支付
      // 传入用户地址，用于给用户发放 SBT
      if (!userAddress) {
        return NextResponse.json(
          {
            code: 500,
            msg: '用户地址未提供，无法发放 SBT',
            data: null,
          },
          {
            status: 500,
            headers: getCorsHeaders(),
          }
        );
      }
      
      const paymentPrep = await preparePaymentForAgent(agentUrl, 'generate_prompt', userAddress, referrer);
      
      if (paymentPrep.error || !paymentPrep.xPayment) {
        return NextResponse.json(
          {
            code: 500,
            msg: paymentPrep.error || '无法为 Prompt Agent 准备支付',
            data: null,
          },
          {
            status: 500,
            headers: getCorsHeaders(),
          }
        );
      }
      
      // 使用自动支付的 X-PAYMENT
      const promptAgentPayment = paymentPrep.xPayment;
      
      // 5. 调用 Prompt Agent 生成 prompt
      const promptResult = await callPromptAgent(
        agentUrl,
        topic,
        style,
        additionalRequirements,
        promptAgentPayment || undefined // 传递 X-PAYMENT 头
      );

      if (!promptResult.success) {
        return NextResponse.json(
          {
            code: 500,
            msg: promptResult.error?.message || '调用 Prompt Agent 失败',
            data: null,
          },
          {
            status: 500,
            headers: getCorsHeaders(),
          }
        );
      }

      if (!promptResult.prompt) {
        return NextResponse.json(
          {
            code: 500,
            msg: 'Prompt Agent 未返回有效的 prompt',
            data: null,
          },
          {
            status: 500,
            headers: getCorsHeaders(),
          }
        );
      }

      // 5. 使用生成的 prompt 生成图片
      const imageResult = await generateImage(promptResult.prompt);
      
      if (!imageResult.success) {
        return NextResponse.json(
          {
            code: 500,
            msg: imageResult.error || '图片生成失败',
            data: null,
          },
          {
            status: 500,
            headers: getCorsHeaders(),
          }
        );
      }

      // 6. 返回成功响应
      return NextResponse.json(
        {
          code: 200,
          msg: 'success',
          data: {
            imageUrl: imageResult.imageUrl,
            prompt: promptResult.prompt,
            topic: topic,
          },
        },
        {
          headers: getCorsHeaders(),
        }
      );
    }

    // 3. 处理 make_payment 能力
    if (action === 'make_payment') {
      const { recipient, amount, description = '', useContract = true } = body;
      
      if (!recipient || typeof recipient !== 'string') {
        return NextResponse.json(
          {
            code: 400,
            msg: 'recipient parameter is required and must be a string',
            data: null,
          },
          {
            status: 400,
            headers: getCorsHeaders(),
          }
        );
      }

      if (!amount || typeof amount !== 'string') {
        return NextResponse.json(
          {
            code: 400,
            msg: 'amount parameter is required and must be a string',
            data: null,
          },
          {
            status: 400,
            headers: getCorsHeaders(),
          }
        );
      }

      // 4. 执行支付
      let result;
      if (useContract) {
        // 使用合约支付，传入 recipient 用于发放 SBT，referrer 用于统计推广人
        result = await makeContractPayment(amount, description, recipient, undefined, referrer || '', 'N');
      } else {
        result = await makeDirectPayment(recipient, amount);
      }
      
      if (!result.success) {
        return NextResponse.json(
          {
            code: 500,
            msg: result.error || '支付失败',
            data: null,
          },
          {
            status: 500,
            headers: getCorsHeaders(),
          }
        );
      }

      // 5. 返回成功响应
      return NextResponse.json(
        {
          code: 200,
          msg: 'success',
          data: {
            txHash: result.txHash,
            recipient,
            amount,
            useContract,
          },
        },
        {
          headers: getCorsHeaders(),
        }
      );
    }

    // 6. 未知能力
    return NextResponse.json(
      {
        code: 404,
        msg: `Action "${action}" is not supported`,
        data: null,
      },
      {
        status: 404,
        headers: getCorsHeaders(),
      }
    );
  } catch (error) {
    console.error('处理任务时发生错误:', error);
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

