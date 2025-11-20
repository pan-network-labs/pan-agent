/**
 * Generate Agent Task Endpoint
 * POST /api/generate-agent/task
 * 
 * Handle HTTP format task requests
 * 
 * Request parameters (JSON format):
 * {
 *   "topic": "string", // Optional, image topic (if not provided, use default topic)
 * }
 * 
 * Notes:
 * - Payment required first (X-PAYMENT mechanism), otherwise returns 402 status code
 * - Generate Agent will automatically call Prompt Agent to get prompt and automatically pay Prompt Agent (0.01 BNB)
 * - Uses Tongyi Wanxiang wan2.5-t2i-preview model to generate images
 * - Image size fixed at: 1024*1024, watermark: false
 * - Required environment variables: QWEN_API_KEY, PAYMENT_PRIVATE_KEY, PAYMENT_CONTRACT_ADDRESS
 * - Optional environment variable: PROMPT_AGENT_URL (if not set, will automatically use current request domain to build)
 */

import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { createX402Response } from '../../x402-utils';
import { callPromptAgentWithPayment } from '../../a2a-agent/agent-client';

// CORS response headers configuration (allow all origins)
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-PAYMENT',
    'Access-Control-Max-Age': '86400',
  };
}

// Get payment validation configuration (from environment variables)
// Price in environment variables should be in Wei format (string)
function getPaymentConfig() {
  // If environment variable is in BNB format (e.g., "0.005"), convert to Wei; if already in Wei format, use directly
  const priceEnv = process.env.PAYMENT_PRICE || '5000000000000000'; // Default 0.005 BNB = 5000000000000000 Wei
  const minAmountEnv = process.env.PAYMENT_MIN_AMOUNT || process.env.PAYMENT_PRICE || '5000000000000000';
  
  // Determine if BNB format or Wei format (BNB format usually < 1e15, Wei format usually > 1e15)
  const priceWei = parseFloat(priceEnv) < 1e15 
    ? ethers.parseEther(priceEnv).toString() 
    : priceEnv;
  const minAmountWei = parseFloat(minAmountEnv) < 1e15 
    ? ethers.parseEther(minAmountEnv).toString() 
    : minAmountEnv;
  
  // ============================================================================
  // 【Important】Generate Agent Payment Address Configuration:
  // ============================================================================
  // PAYMENT_ADDRESS: Regular wallet address (user pays Generate Agent)
  //   - Purpose: Address for user to directly transfer to Generate Agent (not through contract)
  //   - Function: Receive user payment, Generate Agent will automatically call Prompt Agent after receiving
  //   - Note: User payment to Generate Agent is direct transfer, not through smart contract
  //   - Example: 0x74cc09316deab81ee874839e1da9e84ec066369c
  //
  // Note: Generate Agent does not use PAYMENT_CONTRACT_ADDRESS
  //       PAYMENT_CONTRACT_ADDRESS is used for Generate Agent to pay Prompt Agent (through contract)
  // ============================================================================
  const paymentAddress = process.env.PAYMENT_ADDRESS || '0x74cc09316deab81ee874839e1da9e84ec066369c';
  
  // Log address type used (for debugging)
  console.log(`📋 Generate Agent payment address configuration: PAYMENT_ADDRESS (regular wallet)`);
  console.log(`   Purpose: Address for user to directly transfer to Generate Agent`);
  console.log(`   Address: ${paymentAddress}`);
  console.log(`   Note: Generate Agent uses PAYMENT_CONTRACT_ADDRESS (smart contract) to pay Prompt Agent`);
  
  const config = {
    price: priceWei, // Wei format
    currency: process.env.PAYMENT_CURRENCY || 'BNB',
    network: process.env.PAYMENT_NETWORK || 'BSCTest',
    address: paymentAddress, // Address for user to pay Generate Agent (regular wallet)
    minAmount: minAmountWei, // Wei format
    rpcUrl: process.env.PAYMENT_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/',
  };

  return config;
}

// Validate payment information
async function validatePayment(xPaymentHeader: string | null): Promise<{ valid: boolean; userAddress?: string; error?: any }> {
  const PAYMENT_CONFIG = getPaymentConfig();

  // 1. Check if X-PAYMENT header exists
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
    // 2. Base64 decode to get transaction hash
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔍 Generate Agent starting payment validation');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 Received X-PAYMENT header:', xPaymentHeader);
    console.log('📋 X-PAYMENT header length:', xPaymentHeader.length);
    console.log('📋 X-PAYMENT header type:', typeof xPaymentHeader);
    
    const tsHash = Buffer.from(xPaymentHeader, 'base64').toString('utf-8');
    console.log('📝 Base64 decoded transaction hash:', tsHash);
    console.log('📝 Decoded hash type:', typeof tsHash);
    console.log('📝 Decoded hash length:', tsHash.length);
    console.log('📝 Decoded hash starts with 0x:', tsHash.startsWith('0x'));
    console.log('📝 Decoded hash format valid:', /^0x[a-fA-F0-9]{64}$/.test(tsHash));
    
    // 3. Connect to BSC Testnet
    console.log('🌐 Connecting to RPC node:', PAYMENT_CONFIG.rpcUrl);
    const provider = new ethers.JsonRpcProvider(PAYMENT_CONFIG.rpcUrl);
    
    // 4. Query transaction information
    console.log('🔎 Querying transaction information...');
    console.log('🔎 Querying with hash:', tsHash);
    const tx = await provider.getTransaction(tsHash);
    if (!tx) {
      console.error('❌ Transaction does not exist:', tsHash);
      console.error('❌ Transaction hash format:', {
        hash: tsHash,
        type: typeof tsHash,
        length: tsHash.length,
        startsWith0x: tsHash.startsWith('0x'),
        isValidFormat: /^0x[a-fA-F0-9]{64}$/.test(tsHash),
      });
      console.error('❌ RPC node URL:', PAYMENT_CONFIG.rpcUrl);
      console.error('❌ Try querying this transaction hash on BSCScan to verify if it exists');
      return { valid: false, error: `Transaction does not exist: ${tsHash}. Please verify the transaction hash on BSCScan.` };
    }

    // 5. Wait for transaction confirmation and get receipt
    console.log('⏳ Waiting for transaction confirmation...');
    const receipt = await provider.getTransactionReceipt(tsHash);
    if (!receipt) {
      console.error('❌ Transaction not yet confirmed:', tsHash);
      return { valid: false, error: 'Transaction not yet confirmed' };
    }

    // 6. Print transaction information
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Transaction information:');
    console.log('  - Transaction hash:', tsHash);
    console.log('  - Sender:', tx.from);
    console.log('  - Recipient (contract address):', tx.to);
    console.log('  - Transaction amount (Wei):', tx.value.toString());
    console.log('  - Transaction amount (BNB):', ethers.formatEther(tx.value));
    console.log('  - Transaction status:', receipt.status === 1 ? '✅ Success' : '❌ Failed');
    console.log('  - Block number:', receipt.blockNumber?.toString() || 'N/A');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 7. Validate recipient address and amount (compare using Wei format)
    const expectedAddress = PAYMENT_CONFIG.address.toLowerCase();
    const amountWei = BigInt(tx.value.toString());
    const minAmountWei = BigInt(PAYMENT_CONFIG.minAmount);

    // Validate transaction to address
    // Generate Agent receives payment: user directly transfers to PAYMENT_ADDRESS (regular wallet address)
    // Note: Generate Agent does not use smart contract to receive payment, user transfers directly
    const toAddress = tx.to?.toLowerCase();
    const isValidRecipient = toAddress === expectedAddress;
    
    console.log('🔐 Validating recipient address (user direct transfer to Generate Agent):');
    console.log('  - Expected address (PAYMENT_ADDRESS):', expectedAddress);
    console.log('  - Actual transaction recipient address:', toAddress);
    console.log('  - Match result:', isValidRecipient ? '✅ Match' : '❌ Mismatch');
    console.log('  - Environment variable PAYMENT_ADDRESS:', process.env.PAYMENT_ADDRESS || '(not set, using default)');
    console.log('  - Note: User directly transfers to Generate Agent, not through smart contract');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💰 Validating payment amount:');
    console.log('  - Expected minimum amount (Wei):', PAYMENT_CONFIG.minAmount);
    console.log('  - Expected minimum amount (BNB):', ethers.formatEther(PAYMENT_CONFIG.minAmount));
    console.log('  - Actual payment amount (Wei):', amountWei.toString());
    console.log('  - Actual payment amount (BNB):', ethers.formatEther(amountWei.toString()));
    console.log('  - Is amount sufficient:', amountWei >= minAmountWei ? '✅ Sufficient' : '❌ Insufficient');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (!isValidRecipient) {
      console.error('❌ Recipient address mismatch');
      console.error('  Expected:', expectedAddress);
      console.error('  Actual:', toAddress);
      return { valid: false, error: `Recipient address mismatch (expected: ${expectedAddress}, actual: ${toAddress})` };
    }

    if (amountWei < minAmountWei) {
      console.error('❌ Insufficient transaction amount');
      console.error('  Expected >=', ethers.formatEther(PAYMENT_CONFIG.minAmount), 'BNB');
      console.error('  Actual:', ethers.formatEther(tx.value.toString()), 'BNB');
      return { valid: false, error: `Insufficient transaction amount (expected >= ${ethers.formatEther(PAYMENT_CONFIG.minAmount)} BNB, actual ${ethers.formatEther(tx.value.toString())} BNB)` };
    }

    // 9. Validate if transaction succeeded
    if (receipt.status !== 1) {
      console.error('❌ Transaction failed (status code:', receipt.status, ')');
      return { valid: false, error: 'Transaction failed' };
    }

    // 10. Return user address (for subsequent SBT issuance to user)
    console.log('✅ Payment validation successful');
    console.log('  - User address:', tx.from);
    console.log('═══════════════════════════════════════════════════════════');
    return { valid: true, userAddress: tx.from };
  } catch (error) {
    console.error('═══════════════════════════════════════════════════════════');
    console.error('❌ Payment validation error:');
    console.error('  Error type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('  Error message:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('  Error stack:', error.stack);
    }
    console.error('═══════════════════════════════════════════════════════════');
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Payment validation failed',
    };
  }
}

// Handle preflight requests (OPTIONS)
export async function OPTIONS() {
  return NextResponse.json({}, { headers: getCorsHeaders() });
}

// Get correct domain from request headers (supports Vercel)
function getBaseUrl(request: NextRequest): string {
  // 1. Prioritize production URL (avoid authentication issues with preview deployment URLs)
  // Check if it's a preview deployment URL (contains random string)
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = request.headers.get('host');
  
  // If it's a preview deployment URL (contains random string), use production URL
  const isPreviewDeployment = (forwardedHost || host || '').match(/^[a-z0-9-]+-[a-z0-9]+-[a-z0-9]+\.vercel\.app$/);
  
  if (isPreviewDeployment) {
    console.log('Detected preview deployment URL, using production URL');
    return 'https://pan-agent.vercel.app';
  }
  
  // 2. Use x-forwarded-host (Vercel will set this)
  if (forwardedHost) {
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    return `${protocol}://${forwardedHost}`;
  }
  
  // 3. Use host header
  if (host) {
    const protocol = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    return `${protocol}://${host}`;
  }
  
  // 4. Use Vercel environment variable (if available and not preview deployment)
  if (process.env.VERCEL_URL && !process.env.VERCEL_URL.match(/^[a-z0-9-]+-[a-z0-9]+-[a-z0-9]+\.vercel\.app$/)) {
    return `https://${process.env.VERCEL_URL}`;
  }
  
  // 5. Extract from request.url (fallback)
  try {
    const url = new URL(request.url);
    // If URL contains localhost, it's likely a development environment, otherwise use URL's host
    if (!url.host.includes('localhost')) {
      return `${url.protocol}//${url.host}`;
    }
  } catch (e) {
    // Ignore error
  }
  
  // 6. Final fallback: use production URL
  return 'https://pan-agent.vercel.app';
}

export async function POST(request: NextRequest) {
  try {
    // 1. Payment validation (at the beginning of function)
    const PAYMENT_CONFIG = getPaymentConfig();
    const xPaymentHeader = request.headers.get('X-PAYMENT');
    
    // Get current request URL as resource
    const requestUrl = new URL(request.url);
    const resource = requestUrl.toString();
    
    // Parse HTTP request body to get referrer (not from URL query parameters)
    let body: any = {};
    let referrer: string | undefined = undefined;
    
    try {
      // Parse JSON body (Next.js request.json() can only be called once)
      body = await request.json().catch(() => ({}));
      
      console.log('═══════════════════════════════════════════════════════════');
      console.log('🔍 Generate Agent Request Body Parsing:');
      console.log('  - Parsed body (full object):', JSON.stringify(body, null, 2));
      console.log('  - Body type:', typeof body);
      console.log('  - Body is array:', Array.isArray(body));
      console.log('  - Body keys:', Object.keys(body));
      console.log('  - Body values:', Object.values(body));
      console.log('  - body.referrer:', body.referrer);
      console.log('  - body.referrer type:', typeof body.referrer);
      console.log('  - body.ext:', body.ext);
      console.log('  - body.ext?.referrer:', body.ext?.referrer);
      console.log('  - body.ext?.referrer type:', typeof body.ext?.referrer);
      console.log('  - body.referrer === undefined:', body.referrer === undefined);
      console.log('  - body.ext?.referrer === undefined:', body.ext?.referrer === undefined);
      
      // Get referrer from request body (from client or from previous 402 response)
      // Support both formats:
      // 1. Direct format: { "referrer": "..." }
      // 2. Ext format: { "ext": { "referrer": "..." } } (for compatibility with 402 response format)
      // Important: Check if referrer exists in body (even if it's empty string, it's still a valid value)
      referrer = body.referrer !== undefined 
        ? body.referrer 
        : (body.ext?.referrer !== undefined ? body.ext.referrer : undefined);
      
      console.log('  - Extracted referrer (from body.referrer or body.ext.referrer):', referrer);
      console.log('  - Extracted referrer type:', typeof referrer);
      console.log('  - Extracted referrer === undefined:', referrer === undefined);
      console.log('  - Extracted referrer === null:', referrer === null);
      console.log('  - Extracted referrer === "":', referrer === '');
      console.log('═══════════════════════════════════════════════════════════');
    } catch (error) {
      console.error('⚠️  Failed to parse request body:', error);
      console.error('  - Error type:', error instanceof Error ? error.constructor.name : typeof error);
      console.error('  - Error message:', error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        console.error('  - Error stack:', error.stack);
      }
      body = {};
      referrer = undefined;
    }

    // If X-PAYMENT has no information, directly return 402 and payment information (x402 standard format)
    if (!xPaymentHeader) {
      const x402Response = createX402Response({
        price: PAYMENT_CONFIG.price,
        currency: PAYMENT_CONFIG.currency,
        network: PAYMENT_CONFIG.network,
        address: PAYMENT_CONFIG.address,
        resource: resource,
        description: 'Payment required to generate image',
        mimeType: 'application/json',
        referrer: referrer, // Include referrer from request body in 402 response
      });
      
      console.log('Generate Agent returning 402 response (contract transaction info):');
      console.log('Full x402 response:', JSON.stringify(x402Response, null, 2));
      console.log('Contract address:', PAYMENT_CONFIG.address);
      console.log('Payment amount (Wei):', PAYMENT_CONFIG.price);
      console.log('Payment amount (BNB):', (BigInt(PAYMENT_CONFIG.price) / BigInt(1e18)).toString());
      console.log('Currency:', PAYMENT_CONFIG.currency);
      console.log('Network:', PAYMENT_CONFIG.network);
      console.log('Referrer (from request body, included in ext.referrer):', referrer || '(empty string)');
      console.log('Resource:', resource);
      
      return NextResponse.json(
        x402Response,
        {
          status: 402,
          headers: getCorsHeaders(),
        }
      );
    }
    
    // If X-PAYMENT has information, validate payment
    const paymentValidation = await validatePayment(xPaymentHeader);
    
    // Get user address (from payment transaction)
    const userAddress = paymentValidation.userAddress;
    
    if (!paymentValidation.valid) {
      // Return 402 and payment information when validation fails (x402 standard format)
      console.log('═══════════════════════════════════════════════════════════');
      console.log('❌ Generate Agent payment validation failed, returning 402 response');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('📋 Validation failure reason:', paymentValidation.error);
      console.log('📋 Validation error details:', JSON.stringify(paymentValidation.error, null, 2));
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('💰 Expected payment information:');
      console.log('  - Contract address:', PAYMENT_CONFIG.address);
      console.log('  - Payment amount (Wei):', PAYMENT_CONFIG.price);
      console.log('  - Payment amount (BNB):', ethers.formatEther(PAYMENT_CONFIG.price));
      console.log('  - Minimum amount (Wei):', PAYMENT_CONFIG.minAmount);
      console.log('  - Minimum amount (BNB):', ethers.formatEther(PAYMENT_CONFIG.minAmount));
      console.log('  - Currency:', PAYMENT_CONFIG.currency);
      console.log('  - Network:', PAYMENT_CONFIG.network);
      console.log('═══════════════════════════════════════════════════════════');
      
      // Build error message
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
        referrer: referrer, // Include referrer in response if present
        error: errorMessage, // Error message
        errorDetails: paymentValidation.error, // Error details
      });
      
      return NextResponse.json(
        x402Response,
        {
          status: 402,
          headers: getCorsHeaders(),
        }
      );
    }

    // 2. Call Prompt Agent to get prompt (automatically handles payment flow)
    // Flow: Call first → Receive 402 → Parse payment info → Pay smart contract (pass user address as recipient) → Call again
    // Use default topic, let Prompt Agent automatically generate prompt
    let finalPrompt: string;
    let sbtRarity: string | null = null; // SBT level (N, R, S)
    try {
      // Get Prompt Agent URL (prioritize environment variable, otherwise auto-build using current request domain)
      // Use getBaseUrl function to get correct domain (supports Vercel)
      const baseUrl = getBaseUrl(request);
      // If PROMPT_AGENT_URL contains localhost, it's a development environment config, should ignore in production
      const envPromptAgentUrl = process.env.PROMPT_AGENT_URL;
      const agentUrl = (envPromptAgentUrl && !envPromptAgentUrl.includes('localhost')) 
        ? envPromptAgentUrl 
        : `${baseUrl}/api/prompt-agent`;
      
      console.log('═══════════════════════════════════════════════════════════');
      console.log('🔗 Generate Agent preparing to call Prompt Agent');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('Current request URL:', requestUrl.toString());
      console.log('VERCEL_URL environment variable:', process.env.VERCEL_URL || '(not set)');
      console.log('Request header x-forwarded-host:', request.headers.get('x-forwarded-host') || '(not set)');
      console.log('Request header host:', request.headers.get('host') || '(not set)');
      console.log('Request header x-forwarded-proto:', request.headers.get('x-forwarded-proto') || '(not set)');
      console.log('Base URL (calculated):', baseUrl);
      console.log('PROMPT_AGENT_URL environment variable:', envPromptAgentUrl || '(not set)');
      console.log('Does PROMPT_AGENT_URL contain localhost:', envPromptAgentUrl?.includes('localhost') ? 'Yes (will be ignored)' : 'No');
      console.log('Final Prompt Agent URL used:', agentUrl);
      console.log('═══════════════════════════════════════════════════════════');
      
      // Use default topic, Prompt Agent will automatically generate prompt
      const defaultTopic = 'A beautiful abstract artwork';
      
      // Call Prompt Agent (automatically handles payment flow, pass user address for SBT issuance)
      // Pass referrer from request body (from client's 402 response)
      // This referrer will be passed to Prompt Agent via 402 response, and then to contract mintNSBT/mintRSBT/mintSSBT
      
      console.log('Generate Agent calling Prompt Agent');
      console.log('Referrer from request body (from client 402 response):', referrer || '(empty string)');
      console.log('Note: This referrer will be passed to Prompt Agent via 402 response, then to contract mintNSBT/mintRSBT/mintSSBT');
      
      const promptResult = await callPromptAgentWithPayment(
        agentUrl,
        defaultTopic,
        'abstract',
        'rich in color, full of creativity',
        userAddress, // Pass user address for SBT issuance to user
        referrer || undefined // Pass referrer from request body (from client's 402 response)
      );

      if (!promptResult.success || !promptResult.prompt) {
        // Check if it's a 402 error from Prompt Agent (this is an inter-agent payment issue, should not return to user)
        if (promptResult.error?.status === 402 || (promptResult.error?.data && typeof promptResult.error.data === 'object' && promptResult.error.data.x402Version)) {
          // This is Prompt Agent's 402 response, should not return to user
          // This is Generate Agent's internal payment issue, should return 500 error
          console.error('Failed to call Prompt Agent: Prompt Agent returned 402 (this is Generate Agent internal payment issue)');
          console.error('Prompt Agent 402 response:', JSON.stringify(promptResult.error?.data || promptResult.error, null, 2));
          return NextResponse.json(
            {
              code: 500,
              msg: 'Failed to call Prompt Agent: Internal payment processing exception, please retry later',
              data: {
                error: {
                  type: 'Prompt Agent 402 Error',
                  message: 'Generate Agent payment validation to Prompt Agent failed (internal payment issue)',
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
        
        // Extract error information (including contract payment errors)
        const errorMessage = promptResult.error?.message || promptResult.error || 'Failed to call Prompt Agent';
        const errorType = promptResult.error?.type || 'Unknown Error';
        const errorDetails = promptResult.error?.details || promptResult.error?.data || promptResult;
        
        console.error('Failed to call Prompt Agent:', errorMessage);
        console.error('Error type:', errorType);
        console.error('Error details:', JSON.stringify(errorDetails, null, 2));
        
        return NextResponse.json(
          {
            code: 500,
            msg: `Failed to call Prompt Agent: ${errorMessage}`,
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
      sbtRarity = promptResult.rarity || null; // Get SBT level (N, R, S)
      console.log('Prompt obtained from Prompt Agent:', finalPrompt);
      console.log('SBT level:', sbtRarity || 'not returned');
    } catch (error) {
      console.error('═══════════════════════════════════════════════════════════');
      console.error('❌ Exception error occurred when Generate Agent called Prompt Agent:');
      console.error('═══════════════════════════════════════════════════════════');
      console.error('Error type:', error instanceof Error ? error.constructor.name : typeof error);
      console.error('Error message:', error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        console.error('Error stack:', error.stack);
      }
      console.error('═══════════════════════════════════════════════════════════');
      
      // Build detailed error information (return to client)
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
          msg: `Failed to call Prompt Agent: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

    // 3. Call Tongyi Wanxiang to generate image (async API)
    const qwenApiKey = process.env.QWEN_API_KEY;
    if (!qwenApiKey) {
      return NextResponse.json(
        {
          code: 500,
          msg: 'QWEN_API_KEY environment variable not configured',
          data: null,
        },
        {
          status: 500,
          headers: getCorsHeaders(),
        }
      );
    }

    // Build complete prompt
    const fullPrompt = `${finalPrompt}`;
    
    console.log('Calling Tongyi Wanxiang to generate image, full prompt:', fullPrompt);
    console.log('Using model: wan2.5-t2i-preview');
    console.log('Resolution: 1024*1024');
    console.log('Watermark: false');

    // Step 1: Create async task (Singapore region)
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
      console.error('Tongyi Wanxiang task creation failed:', errorText);
      return NextResponse.json(
        {
          code: 500,
          msg: `Tongyi Wanxiang task creation failed: ${errorText}`,
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
      console.error('Tongyi Wanxiang response format error (missing task_id):', createTaskData);
      return NextResponse.json(
        {
          code: 500,
          msg: 'Tongyi Wanxiang response format error (missing task_id)',
          data: null,
        },
        {
          status: 500,
          headers: getCorsHeaders(),
        }
      );
    }

    console.log('Task created successfully, task_id:', taskId);
    console.log('Starting to poll task results...');

    // Step 2: Poll to get task results
    const maxAttempts = 60; // Maximum 60 polling attempts (about 2 minutes)
    const pollInterval = 2000; // Poll every 2 seconds
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
        console.error(`Failed to query task results (attempt ${attempts}):`, errorText);
        continue;
      }

      const queryData = await queryResponse.json();
      const taskStatus = queryData.output?.task_status;

      console.log(`Query attempt ${attempts}, task status:`, taskStatus);

      if (taskStatus === 'SUCCEEDED') {
        const results = queryData.output?.results;
        if (results && results[0] && results[0].url) {
          imageUrl = results[0].url;
          console.log('Image generated successfully, URL:', imageUrl);
          break;
        } else {
          console.error('Task succeeded but response format error (missing url):', queryData);
          return NextResponse.json(
            {
              code: 500,
              msg: 'Task succeeded but response format error (missing url)',
              data: null,
            },
            {
              status: 500,
              headers: getCorsHeaders(),
            }
          );
        }
      } else if (taskStatus === 'FAILED') {
        console.error('Task failed:', queryData);
        return NextResponse.json(
          {
            code: 500,
            msg: `Image generation task failed: ${queryData.output?.message || 'Unknown error'}`,
            data: null,
          },
          {
            status: 500,
            headers: getCorsHeaders(),
          }
        );
      } else if (taskStatus === 'PENDING' || taskStatus === 'RUNNING') {
        // Continue waiting
        continue;
      } else {
        console.warn('Unknown task status:', taskStatus);
      }
    }

    if (!imageUrl) {
      console.error('Task timeout, image URL not obtained');
      return NextResponse.json(
        {
          code: 500,
          msg: 'Image generation timeout, please retry later',
          data: null,
        },
        {
          status: 500,
          headers: getCorsHeaders(),
        }
      );
    }

    // 4. Return success response (includes SBT level information)
    return NextResponse.json(
      {
        code: 200,
        msg: 'success',
        data: {
          data: imageUrl,
          rarity: sbtRarity || null, // Return SBT level (N, R, S)
        },
      },
      {
        headers: getCorsHeaders(),
      }
    );
  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json(
      {
        code: 500,
        msg: error instanceof Error ? error.message : 'Unknown error',
        data: null,
      },
      {
        status: 500,
        headers: getCorsHeaders(),
      }
    );
  }
}

