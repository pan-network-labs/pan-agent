/**
 * A2A Agent 共享工具函数
 */

import { ethers } from 'ethers';

// CORS响应头配置
export function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-PAYMENT',
    'Access-Control-Max-Age': '86400',
  };
}

// 获取支付验证配置（从环境变量）
export function getPaymentConfig() {
  // Generate Agent 价格从环境变量读取，环境变量应该是 Wei 格式（字符串）
  // 默认 0.02 BNB = 20000000000000000 Wei
  const priceEnv = process.env.PAYMENT_PRICE || '20000000000000000';
  const minAmountEnv = process.env.PAYMENT_MIN_AMOUNT || process.env.PAYMENT_PRICE || '20000000000000000';
  
  // 判断是 BNB 格式还是 Wei 格式（BNB 格式通常小于 1e15，Wei 格式通常大于 1e15）
  const priceWei = parseFloat(priceEnv) < 1e15 
    ? ethers.parseEther(priceEnv).toString() 
    : priceEnv;
  const minAmountWei = parseFloat(minAmountEnv) < 1e15 
    ? ethers.parseEther(minAmountEnv).toString() 
    : minAmountEnv;
  
  const config = {
    price: priceWei, // Wei 格式
    currency: process.env.PAYMENT_CURRENCY || 'BNB',
    network: process.env.PAYMENT_NETWORK || 'BSCTest',
    // Generate Agent 收款地址：0x74cc09316deab81ee874839e1da9e84ec066369c
    address: process.env.PAYMENT_ADDRESS || '0x74cc09316deab81ee874839e1da9e84ec066369c',
    minAmount: minAmountWei, // Wei 格式
    rpcUrl: process.env.PAYMENT_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/',
  };

  return config;
}

// 验证支付信息
export async function validatePayment(xPaymentHeader: string | null): Promise<{ valid: boolean; userAddress?: string; error?: any }> {
  const PAYMENT_CONFIG = getPaymentConfig();

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
    const tsHash = Buffer.from(xPaymentHeader, 'base64').toString('utf-8');
    const provider = new ethers.JsonRpcProvider(PAYMENT_CONFIG.rpcUrl);
    const tx = await provider.getTransaction(tsHash);
    
    if (!tx) {
      return { valid: false, error: '交易不存在' };
    }

    const receipt = await provider.getTransactionReceipt(tsHash);
    if (!receipt) {
      return { valid: false, error: '交易尚未确认' };
    }

    console.log('交易信息:');
    console.log('交易哈希:', tsHash);
    console.log('发送方:', tx.from);
    console.log('接收方（合约地址）:', tx.to);
    console.log('交易金额:', ethers.formatEther(tx.value), 'BNB');
    console.log('交易状态:', receipt.status === 1 ? '成功' : '失败');

    // 验证收款地址和金额（使用 Wei 格式比较）
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
      return { valid: false, error: '收款地址不匹配' };
    }

    if (amountWei < minAmountWei) {
      return { valid: false, error: '交易金额不足' };
    }

    if (receipt.status !== 1) {
      return { valid: false, error: '交易失败' };
    }

    // 返回用户地址（用于后续给用户发放 SBT）
    return { valid: true, userAddress: tx.from };
  } catch (error) {
    console.error('支付验证错误:', error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : '支付验证失败',
    };
  }
}

// 生成图片的核心函数
export async function generateImage(prompt: string): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  const apiKey = process.env.ZHIPUAI_API_KEY;
  if (!apiKey) {
    return { success: false, error: '未配置API密钥' };
  }

  try {
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

    if (!response.ok) {
      const errorData = await response.text();
      console.error('智谱AI API错误:', errorData);
      return { success: false, error: '图片生成失败' };
    }

    const data = await response.json();
    const imageUrl = data.data?.[0]?.file_url || data.data?.[0]?.url;
    
    return { success: true, imageUrl };
  } catch (error) {
    console.error('生成图片时发生错误:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : '未知错误' 
    };
  }
}

// 获取代理卡片（Agent Card）
export function getAgentCard(baseUrl: string) {
  const PAYMENT_CONFIG = getPaymentConfig();
  
  return {
    "@context": "https://a2a.plus/context.jsonld",
    "@type": "Agent",
    "name": "Image Generation Agent",
    "description": "一个基于智谱AI的图片生成代理，可以将文本提示词转换为抽象油画风格的图片",
    "version": "1.0.0",
    "protocol": "HTTP", // 调用协议
    "capabilities": [
      {
        "name": "generate_image",
        "description": "根据文本提示词生成1024x1024的抽象油画风格图片",
        "pricing": {
          "price": PAYMENT_CONFIG.price,
          "currency": PAYMENT_CONFIG.currency,
          "network": PAYMENT_CONFIG.network,
          // Generate Agent 收款地址：0x74cc09316deab81ee874839e1da9e84ec066369c
          "address": PAYMENT_CONFIG.address
        },
        "inputSchema": {
          "type": "object",
          "properties": {
            "prompt": {
              "type": "string",
              "description": "图片生成的提示词"
            }
          },
          "required": ["prompt"]
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
            "url": "/api/a2a-agent/task?action=generate_image",
            "method": "POST",
            "headers": {
              "Content-Type": "application/json",
              "X-PAYMENT": "base64_encoded_transaction_hash"
            },
            "body": {
              "prompt": "一只可爱的小猫咪"
            }
          },
          "response": {
            "code": 200,
            "msg": "success",
            "data": {
              "imageUrl": "https://example.com/image.jpg",
              "prompt": "一只可爱的小猫咪"
            }
          }
        }
      },
      {
        "name": "generate_image_with_prompt",
        "description": "根据主题自动生成提示词并生成图片（会调用 Prompt Agent）",
        "pricing": {
          "price": PAYMENT_CONFIG.price,
          "currency": PAYMENT_CONFIG.currency,
          "network": PAYMENT_CONFIG.network,
          // Generate Agent 收款地址：0x74cc09316deab81ee874839e1da9e84ec066369c
          "address": PAYMENT_CONFIG.address,
          "note": "包含 Prompt Agent 调用费用"
        },
        "inputSchema": {
          "type": "object",
          "properties": {
            "topic": {
              "type": "string",
              "description": "图片主题或内容描述"
            },
            "style": {
              "type": "string",
              "description": "艺术风格（可选，如：抽象、写实、水彩等）"
            },
            "additionalRequirements": {
              "type": "string",
              "description": "额外的要求或描述（可选）"
            },
            "promptAgentUrl": {
              "type": "string",
              "description": "Prompt Agent 的 URL（可选，默认从环境变量读取）"
            }
          },
          "required": ["topic"]
        },
        "outputSchema": {
          "type": "object",
          "properties": {
            "imageUrl": {
              "type": "string",
              "description": "生成的图片URL"
            },
            "prompt": {
              "type": "string",
              "description": "使用的提示词"
            },
            "topic": {
              "type": "string",
              "description": "原始主题"
            }
          }
        }
      },
      {
        "name": "make_payment",
        "description": "通过智能合约或直接转账进行支付",
        "pricing": {
          "price": "0",
          "currency": PAYMENT_CONFIG.currency,
          "network": PAYMENT_CONFIG.network,
          "note": "此方法用于支付，本身不收费"
        },
        "inputSchema": {
          "type": "object",
          "properties": {
            "recipient": {
              "type": "string",
              "description": "收款地址"
            },
            "amount": {
              "type": "string",
              "description": "支付金额（BNB）"
            },
            "description": {
              "type": "string",
              "description": "支付描述（可选，仅智能合约支付）"
            },
            "useContract": {
              "type": "boolean",
              "description": "是否使用智能合约支付（默认：true）"
            }
          },
          "required": ["recipient", "amount"]
        },
        "outputSchema": {
          "type": "object",
          "properties": {
            "txHash": {
              "type": "string",
              "description": "交易哈希"
            },
            "recipient": {
              "type": "string",
              "description": "收款地址"
            },
            "amount": {
              "type": "string",
              "description": "支付金额"
            }
          }
        }
      }
    ],
    "endpoints": {
      "task": `${baseUrl}/api/a2a-agent/task`,
      "agentCard": `${baseUrl}/api/a2a-agent/.well-known/agent.json`
    },
    "calling": {
      "method": "POST",
      "headers": {
        "Content-Type": "application/json",
        "X-PAYMENT": "base64_encoded_transaction_hash (必需，首次调用返回 402 获取支付信息)"
      },
      "format": "HTTP",
      "note": "使用查询参数 ?action=capabilities[].name 来指定调用的能力，请求体使用 inputSchema 结构"
    },
    "payment": {
      "required": true,
      "defaultPrice": PAYMENT_CONFIG.price,
      "currency": PAYMENT_CONFIG.currency,
      "network": PAYMENT_CONFIG.network,
      // Generate Agent 收款地址：0x74cc09316deab81ee874839e1da9e84ec066369c
      "address": PAYMENT_CONFIG.address,
      "minAmount": PAYMENT_CONFIG.minAmount,
      "pricingModel": "per_call",
      "note": "每个能力的具体价格请查看 capabilities[].pricing 字段"
    },
    "metadata": {
      "provider": "ZhipuAI",
      "model": "cogview-3-flash",
      "imageSize": "1024x1024",
      "style": "异常抽象的油画"
    }
  };
}

