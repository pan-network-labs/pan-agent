/**
 * Query Referrer Information
 * 
 * GET /api/referrer/query?type=stats&referrer=referrer_code
 * GET /api/referrer/query?type=list
 * GET /api/referrer/query?type=tokens&referrer=referrer_code
 * 
 * Supported query types:
 * - stats: Query statistics for specified referrer code (referral count)
 * - list: Query all referrer code list
 * - tokens: Query all Token IDs associated with specified referrer code
 */

import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import PAYMENT_SBT_ABI from '../../../../PAYMENT_SBT_ABI.json';

// CORS response headers configuration (allow all origins)
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

// Helper function: Add CORS headers to response
function jsonResponse(data: any, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...getCorsHeaders(),
      ...(init?.headers || {}),
    },
  });
}

// Handle preflight requests (OPTIONS)
export async function OPTIONS() {
  return NextResponse.json({}, { headers: getCorsHeaders() });
}

// Get payment configuration
function getPaymentConfig() {
  return {
    rpcUrl: process.env.PAYMENT_RPC_URL || 'https://bsc-dataseed1.binance.org/',
    contractAddress: process.env.PAYMENT_CONTRACT_ADDRESS || '',
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const queryType = searchParams.get('type') || 'stats'; // Default query statistics
    const referrer = searchParams.get('referrer') || '';

    const config = getPaymentConfig();
    if (!config.contractAddress) {
      return jsonResponse(
        {
          success: false,
          error: 'PAYMENT_CONTRACT_ADDRESS not configured',
        },
        { status: 500 }
      );
    }

    // Create provider
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const contract = new ethers.Contract(config.contractAddress, PAYMENT_SBT_ABI as any, provider);

    // Handle different requests based on query type
    if (queryType === 'stats') {
      // Query statistics for specified referrer code
      if (!referrer) {
        return jsonResponse(
          {
            success: false,
            error: 'Missing referrer parameter',
          },
          { status: 400 }
        );
      }

      try {
        // Use Interface to manually encode and decode, avoid ABI mismatch issues
        const iface = new ethers.Interface(PAYMENT_SBT_ABI as any);
        
        // Encode function call
        const data = iface.encodeFunctionData('getReferrerCount', [referrer]);
        
        // Call contract
        const result = await provider.call({
          to: config.contractAddress,
          data: data,
        });
        
        // Decode return result
        const decoded = iface.decodeFunctionResult('getReferrerCount', result);
        const count = decoded[0].toString();

        console.log(`Referrer code ${referrer} referral count: ${count}`);

        return jsonResponse({
          success: true,
          data: {
            referrer: referrer,
            count: count,
          },
        });
      } catch (error: any) {
        console.error('Failed to query referrer statistics:', error);
        return jsonResponse(
          {
            success: false,
            error: `Failed to query referrer statistics: ${error?.message || 'Unknown error'}`,
          },
          { status: 500 }
        );
      }
    } else if (queryType === 'list') {
      // Query all referrer code list and statistics
      try {
        const iface = new ethers.Interface(PAYMENT_SBT_ABI as any);
        
        // Call getReferrerStats to get all referrer codes and their statistics
        const data = iface.encodeFunctionData('getReferrerStats', []);
        const result = await provider.call({
          to: config.contractAddress,
          data: data,
        });
        
        // Decode return result
        const decoded = iface.decodeFunctionResult('getReferrerStats', result);
        const referrers = decoded[0] as string[];
        const counts = decoded[1] as bigint[];

        // Convert to string array
        const referrerList = referrers.map((ref, index) => ({
          referrer: ref,
          count: counts[index].toString(),
        }));

        console.log(`Found ${referrerList.length} referrer codes`);

        return jsonResponse({
          success: true,
          data: {
            total: referrerList.length,
            referrers: referrerList,
          },
        });
      } catch (error: any) {
        console.error('Failed to query referrer list:', error);
        return jsonResponse(
          {
            success: false,
            error: `Failed to query referrer list: ${error?.message || 'Unknown error'}`,
          },
          { status: 500 }
        );
      }
    } else if (queryType === 'tokens') {
      // Query all Token IDs associated with specified referrer code
      if (!referrer) {
        return jsonResponse(
          {
            success: false,
            error: 'Missing referrer parameter',
          },
          { status: 400 }
        );
      }

      try {
        const iface = new ethers.Interface(PAYMENT_SBT_ABI as any);
        
        // Call getTokensByReferrer to get associated Token IDs
        const data = iface.encodeFunctionData('getTokensByReferrer', [referrer]);
        const result = await provider.call({
          to: config.contractAddress,
          data: data,
        });
        
        // Decode return result
        const decoded = iface.decodeFunctionResult('getTokensByReferrer', result);
        const tokenIds = decoded[0] as bigint[];

        // Convert to string array
        const tokenIdList = tokenIds.map(id => id.toString());

        console.log(`Referrer code ${referrer} is associated with ${tokenIdList.length} Tokens`);

        return jsonResponse({
          success: true,
          data: {
            referrer: referrer,
            tokenCount: tokenIdList.length,
            tokenIds: tokenIdList,
          },
        });
      } catch (error: any) {
        console.error('Failed to query referrer associated Tokens:', error);
        return jsonResponse(
          {
            success: false,
            error: `Failed to query referrer associated Tokens: ${error?.message || 'Unknown error'}`,
          },
          { status: 500 }
        );
      }
    } else {
      return jsonResponse(
        {
          success: false,
          error: `Unsupported query type: ${queryType}. Supported types: stats, list, tokens`,
        },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Error occurred while querying referrer information:', error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

