/**
 * Generate Agent Card 标准端点
 * GET /api/generate-agent/.well-known/agent.json
 * 
 * 这是 A2A 协议推荐的标准路径
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

// 获取支付配置
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

// 获取代理卡片（Agent Card）
function getAgentCard(baseUrl: string) {
  const PAYMENT_CONFIG = getPaymentConfig();
  
  return {
    "@context": "https://a2a.plus/context.jsonld",
    "@type": "Agent",
    "name": "Image Generation Agent",
    "description": "一个基于智谱AI的图片生成代理，可以自动调用 Prompt Agent 生成提示词并生成图片",
    "version": "1.0.0",
    "protocol": "HTTP",
    "capabilities": [
      {
        "name": "generate_image",
        "description": "根据主题自动生成提示词并生成1024x1024的抽象油画风格图片（会自动调用 Prompt Agent）",
        "pricing": {
          "price": PAYMENT_CONFIG.price,
          "currency": PAYMENT_CONFIG.currency,
          "network": PAYMENT_CONFIG.network,
          "address": PAYMENT_CONFIG.address,
          "note": "包含 Prompt Agent 调用费用"
        },
        "inputSchema": {
          "type": "object",
          "properties": {
            "topic": {
              "type": "string",
              "description": "图片主题或内容描述（可选，如果不提供则使用默认主题）"
            }
          },
          "required": []
        },
        "outputSchema": {
          "type": "object",
          "properties": {
            "imageUrl": {
              "type": "string",
              "description": "生成的图片URL"
            }
          }
        },
        "example": {
          "request": {
            "url": "/api/generate-agent/task",
            "method": "POST",
            "headers": {
              "Content-Type": "application/json",
              "X-PAYMENT": "base64_encoded_transaction_hash"
            },
            "body": {}
          },
          "response": {
            "code": 200,
            "msg": "success",
            "data": {
              "data": "https://example.com/image.jpg"
            }
          }
        }
      }
    ],
    "endpoints": {
      "task": `${baseUrl}/api/generate-agent/task`,
      "agentCard": `${baseUrl}/api/generate-agent/.well-known/agent.json`
    },
    "calling": {
      "method": "POST",
      "headers": {
        "Content-Type": "application/json",
        "X-PAYMENT": "base64_encoded_transaction_hash (必需，首次调用返回 402 获取支付信息)"
      },
      "format": "HTTP",
      "note": "直接调用 task 端点，请求体可以为空（使用默认主题）"
    },
    "payment": {
      "scheme": "x402",
      "currency": PAYMENT_CONFIG.currency,
      "network": PAYMENT_CONFIG.network,
      "address": PAYMENT_CONFIG.address
    },
    "metadata": {
      "author": "Pan Agent Team",
      "license": "MIT"
    }
  };
}

// 处理预检请求（OPTIONS）
export async function OPTIONS() {
  return NextResponse.json({}, { headers: getCorsHeaders() });
}

// GET /api/generate-agent/.well-known/agent.json - 返回代理卡片（标准路径）
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const agentCard = getAgentCard(baseUrl);
    
    return NextResponse.json(agentCard, {
      headers: {
        ...getCorsHeaders(),
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('获取代理卡片时发生错误:', error);
    return NextResponse.json(
      { error: '获取代理卡片失败' },
      { 
        status: 500,
        headers: getCorsHeaders()
      }
    );
  }
}

