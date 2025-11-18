/**
 * A2A Agent Task Endpoint
 * POST /api/a2a-agent/task
 * 
 * Handle HTTP format task requests
 * Use query parameter ?action=xxx to specify the capability to call
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCorsHeaders, getPaymentConfig, validatePayment, generateImage } from '../utils';
import { makeContractPayment, makeDirectPayment } from '../../payment/simple';
import { callPromptAgent } from '../agent-client';
import { preparePaymentForAgent } from '../payment-helper';
import { createX402Response } from '../../x402-utils';

// Handle preflight requests (OPTIONS)
export async function OPTIONS() {
  return NextResponse.json({}, { headers: getCorsHeaders() });
}

// POST /api/a2a-agent/task - Handle task requests (HTTP format)
export async function POST(request: NextRequest) {
  try {
    // 1. Payment validation
    const PAYMENT_CONFIG = getPaymentConfig();
    const xPaymentHeader = request.headers.get('X-PAYMENT');
    
    // Get current request URL as resource
    const requestUrl = new URL(request.url);
    const resource = requestUrl.toString();
    
    // Get action (capability name) and referrer (referrer address) from query parameters
    const action = requestUrl.searchParams.get('action') || 'generate_image';
    const referrer = requestUrl.searchParams.get('referrer') || undefined;
    
    if (!xPaymentHeader) {
      // Use x402 standard format
      const x402Response = createX402Response({
        price: PAYMENT_CONFIG.price,
        currency: PAYMENT_CONFIG.currency,
        network: PAYMENT_CONFIG.network,
        address: PAYMENT_CONFIG.address,
        resource: resource,
        description: 'Payment required to access this agent',
        mimeType: 'application/json',
        referrer: referrer,
      });
      
      return NextResponse.json(
        x402Response,
        {
          status: 402,
          headers: getCorsHeaders(),
        }
      );
    }
    
    const paymentValidation = await validatePayment(xPaymentHeader);
    
    // Get user address (from payment transaction)
    const userAddress = paymentValidation.userAddress;
    
    if (!paymentValidation.valid) {
      // Use x402 standard format
      const x402Response = createX402Response({
        price: PAYMENT_CONFIG.price,
        currency: PAYMENT_CONFIG.currency,
        network: PAYMENT_CONFIG.network,
        address: PAYMENT_CONFIG.address,
        resource: resource,
        description: 'Payment validation failed, please retry',
        mimeType: 'application/json',
        referrer: referrer,
      });
      
      return NextResponse.json(
        x402Response,
        {
          status: 402,
          headers: getCorsHeaders(),
        }
      );
    }

    // 2. Parse HTTP request body
    const body = await request.json().catch(() => ({}));

    // 3. Handle generate_image capability
    if (action === 'generate_image') {
      const { prompt } = body;
      
      if (!prompt || typeof prompt !== 'string') {
        return NextResponse.json(
          {
            code: 400,
            msg: 'prompt parameter is required and must be a string',
            data: null,
          },
          {
            status: 400,
            headers: getCorsHeaders(),
          }
        );
      }

      // 4. Generate image
      const result = await generateImage(prompt);
      
      if (!result.success) {
        return NextResponse.json(
          {
            code: 500,
            msg: result.error || 'Image generation failed',
            data: null,
          },
          {
            status: 500,
            headers: getCorsHeaders(),
          }
        );
      }

      // 5. Return success response
      return NextResponse.json(
        {
          code: 200,
          msg: 'success',
          data: {
            imageUrl: result.imageUrl,
            prompt: prompt,
          },
        },
        {
          headers: getCorsHeaders(),
        }
      );
    }

    // 3. Handle generate_image_with_prompt capability (calls Prompt Agent)
    if (action === 'generate_image_with_prompt') {
      const { topic, style, additionalRequirements, promptAgentUrl } = body;
      
      if (!topic || typeof topic !== 'string') {
        return NextResponse.json(
          {
            code: 400,
            msg: 'topic parameter is required and must be a string',
            data: null,
          },
          {
            status: 400,
            headers: getCorsHeaders(),
          }
        );
      }

      // Get Prompt Agent URL (prioritize parameter, then environment variable, finally auto-build using current request domain)
      const requestUrl = new URL(request.url);
      const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;
      const agentUrl = promptAgentUrl || process.env.PROMPT_AGENT_URL || `${baseUrl}/api/prompt-agent`;
      
      // 4. Prepare payment for Prompt Agent (X-PAYMENT mechanism)
      // Prompt Agent is paid (0.001 BNB), needs automatic payment
      // Pass user address for SBT issuance to user
      if (!userAddress) {
        return NextResponse.json(
          {
            code: 500,
            msg: 'User address not provided, cannot issue SBT',
            data: null,
          },
          {
            status: 500,
            headers: getCorsHeaders(),
          }
        );
      }
      
      const paymentPrep = await preparePaymentForAgent(agentUrl, 'generate_prompt', userAddress, referrer);
      
      if (paymentPrep.error || !paymentPrep.xPayment) {
        return NextResponse.json(
          {
            code: 500,
            msg: paymentPrep.error || 'Unable to prepare payment for Prompt Agent',
            data: null,
          },
          {
            status: 500,
            headers: getCorsHeaders(),
          }
        );
      }
      
      // Use automatically paid X-PAYMENT
      const promptAgentPayment = paymentPrep.xPayment;
      
      // 5. Call Prompt Agent to generate prompt
      const promptResult = await callPromptAgent(
        agentUrl,
        topic,
        style,
        additionalRequirements,
        promptAgentPayment || undefined // Pass X-PAYMENT header
      );

      if (!promptResult.success) {
        return NextResponse.json(
          {
            code: 500,
            msg: promptResult.error?.message || 'Failed to call Prompt Agent',
            data: null,
          },
          {
            status: 500,
            headers: getCorsHeaders(),
          }
        );
      }

      if (!promptResult.prompt) {
        return NextResponse.json(
          {
            code: 500,
            msg: 'Prompt Agent did not return a valid prompt',
            data: null,
          },
          {
            status: 500,
            headers: getCorsHeaders(),
          }
        );
      }

      // 5. Use generated prompt to generate image
      const imageResult = await generateImage(promptResult.prompt);
      
      if (!imageResult.success) {
        return NextResponse.json(
          {
            code: 500,
            msg: imageResult.error || 'Image generation failed',
            data: null,
          },
          {
            status: 500,
            headers: getCorsHeaders(),
          }
        );
      }

      // 6. Return success response
      return NextResponse.json(
        {
          code: 200,
          msg: 'success',
          data: {
            imageUrl: imageResult.imageUrl,
            prompt: promptResult.prompt,
            topic: topic,
          },
        },
        {
          headers: getCorsHeaders(),
        }
      );
    }

    // 3. Handle make_payment capability
    if (action === 'make_payment') {
      const { recipient, amount, description = '', useContract = true } = body;
      
      if (!recipient || typeof recipient !== 'string') {
        return NextResponse.json(
          {
            code: 400,
            msg: 'recipient parameter is required and must be a string',
            data: null,
          },
          {
            status: 400,
            headers: getCorsHeaders(),
          }
        );
      }

      if (!amount || typeof amount !== 'string') {
        return NextResponse.json(
          {
            code: 400,
            msg: 'amount parameter is required and must be a string',
            data: null,
          },
          {
            status: 400,
            headers: getCorsHeaders(),
          }
        );
      }

      // 4. Execute payment
      let result;
      if (useContract) {
        // Use contract payment, pass recipient for SBT issuance, referrer for referrer statistics
        result = await makeContractPayment(amount, description, recipient, undefined, referrer || '', 'N');
      } else {
        result = await makeDirectPayment(recipient, amount);
      }
      
      if (!result.success) {
        return NextResponse.json(
          {
            code: 500,
            msg: result.error || 'Payment failed',
            data: null,
          },
          {
            status: 500,
            headers: getCorsHeaders(),
          }
        );
      }

      // 5. Return success response
      return NextResponse.json(
        {
          code: 200,
          msg: 'success',
          data: {
            txHash: result.txHash,
            recipient,
            amount,
            useContract,
          },
        },
        {
          headers: getCorsHeaders(),
        }
      );
    }

    // 6. Unknown capability
    return NextResponse.json(
      {
        code: 404,
        msg: `Action "${action}" is not supported`,
        data: null,
      },
      {
        status: 404,
        headers: getCorsHeaders(),
      }
    );
  } catch (error) {
    console.error('Error occurred while processing task:', error);
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

