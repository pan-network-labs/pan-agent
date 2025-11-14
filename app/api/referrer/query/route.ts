/**
 * 查询推荐信息
 * 
 * GET /api/referrer/query?type=stats&referrer=推荐码
 * GET /api/referrer/query?type=list
 * GET /api/referrer/query?type=tokens&referrer=推荐码
 * 
 * 支持的查询类型：
 * - stats: 查询指定推荐码的统计信息（推荐次数）
 * - list: 查询所有推荐码列表
 * - tokens: 查询指定推荐码关联的所有 Token ID
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
    const queryType = searchParams.get('type') || 'stats'; // 默认查询统计信息
    const referrer = searchParams.get('referrer') || '';

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

    // 根据查询类型处理不同的请求
    if (queryType === 'stats') {
      // 查询指定推荐码的统计信息
      if (!referrer) {
        return jsonResponse(
          {
            success: false,
            error: '缺少 referrer 参数',
          },
          { status: 400 }
        );
      }

      try {
        // 使用 Interface 手动编码和解码，避免 ABI 不匹配问题
        const iface = new ethers.Interface(PAYMENT_SBT_ABI as any);
        
        // 编码函数调用
        const data = iface.encodeFunctionData('getReferrerCount', [referrer]);
        
        // 调用合约
        const result = await provider.call({
          to: config.contractAddress,
          data: data,
        });
        
        // 解码返回结果
        const decoded = iface.decodeFunctionResult('getReferrerCount', result);
        const count = decoded[0].toString();

        console.log(`推荐码 ${referrer} 的推荐次数: ${count}`);

        return jsonResponse({
          success: true,
          data: {
            referrer: referrer,
            count: count,
          },
        });
      } catch (error: any) {
        console.error('查询推荐码统计失败:', error);
        return jsonResponse(
          {
            success: false,
            error: `查询推荐码统计失败: ${error?.message || '未知错误'}`,
          },
          { status: 500 }
        );
      }
    } else if (queryType === 'list') {
      // 查询所有推荐码列表和统计
      try {
        const iface = new ethers.Interface(PAYMENT_SBT_ABI as any);
        
        // 调用 getReferrerStats 获取所有推荐码及其统计
        const data = iface.encodeFunctionData('getReferrerStats', []);
        const result = await provider.call({
          to: config.contractAddress,
          data: data,
        });
        
        // 解码返回结果
        const decoded = iface.decodeFunctionResult('getReferrerStats', result);
        const referrers = decoded[0] as string[];
        const counts = decoded[1] as bigint[];

        // 转换为字符串数组
        const referrerList = referrers.map((ref, index) => ({
          referrer: ref,
          count: counts[index].toString(),
        }));

        console.log(`查询到 ${referrerList.length} 个推荐码`);

        return jsonResponse({
          success: true,
          data: {
            total: referrerList.length,
            referrers: referrerList,
          },
        });
      } catch (error: any) {
        console.error('查询推荐码列表失败:', error);
        return jsonResponse(
          {
            success: false,
            error: `查询推荐码列表失败: ${error?.message || '未知错误'}`,
          },
          { status: 500 }
        );
      }
    } else if (queryType === 'tokens') {
      // 查询指定推荐码关联的所有 Token ID
      if (!referrer) {
        return jsonResponse(
          {
            success: false,
            error: '缺少 referrer 参数',
          },
          { status: 400 }
        );
      }

      try {
        const iface = new ethers.Interface(PAYMENT_SBT_ABI as any);
        
        // 调用 getTokensByReferrer 获取关联的 Token ID
        const data = iface.encodeFunctionData('getTokensByReferrer', [referrer]);
        const result = await provider.call({
          to: config.contractAddress,
          data: data,
        });
        
        // 解码返回结果
        const decoded = iface.decodeFunctionResult('getTokensByReferrer', result);
        const tokenIds = decoded[0] as bigint[];

        // 转换为字符串数组
        const tokenIdList = tokenIds.map(id => id.toString());

        console.log(`推荐码 ${referrer} 关联了 ${tokenIdList.length} 个 Token`);

        return jsonResponse({
          success: true,
          data: {
            referrer: referrer,
            tokenCount: tokenIdList.length,
            tokenIds: tokenIdList,
          },
        });
      } catch (error: any) {
        console.error('查询推荐码关联 Token 失败:', error);
        return jsonResponse(
          {
            success: false,
            error: `查询推荐码关联 Token 失败: ${error?.message || '未知错误'}`,
          },
          { status: 500 }
        );
      }
    } else {
      return jsonResponse(
        {
          success: false,
          error: `不支持的查询类型: ${queryType}。支持的类型: stats, list, tokens`,
        },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('查询推荐信息时发生错误:', error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}

