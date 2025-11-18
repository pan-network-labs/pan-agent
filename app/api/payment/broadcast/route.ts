/**
 * Transaction Broadcast Service Endpoint
 * 
 * Used to broadcast signed transactions to the blockchain network
 * This service does not require a private key, only signed transaction data
 */

import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

// CORS response headers configuration
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

// POST /api/payment/broadcast - Broadcast signed transaction
export async function POST(request: NextRequest) {
  try {
    // 1. Parse request body
    const body = await request.json();
    const { signedTransaction } = body;

    if (!signedTransaction) {
      return NextResponse.json(
        { error: 'Missing signedTransaction parameter' },
        { status: 400, headers: getCorsHeaders() }
      );
    }

    // 2. Connect to blockchain network
    const rpcUrl = process.env.PAYMENT_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/';
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // 3. Broadcast transaction
    const txResponse = await provider.broadcastTransaction(signedTransaction);
    
    console.log('Transaction broadcasted:', {
      hash: txResponse.hash,
      timestamp: new Date().toISOString(),
    });

    // 4. Wait for transaction confirmation (optional)
    // const receipt = await txResponse.wait();
    
    // 5. Return transaction hash
    return NextResponse.json(
      {
        success: true,
        transactionHash: txResponse.hash,
        // receipt: receipt, // If waiting for confirmation is needed, can return receipt
      },
      { headers: getCorsHeaders() }
    );
  } catch (error) {
    console.error('Error occurred while broadcasting transaction:', error);
    return NextResponse.json(
      {
        error: 'Failed to broadcast transaction',
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

