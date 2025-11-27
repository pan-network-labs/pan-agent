/**
 * Payment Signing Service Endpoint
 * 
 * This is an independent signing service for securely signing payment transactions
 * Private keys are stored in environment variables or more secure locations (e.g., HSM, key management services)
 * 
 * Security Recommendations:
 * 1. Use environment variables to store private keys (use key management services in production)
 * 2. Add IP whitelist
 * 3. Add request rate limiting
 * 4. Add request signature verification
 * 5. Log all signing requests
 */

import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

// CORS response headers configuration
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

// Validate request source (optional, enhance security)
function validateRequest(request: NextRequest): boolean {
  // Can add IP whitelist check
  // const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
  // return allowedIPs.includes(clientIp);
  
  // Can add API Key verification
  // const apiKey = request.headers.get('Authorization');
  // return validateApiKey(apiKey);
  
  return true; // Simplified version, production environment should add verification
}

// POST /api/payment/sign - Sign payment transaction
export async function POST(request: NextRequest) {
  try {
    // 1. Validate request
    if (!validateRequest(request)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: getCorsHeaders() }
      );
    }

    // 2. Parse request body
    const body = await request.json();
    const { to, value, data, nonce, gasPrice, gasLimit } = body;

    // 3. Validate required parameters
    if (!to || !value) {
      return NextResponse.json(
        { error: 'Missing required parameters: to, value' },
        { status: 400, headers: getCorsHeaders() }
      );
    }

    // 4. Get private key (from environment variables, production environment should use key management services)
    const privateKey = process.env.PAYMENT_PRIVATE_KEY;
    if (!privateKey) {
      console.error('PAYMENT_PRIVATE_KEY not configured');
      return NextResponse.json(
        { error: 'Signing service not configured' },
        { status: 500, headers: getCorsHeaders() }
      );
    }

    // 5. Create wallet and provider
    const rpcUrl = process.env.PAYMENT_RPC_URL || 'https://bsc-dataseed1.binance.org/';
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    // 6. Build transaction
    const tx: ethers.TransactionRequest = {
      to,
      value: ethers.parseEther(value.toString()),
      data: data || '0x',
    };

    // If nonce is provided, use it; otherwise get automatically
    if (nonce !== undefined) {
      tx.nonce = nonce;
    } else {
      tx.nonce = await provider.getTransactionCount(wallet.address);
    }

    // If gas parameters are provided, use them; otherwise estimate automatically
    if (gasPrice) {
      tx.gasPrice = ethers.parseUnits(gasPrice.toString(), 'gwei');
    }
    if (gasLimit) {
      tx.gasLimit = BigInt(gasLimit);
    }

    // 7. Sign transaction
    const signedTx = await wallet.signTransaction(tx);
    
    // 8. Log signing operation (for auditing)
    console.log('Transaction signed:', {
      from: wallet.address,
      to,
      value: value.toString(),
      nonce: tx.nonce,
      timestamp: new Date().toISOString(),
    });

    // 9. Return signed transaction
    return NextResponse.json(
      {
        success: true,
        signedTransaction: signedTx,
        from: wallet.address,
        to,
        value: value.toString(),
        nonce: tx.nonce,
      },
      { headers: getCorsHeaders() }
    );
  } catch (error) {
    console.error('Error occurred while signing transaction:', error);
    return NextResponse.json(
      {
        error: 'Failed to sign transaction',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}

// Handle preflight requests
export async function OPTIONS() {
  return NextResponse.json({}, { headers: getCorsHeaders() });
}

