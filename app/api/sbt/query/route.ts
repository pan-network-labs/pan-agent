/**
 * 查询 SBT 发放情况
 * 
 * GET /api/sbt/query?address=0x...
 * 
 * 返回指定地址拥有的 SBT 信息
 */

import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import PAYMENT_SBT_ABI from '../../../../PAYMENT_SBT_ABI.json';

// CORS响应头配置（允许所有来源）
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

// 辅助函数：为响应添加 CORS 头
function jsonResponse(data: any, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...getCorsHeaders(),
      ...(init?.headers || {}),
    },
  });
}

// 处理预检请求（OPTIONS）
export async function OPTIONS() {
  return NextResponse.json({}, { headers: getCorsHeaders() });
}

// 获取支付配置
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
    const queryType = searchParams.get('type'); // 'stats', 'list', 'detail', 或默认（全部）

    // 根据查询类型处理不同的请求
    if (queryType === 'stats') {
      // 快速统计：使用 getRarityStatsByOwner
      if (!address) {
        return jsonResponse(
          { success: false, error: '缺少 address 参数' },
          { status: 400 }
        );
      }
      if (!ethers.isAddress(address)) {
        return jsonResponse(
          { success: false, error: '无效的地址格式' },
          { status: 400 }
        );
      }
      return await getRarityStats(request, address);
    }

    if (queryType === 'list') {
      // 完整列表：使用 getSBTsByAddress
      if (!address) {
        return jsonResponse(
          { success: false, error: '缺少 address 参数' },
          { status: 400 }
        );
      }
      if (!ethers.isAddress(address)) {
        return jsonResponse(
          { success: false, error: '无效的地址格式' },
          { status: 400 }
        );
      }
      return await getSBTsList(request, address);
    }

    if (queryType === 'detail') {
      // 单个详情：使用 getPaymentInfo
      if (!tokenId) {
        return jsonResponse(
          { success: false, error: '缺少 tokenId 参数' },
          { status: 400 }
        );
      }
      return await getPaymentDetail(request, tokenId);
    }

    // 默认：兼容原有查询逻辑
    if (!address) {
      return jsonResponse(
        {
          success: false,
          error: '缺少 address 参数',
        },
        { status: 400 }
      );
    }

    // 验证地址格式
    if (!ethers.isAddress(address)) {
      return jsonResponse(
        {
          success: false,
          error: '无效的地址格式',
        },
        { status: 400 }
      );
    }

    const config = getPaymentConfig();
    if (!config.contractAddress) {
      return jsonResponse(
        {
          success: false,
          error: 'PAYMENT_CONTRACT_ADDRESS 未配置',
        },
        { status: 500 }
      );
    }

    // 创建提供者
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const contract = new ethers.Contract(config.contractAddress, PAYMENT_SBT_ABI as any, provider);

    // 1. 查询余额
    let balance: bigint;
    try {
      balance = await contract.balanceOf(address);
    } catch (error: any) {
      console.error('查询余额失败:', error);
      return jsonResponse(
        {
          success: false,
          error: `查询余额失败: ${error?.message || '未知错误'}`,
        },
        { status: 500 }
      );
    }

    const balanceNumber = Number(balance);
    console.log(`地址 ${address} 拥有 ${balanceNumber} 个 SBT`);

    // 2. 查询总供应量（在查询 token ID 之前，因为遍历方法需要用到）
    let totalSupply: bigint | null = null;
    try {
      totalSupply = await contract.totalSupply();
    } catch (error) {
      // totalSupply 可能未实现，忽略
      console.log('totalSupply 未实现或查询失败');
    }

    // 3. 查询所有 token ID
    const tokenIds: string[] = [];
    const tokenURIs: string[] = [];
    const tokenDetails: Array<{ tokenId: string; tokenURI?: string }> = [];

    if (balanceNumber > 0) {
      try {
        // 方法1: 使用 tokenOfOwnerByIndex（如果合约实现了 ERC721Enumerable）
        for (let i = 0; i < balanceNumber; i++) {
          try {
            const tokenId = await contract.tokenOfOwnerByIndex(address, i);
            const tokenIdString = tokenId.toString();
            tokenIds.push(tokenIdString);

            // 尝试获取 token URI（可能失败，如果合约没有实现）
            try {
              const tokenURI = await contract.tokenURI(tokenId);
              tokenURIs.push(tokenURI);
              tokenDetails.push({ tokenId: tokenIdString, tokenURI });
            } catch {
              // tokenURI 可能未实现或失败，忽略
              tokenDetails.push({ tokenId: tokenIdString });
            }
          } catch (error: any) {
            console.error(`查询第 ${i} 个 token 失败:`, error);
            // 继续查询下一个
          }
        }

        // 方法2: 如果 tokenOfOwnerByIndex 失败，尝试通过事件查询
        if (tokenIds.length === 0 && balanceNumber > 0) {
          try {
            // 查询 Transfer 事件（从零地址到目标地址，表示 mint）
            const filter = contract.filters.Transfer(null, address);
            const events = await contract.queryFilter(filter);
            
            for (const event of events) {
              // 类型守卫：检查是否是 EventLog 类型（有 args 属性）
              if ('args' in event && event.args && 'tokenId' in event.args) {
                const eventLog = event as ethers.EventLog;
                const tokenIdString = eventLog.args.tokenId.toString();
                if (!tokenIds.includes(tokenIdString)) {
                  tokenIds.push(tokenIdString);
                  
                  // 验证 token 是否仍属于该地址
                  try {
                    const owner = await contract.ownerOf(eventLog.args.tokenId);
                    if (owner.toLowerCase() === address.toLowerCase()) {
                      // 尝试获取 token URI
                      try {
                        const tokenURI = await contract.tokenURI(eventLog.args.tokenId);
                        tokenDetails.push({ tokenId: tokenIdString, tokenURI });
                      } catch {
                        tokenDetails.push({ tokenId: tokenIdString });
                      }
                    }
                  } catch {
                    // ownerOf 可能失败，忽略
                  }
                }
              }
            }
          } catch (error: any) {
            console.error('通过事件查询 token ID 失败:', error);
          }
        }

        // 方法3: 如果前两种方法都失败，尝试遍历所有可能的 token ID
        if (tokenIds.length === 0 && balanceNumber > 0 && totalSupply !== null) {
          try {
            const maxTokenId = Number(totalSupply);
            // 从 1 开始遍历到总供应量（通常 token ID 从 1 开始）
            for (let tokenId = 1; tokenId <= maxTokenId && tokenIds.length < balanceNumber; tokenId++) {
              try {
                const owner = await contract.ownerOf(tokenId);
                if (owner.toLowerCase() === address.toLowerCase()) {
                  const tokenIdString = tokenId.toString();
                  tokenIds.push(tokenIdString);
                  
                  // 尝试获取 token URI
                  try {
                    const tokenURI = await contract.tokenURI(tokenId);
                    tokenDetails.push({ tokenId: tokenIdString, tokenURI });
                  } catch {
                    tokenDetails.push({ tokenId: tokenIdString });
                  }
                }
              } catch {
                // ownerOf 可能失败（token 不存在），继续下一个
                continue;
              }
            }
          } catch (error: any) {
            console.error('通过遍历查询 token ID 失败:', error);
          }
        }
      } catch (error: any) {
        console.error('查询 token ID 列表失败:', error);
        // 即使查询 token ID 失败，也返回余额信息
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
    console.error('查询 SBT 时发生错误:', error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}

// 快速统计：使用 getRarityStatsByOwner
async function getRarityStats(request: NextRequest, address: string) {
  try {
    const config = getPaymentConfig();
    if (!config.contractAddress) {
      return jsonResponse(
        { success: false, error: 'PAYMENT_CONTRACT_ADDRESS 未配置' },
        { status: 500 }
      );
    }

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const contract = new ethers.Contract(config.contractAddress, PAYMENT_SBT_ABI as any, provider);

    try {
      const result = await contract.getRarityStatsByOwner(address);
      
      return jsonResponse({
        success: true,
        data: {
          address,
          commonCount: result.commonCount.toString(),
          rareCount: result.rareCount.toString(),
          totalCount: result.totalCount.toString(),
          contractAddress: config.contractAddress,
        },
      });
    } catch (error: any) {
      console.error('查询统计信息失败:', error);
      return jsonResponse(
        {
          success: false,
          error: `查询统计信息失败: ${error?.message || '未知错误'}`,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('查询统计信息时发生错误:', error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}

// 完整列表：使用 getSBTsByAddress
async function getSBTsList(request: NextRequest, address: string) {
  try {
    const config = getPaymentConfig();
    if (!config.contractAddress) {
      return jsonResponse(
        { success: false, error: 'PAYMENT_CONTRACT_ADDRESS 未配置' },
        { status: 500 }
      );
    }

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const contract = new ethers.Contract(config.contractAddress, PAYMENT_SBT_ABI as any, provider);

    try {
      const result = await contract.getSBTsByAddress(address);
      const tokenIds = result.tokenIds || result[0] || [];
      const paymentInfos = result.paymentInfos || result[1] || [];
      
      // 转换数据格式
      const formattedList = tokenIds.map((tokenId: bigint, index: number) => {
        const info = paymentInfos[index] || {};
        const amount = info.amount || BigInt(0);
        const timestamp = info.timestamp || BigInt(0);
        const timestampNum = Number(timestamp);
        const timestampDate = timestampNum > 0 ? new Date(timestampNum * 1000).toISOString() : null;
        
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
        };
      });

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
      console.error('查询 SBT 列表失败:', error);
      return jsonResponse(
        {
          success: false,
          error: `查询 SBT 列表失败: ${error?.message || '未知错误'}`,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('查询 SBT 列表时发生错误:', error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}

// 单个详情：使用 getPaymentInfo
async function getPaymentDetail(request: NextRequest, tokenId: string) {
  try {
    const config = getPaymentConfig();
    if (!config.contractAddress) {
      return jsonResponse(
        { success: false, error: 'PAYMENT_CONTRACT_ADDRESS 未配置' },
        { status: 500 }
      );
    }

    // 验证 tokenId 格式
    if (!/^\d+$/.test(tokenId)) {
      return jsonResponse(
        { success: false, error: '无效的 tokenId 格式' },
        { status: 400 }
      );
    }

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const contract = new ethers.Contract(config.contractAddress, PAYMENT_SBT_ABI as any, provider);

    try {
      const paymentInfo = await contract.getPaymentInfo(tokenId);
      
      const amount = paymentInfo.amount || BigInt(0);
      const timestamp = paymentInfo.timestamp || BigInt(0);
      const timestampNum = Number(timestamp);
      const timestampDate = timestampNum > 0 ? new Date(timestampNum * 1000).toISOString() : null;
      
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
          contractAddress: config.contractAddress,
        },
      });
    } catch (error: any) {
      console.error('查询支付详情失败:', error);
      return jsonResponse(
        {
          success: false,
          error: `查询支付详情失败: ${error?.message || '未知错误'}`,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('查询支付详情时发生错误:', error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}

