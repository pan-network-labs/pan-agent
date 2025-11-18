/**
 * A2A Agent Client Utilities
 * For calling other A2A Agents
 */

export interface A2AAgentCallOptions {
  agentUrl: string;
  method: string;
  params: any;
  id?: number | string;
  xPayment?: string; // X-PAYMENT request header (for payment validation)
}

/**
 * Call other A2A Agent
 */
export async function callA2AAgent(
  options: A2AAgentCallOptions
): Promise<{ success: boolean; result?: any; error?: any }> {
  try {
    const { agentUrl, method, params, id = Date.now(), xPayment } = options;

    // Build HTTP request (using query parameter ?action=method)
    const url = `${agentUrl}/task?action=${encodeURIComponent(method)}`;

    // Build request headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // If X-PAYMENT is provided, add to request headers
    if (xPayment) {
      headers['X-PAYMENT'] = xPayment;
    }

    // Call Agent's task endpoint
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(params || {}),
    });

    // Check response status and Content-Type
    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    
    let result: any;
    try {
      if (isJson) {
        result = await response.json();
      } else {
        // If not JSON, read text first (may be HTML error page)
        const text = await response.text();
        console.error('A2A Agent returned non-JSON response:');
        console.error('Response text (first 500 chars):', text.substring(0, 500));
        
        // Try to parse as JSON (Content-Type may be set incorrectly)
        try {
          result = JSON.parse(text);
        } catch (parseError) {
          // Indeed HTML or other non-JSON format
          throw new Error(`A2A Agent returned non-JSON response (status code: ${response.status}, Content-Type: ${contentType}). Endpoint may not exist or returned error page. Response content: ${text.substring(0, 200)}`);
        }
      }
    } catch (parseError) {
      console.error('Failed to parse A2A Agent response:', parseError);
      throw parseError instanceof Error ? parseError : new Error(`Failed to parse response: ${String(parseError)}`);
    }

    // Handle 402 status code (payment required)
    if (response.status === 402) {
      return {
        success: false,
        error: {
          code: 402,
          message: 'Payment Required',
          data: result, // x402 response
        },
      };
    }

    if (!response.ok) {
      return {
        success: false,
        error: {
          code: response.status,
          message: result.msg || `HTTP ${response.status}`,
          data: result,
        },
      };
    }

    // Check response format: { code: 200, msg: "success", data: {...} }
    if (result.code === 200) {
      return {
        success: true,
        result: result.data,
      };
    }

    // Error response
    return {
      success: false,
      error: {
        code: result.code || response.status,
        message: result.msg || 'Unknown error',
        data: result,
      },
    };
  } catch (error) {
    console.error('Error occurred when calling A2A Agent:', error);
    return {
      success: false,
      error: {
        code: 500,
        message: 'Internal error',
        data: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

/**
 * Get Agent Card
 * Use A2A protocol standard path: /.well-known/agent.json
 */
export async function getAgentCard(agentUrl: string): Promise<{ success: boolean; card?: any; error?: any }> {
  // Clean URL, remove trailing slashes and paths
  const baseUrl = agentUrl.replace(/\/+$/, '').replace(/\/task$/, '').replace(/\/\.well-known\/agent\.json\/?$/, '');
  
  // Use A2A protocol standard path
  const standardPath = `${baseUrl}/.well-known/agent.json`;

  try {
    const response = await fetch(standardPath, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const card = await response.json();
      
      // Validate if it's a valid Agent Card
      if (card && (card['@type'] === 'Agent' || card.name || card.capabilities)) {
        return {
          success: true,
          card,
        };
      }
    }

    // Response not successful or not a valid Agent Card
    return {
      success: false,
      error: {
        code: -32603,
        message: 'Agent Card not found',
        data: `Unable to find Agent Card, tried standard path: ${standardPath}`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: -32603,
        message: 'Agent Card not found',
        data: error instanceof Error ? error.message : `Unable to access Agent Card standard path: ${standardPath}`,
      },
    };
  }
}

/**
 * Infer Agent base URL from endpoint URL
 * Example: Infer /api/a2a-agent from /api/a2a-agent/task
 */
export function inferAgentBaseUrl(endpointUrl: string): string {
  // Infer base URL from endpoint URL
  // Example: Infer /api/a2a-agent from /api/a2a-agent/task
  return endpointUrl
    .replace(/\/+$/, '') // Remove trailing slash
    .replace(/\/task\/?$/, '') // Remove /task
    .replace(/\/\.well-known\/agent\.json\/?$/, ''); // Remove /.well-known/agent.json
}

/**
 * Intelligently discover Agent Card
 * If task endpoint is provided, will automatically infer Agent Card location
 */
export async function discoverAgentCard(
  endpointUrl: string
): Promise<{ success: boolean; card?: any; error?: any }> {
  const baseUrl = inferAgentBaseUrl(endpointUrl);
  return getAgentCard(baseUrl);
}

/**
 * Call Prompt Agent to generate prompt (automatically handles payment)
 * Flow:
 * 1. Call Prompt Agent first (without X-PAYMENT)
 * 2. If returns 402, parse x402 response to get address and amount
 * 3. Pay smart contract (pass user address as recipient for SBT issuance)
 * 4. Call Prompt Agent again with X-PAYMENT header
 * 
 * Note: Prompt Agent is now HTTP format (not JSON-RPC), directly returns x402 format
 */
export async function callPromptAgentWithPayment(
  promptAgentUrl: string,
  topic: string,
  style?: string,
  additionalRequirements?: string,
  userAddress?: string, // User address (for SBT issuance to user)
  referrer?: string // Optional: Referrer (obtained from Generate Agent's request URL)
): Promise<{ success: boolean; prompt?: string; rarity?: string; error?: any }> {
  try {
    // 1. Call Prompt Agent first (without X-PAYMENT, HTTP format)
    // If referrer is provided, add it to URL query parameters
    let requestUrl = `${promptAgentUrl}/task`;
    if (referrer) {
      requestUrl += `?referrer=${encodeURIComponent(referrer)}`;
    }
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📞 Generate Agent calling Prompt Agent');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Prompt Agent URL:', promptAgentUrl);
    console.log('Full request URL:', requestUrl);
    console.log('Referrer (passed to Prompt Agent):', referrer || '(empty string)');
    console.log('Request parameters:', { topic, style, additionalRequirements });
    console.log('═══════════════════════════════════════════════════════════');
    
    let response: Response;
    try {
      response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Do not pass X-PAYMENT, let Prompt Agent return 402
        },
        body: JSON.stringify({
          topic,
          style,
          additionalRequirements,
        }),
      });
    } catch (fetchError) {
      // fetch failed, may be network error or URL error
      console.error('═══════════════════════════════════════════════════════════');
      console.error('❌ Fetch request failed:');
      console.error('═══════════════════════════════════════════════════════════');
      console.error('Request URL:', requestUrl);
      console.error('Prompt Agent URL:', promptAgentUrl);
      console.error('Error type:', fetchError instanceof Error ? fetchError.constructor.name : typeof fetchError);
      console.error('Error message:', fetchError instanceof Error ? fetchError.message : String(fetchError));
      if (fetchError instanceof Error && fetchError.stack) {
        console.error('Error stack:', fetchError.stack);
      }
      console.error('═══════════════════════════════════════════════════════════');
      
      throw new Error(`Unable to connect to Prompt Agent (${requestUrl}): ${fetchError instanceof Error ? fetchError.message : 'fetch failed'}`);
    }

    // Check response status and Content-Type
    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    
    console.log('Prompt Agent response status:', response.status);
    console.log('Prompt Agent response Content-Type:', contentType);
    console.log('Is JSON:', isJson);
    
    let result: any;
    try {
      if (isJson) {
        result = await response.json();
      } else {
        // If not JSON, read text first (may be HTML error page)
        const text = await response.text();
        console.error('Prompt Agent returned non-JSON response:');
        console.error('Response text (first 500 chars):', text.substring(0, 500));
        
        // Try to parse as JSON (Content-Type may be set incorrectly)
        try {
          result = JSON.parse(text);
        } catch (parseError) {
          // Indeed HTML or other non-JSON format
          throw new Error(`Prompt Agent returned non-JSON response (status code: ${response.status}, Content-Type: ${contentType}). Endpoint may not exist or returned error page. Response content: ${text.substring(0, 200)}`);
        }
      }
    } catch (parseError) {
      console.error('═══════════════════════════════════════════════════════════');
      console.error('❌ Failed to parse Prompt Agent response:');
      console.error('═══════════════════════════════════════════════════════════');
      console.error('Request URL:', requestUrl);
      console.error('Response status:', response.status);
      console.error('Response Content-Type:', contentType);
      console.error('Error type:', parseError instanceof Error ? parseError.constructor.name : typeof parseError);
      console.error('Error message:', parseError instanceof Error ? parseError.message : String(parseError));
      if (parseError instanceof Error && parseError.stack) {
        console.error('Error stack:', parseError.stack);
      }
      console.error('═══════════════════════════════════════════════════════════');
      
      throw parseError instanceof Error ? parseError : new Error(`Failed to parse response: ${String(parseError)}`);
    }
    
    console.log('Prompt Agent response data:', JSON.stringify(result, null, 2));

    // 2. If successful, return directly (adapt to new response format)
    // New format: { "code": 200, "msg": "success", "data": { "data": "prompt", "rarity": "N" } }
    if (response.ok && result.code === 200 && result.msg === 'success' && result.data) {
      console.log('Prompt Agent directly returned success (may not need payment)');
      const prompt = result.data.data; // Extract prompt from new format
      const rarity = result.data.rarity; // Get SBT level
      console.log('Extracted prompt:', prompt);
      console.log('SBT level:', rarity);
      return {
        success: true,
        prompt: prompt,
        rarity: rarity, // Optional: return SBT level
      };
    }
    
    // Compatible with old format (if Prompt Agent is still using old format)
    if (response.ok && result.success && result.prompt) {
      console.log('Prompt Agent returned old format (compatibility handling)');
      return {
        success: true,
        prompt: result.prompt,
      };
    }

    // 3. Check if it's a 402 error (payment required)
    if (response.status === 402) {
      console.log('Received 402 response, need to pay Prompt Agent');
      // Parse x402 response
      // Prompt Agent's 402 response format (HTTP format, directly returns x402):
      // {
      //   "x402Version": 1,
      //   "accepts": [...]
      // }
      const x402Data = result;
      
      console.log('Prompt Agent 402 response full data:', JSON.stringify(x402Data, null, 2));
      
      if (!x402Data || !x402Data.x402Version || !x402Data.accepts || x402Data.accepts.length === 0) {
        return {
          success: false,
          error: {
            message: 'Unable to parse x402 payment information',
            data: x402Data,
          },
        };
      }

      const requirement = x402Data.accepts[0];
      const address = requirement.address || '';
      const amountWei = requirement.maxAmountRequired || '';
      // Parse referrer (from ext.referrer field)
      const referrer = requirement.ext?.referrer || '';

      console.log('Contract transaction information parsed from 402 response:');
      console.log('Full requirement:', JSON.stringify(requirement, null, 2));
      console.log('Contract address:', address);
      console.log('Payment amount (Wei):', amountWei);
      console.log('Payment amount (BNB):', amountWei ? (BigInt(amountWei) / BigInt(1e18)).toString() : 'N/A');
      console.log('Currency:', requirement.currency || 'N/A');
      console.log('Network:', requirement.network || 'N/A');
      console.log('Referrer (from ext.referrer):', referrer || '(empty string)');
      console.log('Resource:', requirement.resource || 'N/A');
      console.log('Description:', requirement.description || 'N/A');

      if (!address || !amountWei) {
        return {
          success: false,
          error: {
            message: 'Missing address or amount information in x402 response',
            data: requirement,
          },
        };
      }

      // Validate user address
      if (!userAddress) {
        return {
          success: false,
          error: {
            message: 'User address not provided, cannot issue SBT',
            data: null,
          },
        };
      }

      // 4. Pay smart contract (inter-agent payment, do not issue SBT)
      // Important: This is Generate Agent paying Prompt Agent, not user payment
      // So should not issue SBT to user, should use direct transfer to contract address
      const { makeDirectPayment } = await import('../payment/simple');
      
      // Convert Wei to BNB format (for makeDirectPayment)
      const { ethers } = await import('ethers');
      const amountBNB = ethers.formatEther(amountWei);
      
      console.log('═══════════════════════════════════════════════════════════');
      console.log('💰 Generate Agent paying Prompt Agent (inter-agent payment)');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('⚠️  This is inter-agent payment, do not issue SBT');
      console.log('Contract address:', address);
      console.log('Payment amount (BNB):', amountBNB);
      console.log('Payment amount (Wei):', amountWei);
      console.log('═══════════════════════════════════════════════════════════');
      
      console.log('Calling makeDirectPayment (direct transfer to contract address, do not issue SBT)...');
      const paymentResult = await makeDirectPayment(
        address, // Direct transfer to contract address (contract's receive() function will receive)
        amountBNB
      );
      
      console.log('Direct transfer result:', paymentResult);

      if (!paymentResult.success || !paymentResult.txHash) {
        console.error('═══════════════════════════════════════════════════════════');
        console.error('❌ Direct transfer failed:');
        console.error('═══════════════════════════════════════════════════════════');
        console.error('Error message:', paymentResult.error || 'Payment failed');
        console.error('Full result:', JSON.stringify(paymentResult, null, 2));
        console.error('═══════════════════════════════════════════════════════════');
        
        return {
          success: false,
          error: {
            message: paymentResult.error || 'Direct transfer failed',
            data: paymentResult,
            type: 'Direct Payment Error',
            details: {
              error: paymentResult.error,
              txHash: paymentResult.txHash || null,
            },
          },
        };
      }

      // 5. Wait for transaction confirmation
      const provider = new ethers.JsonRpcProvider(
        process.env.PAYMENT_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/'
      );
      
      let receipt = null;
      let attempts = 0;
      const maxAttempts = 30; // Maximum 30 attempts (about 60 seconds)
      
      while (!receipt && attempts < maxAttempts) {
        receipt = await provider.getTransactionReceipt(paymentResult.txHash);
        if (!receipt) {
          await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
          attempts++;
        }
      }

      if (!receipt) {
        return {
          success: false,
          error: {
            message: 'Payment transaction confirmation timeout',
            data: { txHash: paymentResult.txHash },
          },
        };
      }

      // 6. Encode transaction hash as Base64 (for X-PAYMENT header)
      const xPayment = Buffer.from(paymentResult.txHash, 'utf-8').toString('base64');

      // 7. Call Prompt Agent again with X-PAYMENT header (HTTP format)
      // Important: Pass userAddress in request body, because the transaction in X-PAYMENT was initiated by Generate Agent,
      // so tx.from is Generate Agent's address, not user's address
      const secondRequestUrl = `${promptAgentUrl}/task`;
      console.log('═══════════════════════════════════════════════════════════');
      console.log('📞 Generate Agent second call to Prompt Agent (with X-PAYMENT)');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('Request URL:', secondRequestUrl);
      console.log('X-PAYMENT (Base64):', xPayment);
      console.log('Transaction hash:', Buffer.from(xPayment, 'base64').toString('utf-8'));
      console.log('User address (passed in request body):', userAddress);
      console.log('═══════════════════════════════════════════════════════════');
      
      let secondResponse: Response;
      try {
        secondResponse = await fetch(secondRequestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-PAYMENT': xPayment, // Pass payment information
          },
          body: JSON.stringify({
            topic,
            style,
            additionalRequirements,
            userAddress, // Important: Pass user address, because the transaction in X-PAYMENT was initiated by Generate Agent
          }),
        });
      } catch (fetchError) {
        // fetch failed, may be network error or URL error
        console.error('═══════════════════════════════════════════════════════════');
        console.error('❌ Second fetch request failed:');
        console.error('═══════════════════════════════════════════════════════════');
        console.error('Request URL:', secondRequestUrl);
        console.error('Prompt Agent URL:', promptAgentUrl);
        console.error('Error type:', fetchError instanceof Error ? fetchError.constructor.name : typeof fetchError);
        console.error('Error message:', fetchError instanceof Error ? fetchError.message : String(fetchError));
        if (fetchError instanceof Error && fetchError.stack) {
          console.error('Error stack:', fetchError.stack);
        }
        console.error('═══════════════════════════════════════════════════════════');
        
        throw new Error(`Unable to connect to Prompt Agent (${secondRequestUrl}): ${fetchError instanceof Error ? fetchError.message : 'fetch failed'}`);
      }

      // Check response status and Content-Type
      const secondContentType = secondResponse.headers.get('content-type') || '';
      const secondIsJson = secondContentType.includes('application/json');
      
      console.log('Prompt Agent second call response status:', secondResponse.status);
      console.log('Prompt Agent second call response Content-Type:', secondContentType);
      console.log('Is JSON:', secondIsJson);
      
      let secondResult: any;
      try {
        if (secondIsJson) {
          secondResult = await secondResponse.json();
        } else {
          // If not JSON, read text first (may be HTML error page)
          const text = await secondResponse.text();
          console.error('Prompt Agent second call returned non-JSON response:');
          console.error('Response text (first 500 chars):', text.substring(0, 500));
          
          // Try to parse as JSON (Content-Type may be set incorrectly)
          try {
            secondResult = JSON.parse(text);
          } catch (parseError) {
            // Indeed HTML or other non-JSON format
            throw new Error(`Prompt Agent returned non-JSON response (status code: ${secondResponse.status}, Content-Type: ${secondContentType}). Endpoint may not exist or returned error page. Response content: ${text.substring(0, 200)}`);
          }
        }
      } catch (parseError) {
        console.error('═══════════════════════════════════════════════════════════');
        console.error('❌ Failed to parse Prompt Agent second call response:');
        console.error('═══════════════════════════════════════════════════════════');
        console.error('Request URL:', secondRequestUrl);
        console.error('Response status:', secondResponse.status);
        console.error('Response Content-Type:', secondContentType);
        console.error('Error type:', parseError instanceof Error ? parseError.constructor.name : typeof parseError);
        console.error('Error message:', parseError instanceof Error ? parseError.message : String(parseError));
        if (parseError instanceof Error && parseError.stack) {
          console.error('Error stack:', parseError.stack);
        }
        console.error('═══════════════════════════════════════════════════════════');
        
        throw parseError instanceof Error ? parseError : new Error(`Failed to parse response: ${String(parseError)}`);
      }
      
      console.log('Prompt Agent second call response data:', JSON.stringify(secondResult, null, 2));

      // Adapt to new response format: { "code": 200, "msg": "success", "data": { "data": "prompt", "rarity": "N" } }
      if (secondResponse.ok && secondResult.code === 200 && secondResult.msg === 'success' && secondResult.data) {
        const prompt = secondResult.data.data; // Extract prompt from new format
        const rarity = secondResult.data.rarity; // Get SBT level
        console.log('✅ Prompt Agent returned success (new format)');
        console.log('Extracted prompt:', prompt);
        console.log('SBT level:', rarity);
        return {
          success: true,
          prompt: prompt,
          rarity: rarity, // Optional: return SBT level
        };
      }
      
      // Compatible with old format
      if (secondResponse.ok && secondResult.success && secondResult.prompt) {
        console.log('✅ Prompt Agent returned success (old format, compatibility handling)');
        return {
          success: true,
          prompt: secondResult.prompt,
        };
      }

      // Handle error cases
      // Check if it's new format error response: { "code": non-200, "msg": "error message", "data": null }
      if (secondResult.code && secondResult.code !== 200) {
        const errorMessage = secondResult.msg || 'Failed to call Prompt Agent';
        console.error('Prompt Agent returned error (new format):', {
          code: secondResult.code,
          msg: errorMessage,
          data: secondResult.data,
        });
        return {
          success: false,
          error: {
            message: errorMessage,
            code: secondResult.code,
            data: secondResult.data,
          },
        };
      }
      
      if (!secondResponse.ok || !secondResult.success) {
        // Extract error information
        let errorMessage = 'Failed to call Prompt Agent';
        
        // If it's a 402 error, payment validation failed (this is Generate Agent's internal payment issue)
        if (secondResponse.status === 402) {
          // Prompt Agent returned 402, Generate Agent's payment validation failed
          // This is an inter-agent payment issue, should not propagate to user
          errorMessage = 'Generate Agent payment validation to Prompt Agent failed (internal payment issue)';
          console.error('⚠️ Generate Agent payment validation to Prompt Agent failed:');
          console.error('Prompt Agent 402 response:', JSON.stringify(secondResult, null, 2));
        } else if (secondResult.error) {
          if (typeof secondResult.error === 'string') {
            errorMessage = secondResult.error;
          } else if (secondResult.error.message) {
            errorMessage = secondResult.error.message;
          } else if (typeof secondResult.error.data === 'string') {
            errorMessage = secondResult.error.data;
          } else if (secondResult.error.msg) {
            errorMessage = secondResult.error.msg;
          } else if (secondResult.error.data) {
            // If data is an object, try to extract more detailed information
            const data = secondResult.error.data;
            if (typeof data === 'object' && data !== null) {
              if (data.message) {
                errorMessage = data.message;
              } else if (data.error) {
                errorMessage = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
              } else {
                errorMessage = JSON.stringify(data);
              }
            } else {
              errorMessage = String(data);
            }
          }
        } else if (secondResult.msg) {
          errorMessage = secondResult.msg;
        } else if (!secondResult.success && secondResult.prompt === undefined) {
          // If no success field and no prompt, may be other error
          errorMessage = `Prompt Agent returned error: ${JSON.stringify(secondResult)}`;
        }
        
        console.error('Prompt Agent second call failed:', {
          status: secondResponse.status,
          error: errorMessage,
          response: secondResult,
        });
        
        // If Prompt Agent returns 402, this is Generate Agent's internal payment issue
        // Should not propagate Prompt Agent's 402 response to user
        // If secondResult is x402 format, should not include in error data
        let errorData = secondResult.error || secondResult;
        if (secondResponse.status === 402 && errorData && typeof errorData === 'object' && errorData.x402Version) {
          // This is x402 format response, should not propagate to user
          // Only return error message, do not include x402 response data
          errorData = { message: 'Prompt Agent payment validation failed (internal payment issue)' };
        }
        
        return {
          success: false,
          error: {
            message: errorMessage,
            data: errorData,
            status: secondResponse.status,
          },
        };
      }

      return {
        success: true,
        prompt: secondResult.prompt,
      };
    }

    // Other errors (non-402 errors)
    let errorMessage = 'Failed to call Prompt Agent';
    if (result.error) {
      if (typeof result.error === 'string') {
        errorMessage = result.error;
      } else if (result.error.message) {
        errorMessage = result.error.message;
      } else if (result.error.data) {
        errorMessage = result.error.data;
      } else if (result.error.msg) {
        errorMessage = result.error.msg;
      }
    } else if (result.msg) {
      errorMessage = result.msg;
    }
    
    return {
      success: false,
      error: {
        message: errorMessage,
        data: result.error || result,
      },
    };
  } catch (error) {
    console.error('═══════════════════════════════════════════════════════════');
    console.error('❌ Exception error occurred when calling Prompt Agent:');
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
    
    return {
      success: false,
      error: {
        code: -32603,
        message: `Internal error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: error instanceof Error ? error.message : 'Unknown error',
        details: errorDetails,
      },
    };
  }
}

/**
 * Call Prompt Agent to generate prompt (directly pass X-PAYMENT)
 * For cases where payment is already prepared
 * 
 * Note: Prompt Agent is now HTTP format (not JSON-RPC)
 */
export async function callPromptAgent(
  promptAgentUrl: string,
  topic: string,
  style?: string,
  additionalRequirements?: string,
  xPayment?: string // X-PAYMENT request header (for payment validation)
): Promise<{ success: boolean; prompt?: string; error?: any }> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // If X-PAYMENT is provided, add to request headers
    if (xPayment) {
      headers['X-PAYMENT'] = xPayment;
    }

    const response = await fetch(`${promptAgentUrl}/task`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        topic,
        style,
        additionalRequirements,
      }),
    });

    // Check response status and Content-Type
    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    
    let result: any;
    try {
      if (isJson) {
        result = await response.json();
      } else {
        // If not JSON, read text first (may be HTML error page)
        const text = await response.text();
        console.error('Prompt Agent returned non-JSON response:');
        console.error('Response text (first 500 chars):', text.substring(0, 500));
        
        // Try to parse as JSON (Content-Type may be set incorrectly)
        try {
          result = JSON.parse(text);
        } catch (parseError) {
          // Indeed HTML or other non-JSON format
          throw new Error(`Prompt Agent returned non-JSON response (status code: ${response.status}, Content-Type: ${contentType}). Endpoint may not exist or returned error page. Response content: ${text.substring(0, 200)}`);
        }
      }
    } catch (parseError) {
      console.error('Failed to parse Prompt Agent response:', parseError);
      throw parseError instanceof Error ? parseError : new Error(`Failed to parse response: ${String(parseError)}`);
    }

    if (!response.ok || !result.success) {
      return {
        success: false,
        error: result.error || 'Failed to call Prompt Agent',
      };
    }

    return {
      success: true,
      prompt: result.prompt,
    };
  } catch (error) {
    console.error('Error occurred when calling Prompt Agent:', error);
    return {
      success: false,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

