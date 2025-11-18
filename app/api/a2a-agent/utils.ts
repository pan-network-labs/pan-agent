/**
 * A2A Agent Shared Utility Functions
 */

import { ethers } from 'ethers';

// CORS response headers configuration
export function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-PAYMENT',
    'Access-Control-Max-Age': '86400',
  };
}

// Get payment validation configuration (from environment variables)
export function getPaymentConfig() {
  // Generate Agent price read from environment variables, should be in Wei format (string)
  // Default 0.005 BNB = 5000000000000000 Wei
  const priceEnv = process.env.PAYMENT_PRICE || '5000000000000000';
  const minAmountEnv = process.env.PAYMENT_MIN_AMOUNT || process.env.PAYMENT_PRICE || '5000000000000000';
  
  // Determine if BNB format or Wei format (BNB format usually < 1e15, Wei format usually > 1e15)
  const priceWei = parseFloat(priceEnv) < 1e15 
    ? ethers.parseEther(priceEnv).toString() 
    : priceEnv;
  const minAmountWei = parseFloat(minAmountEnv) < 1e15 
    ? ethers.parseEther(minAmountEnv).toString() 
    : minAmountEnv;
  
  // ============================================================================
  // 【Important】A2A Agent Payment Address Configuration:
  // ============================================================================
  // PAYMENT_ADDRESS: Regular wallet address (for A2A Agent)
  //   - Purpose: Address for user to pay A2A Agent (direct transfer, not through contract)
  //   - Function: Only receive transfer, do not issue SBT
  //   - Note: A2A Agent uses regular wallet address, does not use smart contract
  //   - Example: 0x74cc09316deab81ee874839e1da9e84ec066369c
  //
  // Note: A2A Agent does not use PAYMENT_CONTRACT_ADDRESS (smart contract address)
  // ============================================================================
  const paymentAddress = process.env.PAYMENT_ADDRESS || '0x74cc09316deab81ee874839e1da9e84ec066369c';
  
  // Log address used (for debugging)
  console.log(`📋 A2A Agent payment address configuration: PAYMENT_ADDRESS (regular wallet)`);
  console.log(`   Address: ${paymentAddress}`);
  
  const config = {
    price: priceWei, // Wei format
    currency: process.env.PAYMENT_CURRENCY || 'BNB',
    network: process.env.PAYMENT_NETWORK || 'BSCTest',
    address: paymentAddress,
    minAmount: minAmountWei, // Wei format
    rpcUrl: process.env.PAYMENT_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/',
  };

  return config;
}

// Validate payment information
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
      return { valid: false, error: 'Transaction does not exist' };
    }

    const receipt = await provider.getTransactionReceipt(tsHash);
    if (!receipt) {
      return { valid: false, error: 'Transaction not yet confirmed' };
    }

    console.log('Transaction information:');
    console.log('Transaction hash:', tsHash);
    console.log('Sender:', tx.from);
    console.log('Recipient (contract address):', tx.to);
    console.log('Transaction amount:', ethers.formatEther(tx.value), 'BNB');
    console.log('Transaction status:', receipt.status === 1 ? 'Success' : 'Failed');

    // Validate recipient address and amount (compare using Wei format)
    const expectedAddress = PAYMENT_CONFIG.address.toLowerCase();
    const amountWei = BigInt(tx.value.toString());
    const minAmountWei = BigInt(PAYMENT_CONFIG.minAmount);

    // Validate transaction to address (supports direct payment and smart contract payment)
    // Direct payment: to address is PAYMENT_ADDRESS
    // Smart contract payment: to address is contract address (contract directly receives payment, no longer needs recipient parameter)
    const toAddress = tx.to?.toLowerCase();
    const isValidRecipient = toAddress === expectedAddress;
    
    console.log(`Validate to address: expected ${expectedAddress}, actual ${toAddress}`);

    if (!isValidRecipient) {
      return { valid: false, error: 'Recipient address mismatch' };
    }

    if (amountWei < minAmountWei) {
      return { valid: false, error: 'Insufficient transaction amount' };
    }

    if (receipt.status !== 1) {
      return { valid: false, error: 'Transaction failed' };
    }

    // Return user address (for subsequent SBT issuance to user)
    return { valid: true, userAddress: tx.from };
  } catch (error) {
    console.error('Payment validation error:', error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Payment validation failed',
    };
  }
}

// Core function to generate image
export async function generateImage(prompt: string): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  const apiKey = process.env.ZHIPUAI_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'API key not configured' };
  }

  try {
    const response = await fetch('https://open.bigmodel.cn/api/paas/v4/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        // model: 'cogview-3-flash',
        model: 'cogview-4-250304',
        prompt: `${prompt}`,
        size: '1024x1024',
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('ZhipuAI API error:', errorData);
      return { success: false, error: 'Image generation failed' };
    }

    const data = await response.json();
    const imageUrl = data.data?.[0]?.file_url || data.data?.[0]?.url;
    
    return { success: true, imageUrl };
  } catch (error) {
    console.error('Error occurred during image generation:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// Get Agent Card
export function getAgentCard(baseUrl: string) {
  const PAYMENT_CONFIG = getPaymentConfig();
  
  return {
    "@context": "https://a2a.plus/context.jsonld",
    "@type": "Agent",
    "name": "Generate Image Agent",
    "description": "An agent that generates images based on prompts, automatically calling a Prompt Agent to get optimized prompts.",
    "version": "1.0.0",
    "capabilities": [
      {
        "name": "generate_image",
        "description": "Generates an image based on a given topic, automatically calling a Prompt Agent to get optimized prompts.",
        "pricing": {
          "price": "0.005", // Generate Agent price: 0.005 BNB
          "currency": "BNB",
          "network": "BSCTest",
          "address": process.env.PAYMENT_ADDRESS || "", // User pays Generate Agent directly
          "note": "Calling this capability requires payment of 0.005 BNB (paid directly to the agent's wallet address)"
        },
        "inputSchema": {
          "type": "object",
          "properties": {
            "topic": {
              "type": "string",
              "description": "Image topic or content description"
            }
          },
          "required": ["topic"]
        },
        "outputSchema": {
          "type": "object",
          "properties": {
            "imageUrl": {
              "type": "string",
              "description": "URL of the generated image"
            }
          }
        }
      }
    ],
    "endpoints": {
      "task": `${baseUrl}/api/a2a-agent/task`,
      "agentCard": `${baseUrl}/api/a2a-agent/.well-known/agent.json`
    },
    "payment": {
      "required": true,
      "defaultPrice": "0.005", // Generate Agent price: 0.005 BNB
      "currency": "BNB",
      "network": "BSCTest",
      "address": process.env.PAYMENT_ADDRESS || "", // User pays Generate Agent directly
      "minAmount": "0.005",
      "pricingModel": "per_call",
      "note": "Calling this Agent requires payment, specific price please refer to capabilities[].pricing field (paid directly to the agent's wallet address)"
    },
    "metadata": {
      "provider": "ZhipuAI",
      // "model": "cogview-3-flash",
      "model": "cogview-4-250304",
      "imageSize": "1024x1024",
      "style": ""
    }
  };
}

