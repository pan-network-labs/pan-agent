/**
 * Query SBT Issuance Status
 * 
 * GET /api/sbt/query?address=0x...
 * 
 * Returns SBT information owned by the specified address
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
    rpcUrl: process.env.PAYMENT_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/',
    contractAddress: process.env.PAYMENT_CONTRACT_ADDRESS || '',
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    const tokenId = searchParams.get('tokenId');
    const queryType = searchParams.get('type'); // 'stats', 'list', 'detail', or default (all)

    // Handle different requests based on query type
    if (queryType === 'stats') {
      // Quick statistics: use getRarityStatsByOwner
      if (!address) {
        return jsonResponse(
          { success: false, error: 'Missing address parameter' },
          { status: 400 }
        );
      }
      if (!ethers.isAddress(address)) {
        return jsonResponse(
          { success: false, error: 'Invalid address format' },
          { status: 400 }
        );
      }
      return await getRarityStats(request, address);
    }

    if (queryType === 'list') {
      // Complete list: use getSBTsByAddress
      if (!address) {
        return jsonResponse(
          { success: false, error: 'Missing address parameter' },
          { status: 400 }
        );
      }
      if (!ethers.isAddress(address)) {
        return jsonResponse(
          { success: false, error: 'Invalid address format' },
          { status: 400 }
        );
      }
      return await getSBTsList(request, address);
    }

    if (queryType === 'detail') {
      // Single detail: use getPaymentInfo
      if (!tokenId) {
        return jsonResponse(
          { success: false, error: 'Missing tokenId parameter' },
          { status: 400 }
        );
      }
      return await getPaymentDetail(request, tokenId);
    }

    // Default: compatible with original query logic
    if (!address) {
      return jsonResponse(
        {
          success: false,
          error: 'Missing address parameter',
        },
        { status: 400 }
      );
    }

    // Validate address format
    if (!ethers.isAddress(address)) {
      return jsonResponse(
        {
          success: false,
          error: 'Invalid address format',
        },
        { status: 400 }
      );
    }

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

    // 1. Query balance
    let balance: bigint;
    try {
      balance = await contract.balanceOf(address);
    } catch (error: any) {
      console.error('Failed to query balance:', error);
      return jsonResponse(
        {
          success: false,
          error: `Failed to query balance: ${error?.message || 'Unknown error'}`,
        },
        { status: 500 }
      );
    }

    const balanceNumber = Number(balance);
    console.log(`Address ${address} owns ${balanceNumber} SBTs`);

    // 2. Query total supply (before querying token IDs, as iteration method needs it)
    let totalSupply: bigint | null = null;
    try {
      totalSupply = await contract.totalSupply();
    } catch (error) {
      // totalSupply may not be implemented, ignore
      console.log('totalSupply not implemented or query failed');
    }

    // 3. Query all token IDs
    const tokenIds: string[] = [];
    const tokenURIs: string[] = [];
    const tokenDetails: Array<{ tokenId: string; tokenURI?: string }> = [];

    if (balanceNumber > 0) {
      try {
        // Method 1: Use tokenOfOwnerByIndex (if contract implements ERC721Enumerable)
        for (let i = 0; i < balanceNumber; i++) {
          try {
            const tokenId = await contract.tokenOfOwnerByIndex(address, i);
            const tokenIdString = tokenId.toString();
            tokenIds.push(tokenIdString);

            // Try to get token URI (may fail if contract doesn't implement it)
            try {
              const tokenURI = await contract.tokenURI(tokenId);
              tokenURIs.push(tokenURI);
              tokenDetails.push({ tokenId: tokenIdString, tokenURI });
            } catch {
              // tokenURI may not be implemented or failed, ignore
              tokenDetails.push({ tokenId: tokenIdString });
            }
          } catch (error: any) {
            console.error(`Failed to query token ${i}:`, error);
            // Continue to next token
          }
        }

        // Method 2: If tokenOfOwnerByIndex fails, try querying through events
        if (tokenIds.length === 0 && balanceNumber > 0) {
          try {
            // Query Transfer events (from zero address to target address, indicating mint)
            const filter = contract.filters.Transfer(null, address);
            const events = await contract.queryFilter(filter);
            
            for (const event of events) {
              // Type guard: check if it's EventLog type (has args property)
              if ('args' in event && event.args && 'tokenId' in event.args) {
                const eventLog = event as ethers.EventLog;
                const tokenIdString = eventLog.args.tokenId.toString();
                if (!tokenIds.includes(tokenIdString)) {
                  tokenIds.push(tokenIdString);
                  
                  // Verify if token still belongs to this address
                  try {
                    const owner = await contract.ownerOf(eventLog.args.tokenId);
                    if (owner.toLowerCase() === address.toLowerCase()) {
                      // Try to get token URI
                      try {
                        const tokenURI = await contract.tokenURI(eventLog.args.tokenId);
                        tokenDetails.push({ tokenId: tokenIdString, tokenURI });
                      } catch {
                        tokenDetails.push({ tokenId: tokenIdString });
                      }
                    }
                  } catch {
                    // ownerOf may fail, ignore
                  }
                }
              }
            }
          } catch (error: any) {
            console.error('Failed to query token ID through events:', error);
          }
        }

        // Method 3: If both previous methods fail, try iterating through all possible token IDs
        if (tokenIds.length === 0 && balanceNumber > 0 && totalSupply !== null) {
          try {
            const maxTokenId = Number(totalSupply);
            // Iterate from 1 to total supply (usually token IDs start from 1)
            for (let tokenId = 1; tokenId <= maxTokenId && tokenIds.length < balanceNumber; tokenId++) {
              try {
                const owner = await contract.ownerOf(tokenId);
                if (owner.toLowerCase() === address.toLowerCase()) {
                  const tokenIdString = tokenId.toString();
                  tokenIds.push(tokenIdString);
                  
                  // Try to get token URI
                  try {
                    const tokenURI = await contract.tokenURI(tokenId);
                    tokenDetails.push({ tokenId: tokenIdString, tokenURI });
                  } catch {
                    tokenDetails.push({ tokenId: tokenIdString });
                  }
                }
              } catch {
                // ownerOf may fail (token doesn't exist), continue to next
                continue;
              }
            }
          } catch (error: any) {
            console.error('Failed to query token ID through iteration:', error);
          }
        }
      } catch (error: any) {
        console.error('Failed to query token ID list:', error);
        // Even if token ID query fails, still return balance information
      }
    }

    return jsonResponse({
      success: true,
      data: {
        address,
        balance: balanceNumber,
        tokenIds,
        tokenURIs,
        tokenDetails,
        totalSupply: totalSupply ? Number(totalSupply) : null,
        contractAddress: config.contractAddress,
      },
    });
  } catch (error) {
    console.error('Error occurred while querying SBT:', error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Quick statistics: use getRarityStatsByOwner (supports N, R, S three levels)
async function getRarityStats(request: NextRequest, address: string) {
  try {
    const config = getPaymentConfig();
    if (!config.contractAddress) {
      return jsonResponse(
        { success: false, error: 'PAYMENT_CONTRACT_ADDRESS not configured' },
        { status: 500 }
      );
    }

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const contract = new ethers.Contract(config.contractAddress, PAYMENT_SBT_ABI as any, provider);

    try {
      // Directly call contract's getRarityStatsByOwner method
      // Contract method signature: getRarityStatsByOwner(address user) returns (uint256 nCount, uint256 rCount, uint256 sCount, uint256 totalCount)
      // According to ABI, return value is a named tuple, ethers.js will parse it as object or array
      const result = await contract.getRarityStatsByOwner(address);
      
      // Process return result (ethers.js v6 may return array or object, depending on ABI definition)
      let nCount: string;
      let rCount: string;
      let sCount: string;
      let totalCount: string;
      
      // Prioritize accessing by named properties (if ABI has names)
      if (result && typeof result === 'object') {
        if ('nCount' in result && 'rCount' in result && 'sCount' in result && 'totalCount' in result) {
          // Object format: { nCount, rCount, sCount, totalCount }
          nCount = result.nCount.toString();
          rCount = result.rCount.toString();
          sCount = result.sCount.toString();
          totalCount = result.totalCount.toString();
        } else if (Array.isArray(result) && result.length >= 4) {
          // Array format: [nCount, rCount, sCount, totalCount]
          nCount = result[0].toString();
          rCount = result[1].toString();
          sCount = result[2].toString();
          totalCount = result[3].toString();
        } else if (result.length !== undefined && result.length >= 4) {
          // Array-like object (ethers.js special format)
          nCount = result[0]?.toString() || '0';
          rCount = result[1]?.toString() || '0';
          sCount = result[2]?.toString() || '0';
          totalCount = result[3]?.toString() || '0';
        } else {
          throw new Error('Unable to parse contract return statistics result format');
        }
      } else {
        throw new Error('Contract return result format is incorrect');
      }
      
      console.log('✅ Successfully called contract getRarityStatsByOwner method');
      console.log('  - Original return result type:', typeof result, Array.isArray(result) ? '(array)' : '(object)');
      console.log('  - N level count:', nCount);
      console.log('  - R level count:', rCount);
      console.log('  - S level count:', sCount);
      console.log('  - Total count:', totalCount);
      
      return jsonResponse({
        success: true,
        data: {
          address,
          nCount, // N level (Normal) count
          rCount, // R level (Rare) count
          sCount, // S level (Super Rare) count
          totalCount, // Total count
          contractAddress: config.contractAddress,
        },
      });
    } catch (error: any) {
      console.error('Failed to query statistics:', error);
      return jsonResponse(
        {
          success: false,
          error: `Failed to query statistics: ${error?.message || 'Unknown error'}`,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error occurred while querying statistics:', error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Complete list: use getSBTsByAddress
async function getSBTsList(request: NextRequest, address: string) {
  try {
    const config = getPaymentConfig();
    if (!config.contractAddress) {
      return jsonResponse(
        { success: false, error: 'PAYMENT_CONTRACT_ADDRESS not configured' },
        { status: 500 }
      );
    }

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const contract = new ethers.Contract(config.contractAddress, PAYMENT_SBT_ABI as any, provider);

    try {
      const result = await contract.getSBTsByAddress(address);
      const tokenIds = result.tokenIds || result[0] || [];
      const paymentInfos = result.paymentInfos || result[1] || [];
      
      // Convert data format
      console.log('═══════════════════════════════════════════════════════════');
      console.log('🔍 [QUERY] Processing SBT list for address:', address);
      console.log('  - Token count:', tokenIds.length);
      console.log('  - PaymentInfo count:', paymentInfos.length);
      console.log('═══════════════════════════════════════════════════════════');
      
      const formattedList = tokenIds.map((tokenId: bigint, index: number) => {
        const info = paymentInfos[index] || {};
        const amount = info.amount || BigInt(0);
        const timestamp = info.timestamp || BigInt(0);
        const timestampNum = Number(timestamp);
        const timestampDate = timestampNum > 0 ? new Date(timestampNum * 1000).toISOString() : null;
        
        // Extract referrer from paymentInfo (contract returns referrer field)
        const referrer = info.referrer || '';
        
        if (index === 0) {
          console.log('📋 [QUERY] Sample paymentInfo (first item):');
          console.log('  - info type:', typeof info);
          console.log('  - info keys:', Object.keys(info || {}));
          console.log('  - info.referrer:', info?.referrer);
          console.log('  - info.referrer type:', typeof info?.referrer);
          console.log('  - Extracted referrer:', referrer || '(empty string)');
        }
        
        return {
          tokenId: tokenId.toString(),
          description: info.description || '',
          amount: amount.toString(),
          amountBNB: ethers.formatEther(amount),
          timestamp: timestamp.toString(),
          timestampDate,
          payer: info.payer || '',
          recipient: info.recipient || '',
          rarity: info.rarity !== undefined ? Number(info.rarity) : null,
          referrer: referrer, // Add referrer field from contract
        };
      });
      
      console.log('✅ [QUERY] Formatted list with referrer fields');
      console.log('  - Total items:', formattedList.length);
      console.log('  - Items with referrer:', formattedList.filter((item: any) => item.referrer && item.referrer !== '').length);
      console.log('  - Items without referrer:', formattedList.filter((item: any) => !item.referrer || item.referrer === '').length);
      console.log('═══════════════════════════════════════════════════════════');

      return jsonResponse({
        success: true,
        data: {
          address,
          count: formattedList.length,
          sbtList: formattedList,
          contractAddress: config.contractAddress,
        },
      });
    } catch (error: any) {
      console.error('Failed to query SBT list:', error);
      return jsonResponse(
        {
          success: false,
          error: `Failed to query SBT list: ${error?.message || 'Unknown error'}`,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error occurred while querying SBT list:', error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Single detail: use getPaymentInfo
async function getPaymentDetail(request: NextRequest, tokenId: string) {
  try {
    const config = getPaymentConfig();
    if (!config.contractAddress) {
      return jsonResponse(
        { success: false, error: 'PAYMENT_CONTRACT_ADDRESS not configured' },
        { status: 500 }
      );
    }

    // Validate tokenId format
    if (!/^\d+$/.test(tokenId)) {
      return jsonResponse(
        { success: false, error: 'Invalid tokenId format' },
        { status: 400 }
      );
    }

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const contract = new ethers.Contract(config.contractAddress, PAYMENT_SBT_ABI as any, provider);

    try {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('🔍 [QUERY] Querying payment info for tokenId:', tokenId);
      console.log('═══════════════════════════════════════════════════════════');
      
      const paymentInfo = await contract.getPaymentInfo(tokenId);
      
      console.log('📋 [QUERY] Raw paymentInfo from contract:');
      console.log('  - paymentInfo type:', typeof paymentInfo);
      console.log('  - paymentInfo keys:', Object.keys(paymentInfo || {}));
      console.log('  - paymentInfo.referrer:', paymentInfo?.referrer);
      console.log('  - paymentInfo.referrer type:', typeof paymentInfo?.referrer);
      console.log('  - paymentInfo.referrer === undefined:', paymentInfo?.referrer === undefined);
      console.log('  - paymentInfo.referrer === null:', paymentInfo?.referrer === null);
      console.log('  - paymentInfo.referrer === "":', paymentInfo?.referrer === '');
      console.log('═══════════════════════════════════════════════════════════');
      
      const amount = paymentInfo.amount || BigInt(0);
      const timestamp = paymentInfo.timestamp || BigInt(0);
      const timestampNum = Number(timestamp);
      const timestampDate = timestampNum > 0 ? new Date(timestampNum * 1000).toISOString() : null;
      
      // Extract referrer from paymentInfo (contract returns referrer field)
      const referrer = paymentInfo.referrer || '';
      
      console.log('✅ [QUERY] Extracted referrer from contract:', referrer || '(empty string)');
      console.log('═══════════════════════════════════════════════════════════');
      
      return jsonResponse({
        success: true,
        data: {
          tokenId,
          recipient: paymentInfo.recipient || '',
          description: paymentInfo.description || '',
          amount: amount.toString(),
          amountBNB: ethers.formatEther(amount),
          timestamp: timestamp.toString(),
          timestampDate,
          payer: paymentInfo.payer || '',
          rarity: paymentInfo.rarity !== undefined ? Number(paymentInfo.rarity) : null,
          referrer: referrer, // Add referrer field from contract
          contractAddress: config.contractAddress,
        },
      });
    } catch (error: any) {
      console.error('Failed to query payment details:', error);
      return jsonResponse(
        {
          success: false,
          error: `Failed to query payment details: ${error?.message || 'Unknown error'}`,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error occurred while querying payment details:', error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

