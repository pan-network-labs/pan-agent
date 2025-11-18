/**
 * Prompt Agent Task Endpoint
 * POST /api/prompt-agent/task
 * 
 * HTTP format API (not JSON-RPC 2.0)
 * 
 * Request format:
 * {
 *   "topic": "string", // Required, image topic
 *   "style": "string", // Optional, art style
 *   "additionalRequirements": "string" // Optional, additional requirements
 * }
 * 
 * Response format (success):
 * {
 *   "success": true,
 *   "prompt": "string",
 *   "topic": "string"
 * }
 * 
 * Response format (failure):
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

// Handle preflight requests (OPTIONS)
export async function OPTIONS() {
  return NextResponse.json({}, { headers: getCorsHeaders() });
}

/**
 * Randomly generate SBT rarity level
 * N level: 94.75%
 * R level: 5%
 * S level: 0.25%
 */
function generateRandomRarity(): SBTRarity {
  const random = Math.random() * 100; // Random number between 0-100
  
  if (random < 0.25) {
    // S level: 0-0.25 (0.25%)
    return 'S';
  } else if (random < 5.25) {
    // R level: 0.25-5.25 (5%)
    return 'R';
  } else {
    // N level: 5.25-100 (94.75%)
    return 'N';
  }
}

// POST /api/prompt-agent/task - Handle task requests (HTTP format)
export async function POST(request: NextRequest) {
  try {
    // 1. Payment validation (X-PAYMENT mechanism)
    const PAYMENT_CONFIG = getPaymentConfig();
    const xPaymentHeader = request.headers.get('X-PAYMENT');
    
    // Get current request URL as resource
    const requestUrl = new URL(request.url);
    const resource = requestUrl.toString();
    
    // Get referrer from query parameters (referrer address)
    const referrer = requestUrl.searchParams.get('referrer') || undefined;
    
    // X-PAYMENT header is required
    if (!xPaymentHeader) {
      // Use x402 standard format (return directly, not in error.data)
      const x402Response = createX402Response({
        price: PAYMENT_CONFIG.price,
        currency: PAYMENT_CONFIG.currency,
        network: PAYMENT_CONFIG.network,
        address: PAYMENT_CONFIG.address,
        resource: resource,
        description: 'Payment required to access prompt generation service',
        mimeType: 'application/json',
        referrer: referrer, // Include referrer in response if present
      });
      
      console.log('Prompt Agent returning 402 response (contract transaction info):');
      console.log('Full x402 response:', JSON.stringify(x402Response, null, 2));
      console.log('Contract address:', PAYMENT_CONFIG.address);
      console.log('Payment amount (Wei):', PAYMENT_CONFIG.price);
      console.log('Payment amount (BNB):', (BigInt(PAYMENT_CONFIG.price) / BigInt(1e18)).toString());
      console.log('Currency:', PAYMENT_CONFIG.currency);
      console.log('Network:', PAYMENT_CONFIG.network);
      console.log('Referrer:', referrer || '(empty string)');
      console.log('Resource:', resource);
      
      return NextResponse.json(
        x402Response,
        {
          status: 402,
          headers: getCorsHeaders(),
        }
      );
    }
    
    // Validate payment
    const paymentValidation = await validatePayment(xPaymentHeader);
    
    if (!paymentValidation.valid) {
      // Use x402 standard format (return directly, not in error.data)
      const x402Response = createX402Response({
        price: PAYMENT_CONFIG.price,
        currency: PAYMENT_CONFIG.currency,
        network: PAYMENT_CONFIG.network,
        address: PAYMENT_CONFIG.address,
        resource: resource,
        description: 'Payment validation failed, please retry',
        mimeType: 'application/json',
        referrer: referrer, // Include referrer in response if present
      });
      
      console.log('Prompt Agent payment validation failed, returning 402 response (contract transaction info):');
      console.log('Full x402 response:', JSON.stringify(x402Response, null, 2));
      console.log('Contract address:', PAYMENT_CONFIG.address);
      console.log('Payment amount (Wei):', PAYMENT_CONFIG.price);
      console.log('Payment amount (BNB):', (BigInt(PAYMENT_CONFIG.price) / BigInt(1e18)).toString());
      console.log('Referrer:', referrer || '(empty string)');
      console.log('Validation error:', paymentValidation.error);
      
      return NextResponse.json(
        x402Response,
        {
          status: 402,
          headers: getCorsHeaders(),
        }
      );
    }

    // 2. Parse HTTP request body
    const body = await request.json();

    // 3. Get user address (recipient, for SBT issuance)
    // Priority:
    // 1. Get userAddress from request body (passed by Generate Agent, because the transaction in X-PAYMENT was initiated by Generate Agent)
    // 2. If not in request body, extract from X-PAYMENT transaction (user directly calling Prompt Agent)
    let userAddress: string | undefined = body.userAddress;
    
    if (!userAddress) {
      // If userAddress is not in request body, try to get it from transaction (user directly calling)
      try {
        const tsHash = Buffer.from(xPaymentHeader, 'base64').toString('utf-8');
        const provider = new ethers.JsonRpcProvider(PAYMENT_CONFIG.rpcUrl);
        const tx = await provider.getTransaction(tsHash);
        if (tx) {
          userAddress = tx.from;
          console.log('Got user address from transaction (user direct call):', userAddress);
        }
      } catch (error) {
        console.error('Failed to get user address:', error);
      }
    } else {
      console.log('Got user address from request body (inter-agent call):', userAddress);
    }

    if (!userAddress) {
      return NextResponse.json(
        {
          code: 500,
          msg: 'Unable to get user address (for SBT issuance)',
          data: null,
        },
        {
          status: 500,
          headers: getCorsHeaders(),
        }
      );
    }

    // 4. Randomly generate SBT rarity level (N: 94.75%, R: 5%, S: 0.25%)
    const rarity = generateRandomRarity();
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🎲 Randomly generating SBT rarity level');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Generated level:', rarity, `(${rarity === 'N' ? 'N (Normal)' : rarity === 'R' ? 'R (Rare)' : 'S (Super Rare)'})`);
    console.log('Probability distribution: N 94.75%, R 5%, S 0.25%');
    console.log('═══════════════════════════════════════════════════════════');

    // 5. Use PROMPT_PRIVATE_KEY to call contract and mint SBT of corresponding level
    const promptPrivateKey = process.env.PROMPT_PRIVATE_KEY;
    if (!promptPrivateKey) {
      return NextResponse.json(
        {
          code: 500,
          msg: 'PROMPT_PRIVATE_KEY not configured',
          data: null,
        },
        {
          status: 500,
          headers: getCorsHeaders(),
        }
      );
    }

    // Verify the address corresponding to PROMPT_PRIVATE_KEY
    const provider = new ethers.JsonRpcProvider(PAYMENT_CONFIG.rpcUrl);
    const promptWallet = new ethers.Wallet(promptPrivateKey, provider);
    const promptWalletAddress = promptWallet.address;
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔑 Using PROMPT_PRIVATE_KEY to call contract');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Wallet address corresponding to PROMPT_PRIVATE_KEY:', promptWalletAddress);
    console.log('⚠️  Please ensure this address is authorized as contract minter');
    console.log('═══════════════════════════════════════════════════════════');

    // Convert payment amount from Wei to BNB format
    const amountBNB = ethers.formatEther(PAYMENT_CONFIG.price);
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('💰 Calling contract to mint SBT');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Private key used: PROMPT_PRIVATE_KEY');
    console.log('Wallet address (minter):', promptWalletAddress);
    console.log('User address (recipient):', userAddress);
    console.log('SBT level:', rarity);
    console.log('Payment amount (BNB):', amountBNB);
    console.log('Contract address:', PAYMENT_CONFIG.address);
    console.log('Referrer:', referrer || '(empty string)');
    console.log('═══════════════════════════════════════════════════════════');

    // makeContractPayment will automatically read PROMPT_PRIVATE_KEY (priority) or PAYMENT_PRIVATE_KEY from environment variables
    const sbtResult = await makeContractPayment(
      amountBNB,
      `Prompt Agent Service Fee`,
      userAddress, // User address (receives SBT)
      PAYMENT_CONFIG.address, // Contract address
      referrer || '', // Referrer
      rarity // SBT level
    );

    if (!sbtResult.success) {
      console.error('═══════════════════════════════════════════════════════════');
      console.error('❌ Failed to mint SBT');
      console.error('═══════════════════════════════════════════════════════════');
      console.error('Wallet address used (minter):', promptWalletAddress);
      console.error('Error message:', sbtResult.error);
      console.error('═══════════════════════════════════════════════════════════');
      console.error('⚠️  Possible reasons:');
      console.error('  1. Wallet address is not authorized as contract minter');
      console.error('  2. Insufficient wallet balance');
      console.error('  3. Incorrect contract call parameters');
      console.error('═══════════════════════════════════════════════════════════');
      
      return NextResponse.json(
        {
          code: 500,
          msg: `Failed to mint SBT: ${sbtResult.error}`,
          data: {
            error: sbtResult.error,
            minterAddress: promptWalletAddress,
            hint: 'Please ensure the address corresponding to PROMPT_PRIVATE_KEY is authorized as contract minter',
            ...(sbtResult.errorDetails || {}), // Include authorization address info
          },
        },
        {
          status: 500,
          headers: getCorsHeaders(),
        }
      );
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ SBT minted successfully');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Wallet address used (minter):', promptWalletAddress);
    console.log('Transaction hash:', sbtResult.txHash);
    console.log('SBT level:', rarity);
    console.log('User address (recipient):', userAddress);
    console.log('═══════════════════════════════════════════════════════════');

    // 6. Read corresponding prompt from environment variable based on SBT level (use directly, no replacement)
    const promptEnvKey = rarity === 'N' ? 'PROMPT_N' : rarity === 'R' ? 'PROMPT_R' : 'PROMPT_S';
    const finalPrompt = process.env[promptEnvKey];

    if (!finalPrompt) {
      return NextResponse.json(
        {
          success: false,
          error: `${promptEnvKey} environment variable not configured`,
        },
        {
          status: 500,
          headers: getCorsHeaders(),
        }
      );
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📝 Using prompt');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Environment variable used:', promptEnvKey);
    console.log('SBT level:', rarity);
    console.log('Prompt:', finalPrompt);
    console.log('═══════════════════════════════════════════════════════════');

    // 7. Return success response
    return NextResponse.json(
      {
        code: 200,
        msg: 'success',
        data: {
          data: finalPrompt, // Return prompt from environment variable directly
          rarity: rarity, // Return generated SBT level
        },
      },
      {
        headers: getCorsHeaders(),
      }
    );
  } catch (error) {
    console.error('Error processing task:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      {
        status: 500,
        headers: getCorsHeaders(),
      }
    );
  }
}

