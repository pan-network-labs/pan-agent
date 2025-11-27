/**
 * Generate Agent Card Standard Endpoint
 * GET /api/generate-agent/.well-known/agent.json
 * 
 * This is the A2A protocol recommended standard path
 */

import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

// CORS response headers configuration
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-PAYMENT',
    'Access-Control-Max-Age': '86400',
  };
}

// Get payment configuration
function getPaymentConfig() {
  // If environment variable is in BNB format (e.g., "0.005"), convert to Wei; if already in Wei format, use directly
  const priceEnv = process.env.PAYMENT_PRICE || '5000000000000000'; // Default 0.005 BNB = 5000000000000000 Wei
  const minAmountEnv = process.env.PAYMENT_MIN_AMOUNT || process.env.PAYMENT_PRICE || '5000000000000000';
  
  // Determine if it's BNB format or Wei format (BNB format is usually less than 1e15, Wei format is usually greater than 1e15)
  const priceWei = parseFloat(priceEnv) < 1e15 
    ? ethers.parseEther(priceEnv).toString() 
    : priceEnv;
  const minAmountWei = parseFloat(minAmountEnv) < 1e15 
    ? ethers.parseEther(minAmountEnv).toString() 
    : minAmountEnv;
  
  // Prioritize PAYMENT_CONTRACT_ADDRESS (contract address), if not available use PAYMENT_ADDRESS
  const contractAddress = process.env.PAYMENT_CONTRACT_ADDRESS || process.env.PAYMENT_ADDRESS || '';
  
  const config = {
    price: priceWei, // Wei format
    currency: process.env.PAYMENT_CURRENCY || 'BNB',
    network: process.env.PAYMENT_NETWORK || 'BSC',
    address: contractAddress, // Use contract address
    minAmount: minAmountWei, // Wei format
    rpcUrl: process.env.PAYMENT_RPC_URL || 'https://bsc-dataseed1.binance.org/',
  };

  return config;
}

// Get agent card (Agent Card)
function getAgentCard(baseUrl: string) {
  const PAYMENT_CONFIG = getPaymentConfig();
  
  return {
    "@context": "https://a2a.plus/context.jsonld",
    "@type": "Agent",
    "name": "Image Generation Agent",
    "description": "An image generation agent based on Tongyi Wanxiang (Qwen), automatically calls Prompt Agent to generate prompts and generate images",
    "version": "1.0.0",
    "protocol": "HTTP",
    "capabilities": [
      {
        "name": "generate_image",
        "description": "Automatically generate prompts based on topic and generate 1024x1024 abstract oil painting style images (will automatically call Prompt Agent)",
        "pricing": {
          "price": ethers.formatEther(PAYMENT_CONFIG.price), // Convert to BNB format for display
          "currency": PAYMENT_CONFIG.currency,
          "network": PAYMENT_CONFIG.network,
          "address": PAYMENT_CONFIG.address,
          "note": "Includes Prompt Agent call fee"
        },
        "inputSchema": {
          "type": "object",
          "properties": {
            "topic": {
              "type": "string",
              "description": "Image topic or content description (optional, uses default topic if not provided)"
            }
          },
          "required": []
        },
        "outputSchema": {
          "type": "object",
          "properties": {
            "imageUrl": {
              "type": "string",
              "description": "Generated image URL"
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
        "X-PAYMENT": "base64_encoded_transaction_hash (required, first call returns 402 to get payment information)"
      },
      "format": "HTTP",
      "note": "Directly call task endpoint, request body can be empty (uses default topic)"
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

// Handle preflight requests (OPTIONS)
export async function OPTIONS() {
  return NextResponse.json({}, { headers: getCorsHeaders() });
}

// GET /api/generate-agent/.well-known/agent.json - Return agent card (standard path)
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
    console.error('Error occurred while getting agent card:', error);
    return NextResponse.json(
      { error: 'Failed to get agent card' },
      { 
        status: 500,
        headers: getCorsHeaders()
      }
    );
  }
}

