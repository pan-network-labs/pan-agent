/**
 * A2A Agent Card 标准端点
 * GET /api/a2a-agent/.well-known/agent.json
 * 
 * 这是 A2A 协议推荐的标准路径
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCorsHeaders, getAgentCard } from '../../utils';

// 处理预检请求（OPTIONS）
export async function OPTIONS() {
  return NextResponse.json({}, { headers: getCorsHeaders() });
}

// GET /api/a2a-agent/.well-known/agent.json - 返回代理卡片（标准路径）
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
    console.error('获取代理卡片时发生错误:', error);
    return NextResponse.json(
      { error: '获取代理卡片失败' },
      { 
        status: 500,
        headers: getCorsHeaders()
      }
    );
  }
}

