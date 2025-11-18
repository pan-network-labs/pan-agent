/**
 * Prompt Agent Card Standard Endpoint
 * GET /api/prompt-agent/.well-known/agent.json
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCorsHeaders, getAgentCard } from '../../utils';

// Handle preflight requests (OPTIONS)
export async function OPTIONS() {
  return NextResponse.json({}, { headers: getCorsHeaders() });
}

// GET /api/prompt-agent/.well-known/agent.json - Return agent card (standard path)
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
    console.error('Error occurred while getting agent card:', error);
    return NextResponse.json(
      { error: 'Failed to get agent card' },
      { 
        status: 500,
        headers: getCorsHeaders()
      }
    );
  }
}

