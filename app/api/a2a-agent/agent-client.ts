/**
 * A2A Agent 客户端工具
 * 用于调用其他 A2A Agent
 */

export interface A2AAgentCallOptions {
  agentUrl: string;
  method: string;
  params: any;
  id?: number | string;
  xPayment?: string; // X-PAYMENT 请求头（用于支付验证）
}

/**
 * 调用其他 A2A Agent
 */
export async function callA2AAgent(
  options: A2AAgentCallOptions
): Promise<{ success: boolean; result?: any; error?: any }> {
  try {
    const { agentUrl, method, params, id = Date.now(), xPayment } = options;

    // 构建 HTTP 请求（使用查询参数 ?action=method）
    const url = `${agentUrl}/task?action=${encodeURIComponent(method)}`;

    // 构建请求头
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // 如果提供了 X-PAYMENT，添加到请求头
    if (xPayment) {
      headers['X-PAYMENT'] = xPayment;
    }

    // 调用 Agent 的 task 端点
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(params || {}),
    });

    // 检查响应状态和 Content-Type
    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    
    let result: any;
    try {
      if (isJson) {
        result = await response.json();
      } else {
        // 如果不是 JSON，先读取文本（可能是 HTML 错误页面）
        const text = await response.text();
        console.error('A2A Agent 返回了非 JSON 响应:');
        console.error('响应文本（前 500 字符）:', text.substring(0, 500));
        
        // 尝试解析为 JSON（可能 Content-Type 设置错误）
        try {
          result = JSON.parse(text);
        } catch (parseError) {
          // 确实是 HTML 或其他非 JSON 格式
          throw new Error(`A2A Agent 返回了非 JSON 响应（状态码: ${response.status}，Content-Type: ${contentType}）。可能是端点不存在或返回了错误页面。响应内容: ${text.substring(0, 200)}`);
        }
      }
    } catch (parseError) {
      console.error('解析 A2A Agent 响应失败:', parseError);
      throw parseError instanceof Error ? parseError : new Error(`解析响应失败: ${String(parseError)}`);
    }

    // 处理 402 状态码（需要支付）
    if (response.status === 402) {
      return {
        success: false,
        error: {
          code: 402,
          message: 'Payment Required',
          data: result, // x402 响应
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

    // 检查响应格式：{ code: 200, msg: "success", data: {...} }
    if (result.code === 200) {
      return {
        success: true,
        result: result.data,
      };
    }

    // 错误响应
    return {
      success: false,
      error: {
        code: result.code || response.status,
        message: result.msg || 'Unknown error',
        data: result,
      },
    };
  } catch (error) {
    console.error('调用 A2A Agent 时发生错误:', error);
    return {
      success: false,
      error: {
        code: 500,
        message: 'Internal error',
        data: error instanceof Error ? error.message : '未知错误',
      },
    };
  }
}

/**
 * 获取 Agent Card
 * 使用 A2A 协议标准路径：/.well-known/agent.json
 */
export async function getAgentCard(agentUrl: string): Promise<{ success: boolean; card?: any; error?: any }> {
  // 清理 URL，移除末尾的斜杠和路径
  const baseUrl = agentUrl.replace(/\/+$/, '').replace(/\/task$/, '').replace(/\/\.well-known\/agent\.json\/?$/, '');
  
  // 使用 A2A 协议标准路径
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
      
      // 验证是否是有效的 Agent Card
      if (card && (card['@type'] === 'Agent' || card.name || card.capabilities)) {
        return {
          success: true,
          card,
        };
      }
    }

    // 响应不成功或不是有效的 Agent Card
    return {
      success: false,
      error: {
        code: -32603,
        message: 'Agent Card not found',
        data: `无法找到 Agent Card，已尝试标准路径：${standardPath}`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: -32603,
        message: 'Agent Card not found',
        data: error instanceof Error ? error.message : `无法访问 Agent Card 标准路径：${standardPath}`,
      },
    };
  }
}

/**
 * 从端点 URL 推断 Agent 的基础 URL
 * 例如：从 /api/a2a-agent/task 推断出 /api/a2a-agent
 */
export function inferAgentBaseUrl(endpointUrl: string): string {
  // 从端点 URL 推断基础 URL
  // 例如：从 /api/a2a-agent/task 推断出 /api/a2a-agent
  return endpointUrl
    .replace(/\/+$/, '') // 移除末尾斜杠
    .replace(/\/task\/?$/, '') // 移除 /task
    .replace(/\/\.well-known\/agent\.json\/?$/, ''); // 移除 /.well-known/agent.json
}

/**
 * 智能发现 Agent Card
 * 如果提供了 task 端点，会自动推断 Agent Card 的位置
 */
export async function discoverAgentCard(
  endpointUrl: string
): Promise<{ success: boolean; card?: any; error?: any }> {
  const baseUrl = inferAgentBaseUrl(endpointUrl);
  return getAgentCard(baseUrl);
}

/**
 * 调用 Prompt Agent 生成 prompt（自动处理支付）
 * 流程：
 * 1. 先调用 Prompt Agent（不带 X-PAYMENT）
 * 2. 如果返回 402，解析 x402 响应获取地址和金额
 * 3. 向智能合约支付（传入用户地址作为 recipient，用于发放 SBT）
 * 4. 重新调用 Prompt Agent，带上 X-PAYMENT 头
 * 
 * 注意：Prompt Agent 现在是 HTTP 格式（非 JSON-RPC），直接返回 x402 格式
 */
export async function callPromptAgentWithPayment(
  promptAgentUrl: string,
  topic: string,
  style?: string,
  additionalRequirements?: string,
  userAddress?: string, // 用户地址（用于给用户发放 SBT）
  referrer?: string // 可选：推广人（从 Generate Agent 的请求 URL 中获取）
): Promise<{ success: boolean; prompt?: string; rarity?: string; error?: any }> {
  try {
    // 1. 先调用 Prompt Agent（不带 X-PAYMENT，HTTP 格式）
    // 如果提供了 referrer，将其添加到 URL 查询参数中
    let requestUrl = `${promptAgentUrl}/task`;
    if (referrer) {
      requestUrl += `?referrer=${encodeURIComponent(referrer)}`;
    }
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📞 Generate Agent 调用 Prompt Agent');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Prompt Agent URL:', promptAgentUrl);
    console.log('完整请求 URL:', requestUrl);
    console.log('Referrer (传递给 Prompt Agent):', referrer || '(空字符串)');
    console.log('请求参数:', { topic, style, additionalRequirements });
    console.log('═══════════════════════════════════════════════════════════');
    
    let response: Response;
    try {
      response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // 不传递 X-PAYMENT，让 Prompt Agent 返回 402
        },
        body: JSON.stringify({
          topic,
          style,
          additionalRequirements,
        }),
      });
    } catch (fetchError) {
      // fetch 失败，可能是网络错误或 URL 错误
      console.error('═══════════════════════════════════════════════════════════');
      console.error('❌ Fetch 请求失败:');
      console.error('═══════════════════════════════════════════════════════════');
      console.error('请求 URL:', requestUrl);
      console.error('Prompt Agent URL:', promptAgentUrl);
      console.error('错误类型:', fetchError instanceof Error ? fetchError.constructor.name : typeof fetchError);
      console.error('错误消息:', fetchError instanceof Error ? fetchError.message : String(fetchError));
      if (fetchError instanceof Error && fetchError.stack) {
        console.error('错误堆栈:', fetchError.stack);
      }
      console.error('═══════════════════════════════════════════════════════════');
      
      throw new Error(`无法连接到 Prompt Agent (${requestUrl}): ${fetchError instanceof Error ? fetchError.message : 'fetch failed'}`);
    }

    // 检查响应状态和 Content-Type
    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    
    console.log('Prompt Agent 响应状态:', response.status);
    console.log('Prompt Agent 响应 Content-Type:', contentType);
    console.log('是否为 JSON:', isJson);
    
    let result: any;
    try {
      if (isJson) {
        result = await response.json();
      } else {
        // 如果不是 JSON，先读取文本（可能是 HTML 错误页面）
        const text = await response.text();
        console.error('Prompt Agent 返回了非 JSON 响应:');
        console.error('响应文本（前 500 字符）:', text.substring(0, 500));
        
        // 尝试解析为 JSON（可能 Content-Type 设置错误）
        try {
          result = JSON.parse(text);
        } catch (parseError) {
          // 确实是 HTML 或其他非 JSON 格式
          throw new Error(`Prompt Agent 返回了非 JSON 响应（状态码: ${response.status}，Content-Type: ${contentType}）。可能是端点不存在或返回了错误页面。响应内容: ${text.substring(0, 200)}`);
        }
      }
    } catch (parseError) {
      console.error('═══════════════════════════════════════════════════════════');
      console.error('❌ 解析 Prompt Agent 响应失败:');
      console.error('═══════════════════════════════════════════════════════════');
      console.error('请求 URL:', requestUrl);
      console.error('响应状态:', response.status);
      console.error('响应 Content-Type:', contentType);
      console.error('错误类型:', parseError instanceof Error ? parseError.constructor.name : typeof parseError);
      console.error('错误消息:', parseError instanceof Error ? parseError.message : String(parseError));
      if (parseError instanceof Error && parseError.stack) {
        console.error('错误堆栈:', parseError.stack);
      }
      console.error('═══════════════════════════════════════════════════════════');
      
      throw parseError instanceof Error ? parseError : new Error(`解析响应失败: ${String(parseError)}`);
    }
    
    console.log('Prompt Agent 响应数据:', JSON.stringify(result, null, 2));

    // 2. 如果成功，直接返回（适配新的返回格式）
    // 新格式：{ "code": 200, "msg": "success", "data": { "data": "提示词", "rarity": "N" } }
    if (response.ok && result.code === 200 && result.msg === 'success' && result.data) {
      console.log('Prompt Agent 直接返回成功（可能不需要支付）');
      const prompt = result.data.data; // 从新格式中提取提示词
      const rarity = result.data.rarity; // 获取 SBT 级别
      console.log('提取的提示词:', prompt);
      console.log('SBT 级别:', rarity);
      return {
        success: true,
        prompt: prompt,
        rarity: rarity, // 可选：返回 SBT 级别
      };
    }
    
    // 兼容旧格式（如果 Prompt Agent 还在使用旧格式）
    if (response.ok && result.success && result.prompt) {
      console.log('Prompt Agent 返回旧格式（兼容处理）');
      return {
        success: true,
        prompt: result.prompt,
      };
    }

    // 3. 检查是否是 402 错误（需要支付）
    if (response.status === 402) {
      console.log('收到 402 响应，需要支付给 Prompt Agent');
      // 解析 x402 响应
      // Prompt Agent 返回的 402 响应格式（HTTP 格式，直接返回 x402）：
      // {
      //   "x402Version": 1,
      //   "accepts": [...]
      // }
      const x402Data = result;
      
      console.log('Prompt Agent 402 响应完整数据:', JSON.stringify(x402Data, null, 2));
      
      if (!x402Data || !x402Data.x402Version || !x402Data.accepts || x402Data.accepts.length === 0) {
        return {
          success: false,
          error: {
            message: '无法解析 x402 支付信息',
            data: x402Data,
          },
        };
      }

      const requirement = x402Data.accepts[0];
      const address = requirement.address || '';
      const amountWei = requirement.maxAmountRequired || '';
      // 解析 referrer（从 ext.referrer 字段）
      const referrer = requirement.ext?.referrer || '';

      console.log('从 402 响应中解析的合约交易信息:');
      console.log('完整 requirement:', JSON.stringify(requirement, null, 2));
      console.log('合约地址:', address);
      console.log('支付金额 (Wei):', amountWei);
      console.log('支付金额 (BNB):', amountWei ? (BigInt(amountWei) / BigInt(1e18)).toString() : 'N/A');
      console.log('货币:', requirement.currency || 'N/A');
      console.log('网络:', requirement.network || 'N/A');
      console.log('Referrer (从 ext.referrer):', referrer || '(空字符串)');
      console.log('Resource:', requirement.resource || 'N/A');
      console.log('Description:', requirement.description || 'N/A');

      if (!address || !amountWei) {
        return {
          success: false,
          error: {
            message: 'x402 响应中缺少地址或金额信息',
            data: requirement,
          },
        };
      }

      // 验证用户地址
      if (!userAddress) {
        return {
          success: false,
          error: {
            message: '用户地址未提供，无法发放 SBT',
            data: null,
          },
        };
      }

      // 4. 向智能合约支付（使用从 x402 响应中获取的地址和 referrer）
      const { makeContractPayment } = await import('../payment/simple');
      
      // 将 Wei 转换为 BNB 格式（用于 makeContractPayment）
      // 注意：makeContractPayment 接受 BNB 格式的字符串
      const { ethers } = await import('ethers');
      const amountBNB = ethers.formatEther(amountWei);
      
      console.log('准备调用合约支付（传递给 makeContractPayment 的参数）:');
      console.log('合约地址:', address);
      console.log('支付金额 (BNB):', amountBNB);
      console.log('支付金额 (Wei):', amountWei);
      console.log('用户地址 (recipient):', userAddress);
      console.log('Referrer (字符串):', referrer || '(空字符串)');
      console.log('Description:', `支付给 Prompt Agent 的 generate_prompt 能力`);
      
      console.log('调用 makeContractPayment...');
      const paymentResult = await makeContractPayment(
        amountBNB,
        `支付给 Prompt Agent 的 generate_prompt 能力`,
        userAddress, // 用户地址（用于给用户发放 SBT）
        address, // 使用从 x402 响应中获取的合约地址
        referrer || '', // 推广人（字符串格式，如果没有则使用空字符串）
        'N' // SBT 级别（默认为 N 级）
      );
      
      console.log('合约支付结果:', paymentResult);

      if (!paymentResult.success || !paymentResult.txHash) {
        console.error('═══════════════════════════════════════════════════════════');
        console.error('❌ 合约支付失败:');
        console.error('═══════════════════════════════════════════════════════════');
        console.error('错误信息:', paymentResult.error || '支付失败');
        console.error('完整结果:', JSON.stringify(paymentResult, null, 2));
        if (paymentResult.errorDetails) {
          console.error('错误详情:', JSON.stringify(paymentResult.errorDetails, null, 2));
        }
        console.error('═══════════════════════════════════════════════════════════');
        
        return {
          success: false,
          error: {
            message: paymentResult.error || '合约支付失败',
            data: paymentResult,
            type: 'Contract Payment Error',
            details: {
              error: paymentResult.error,
              txHash: paymentResult.txHash || null,
              ...(paymentResult.errorDetails || {}), // 包含 errorDetails（授权地址信息）
            },
          },
        };
      }

      // 5. 等待交易确认
      const provider = new ethers.JsonRpcProvider(
        process.env.PAYMENT_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/'
      );
      
      let receipt = null;
      let attempts = 0;
      const maxAttempts = 30; // 最多等待 30 次（约 60 秒）
      
      while (!receipt && attempts < maxAttempts) {
        receipt = await provider.getTransactionReceipt(paymentResult.txHash);
        if (!receipt) {
          await new Promise((resolve) => setTimeout(resolve, 2000)); // 等待 2 秒
          attempts++;
        }
      }

      if (!receipt) {
        return {
          success: false,
          error: {
            message: '支付交易确认超时',
            data: { txHash: paymentResult.txHash },
          },
        };
      }

      // 6. 将交易哈希编码为 Base64（用于 X-PAYMENT 头）
      const xPayment = Buffer.from(paymentResult.txHash, 'utf-8').toString('base64');

      // 7. 重新调用 Prompt Agent，带上 X-PAYMENT 头（HTTP 格式）
      const secondRequestUrl = `${promptAgentUrl}/task`;
      console.log('═══════════════════════════════════════════════════════════');
      console.log('📞 Generate Agent 第二次调用 Prompt Agent（带 X-PAYMENT）');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('请求 URL:', secondRequestUrl);
      console.log('X-PAYMENT (Base64):', xPayment);
      console.log('交易哈希:', Buffer.from(xPayment, 'base64').toString('utf-8'));
      console.log('═══════════════════════════════════════════════════════════');
      
      let secondResponse: Response;
      try {
        secondResponse = await fetch(secondRequestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-PAYMENT': xPayment, // 传递支付信息
          },
          body: JSON.stringify({
            topic,
            style,
            additionalRequirements,
          }),
        });
      } catch (fetchError) {
        // fetch 失败，可能是网络错误或 URL 错误
        console.error('═══════════════════════════════════════════════════════════');
        console.error('❌ 第二次 Fetch 请求失败:');
        console.error('═══════════════════════════════════════════════════════════');
        console.error('请求 URL:', secondRequestUrl);
        console.error('Prompt Agent URL:', promptAgentUrl);
        console.error('错误类型:', fetchError instanceof Error ? fetchError.constructor.name : typeof fetchError);
        console.error('错误消息:', fetchError instanceof Error ? fetchError.message : String(fetchError));
        if (fetchError instanceof Error && fetchError.stack) {
          console.error('错误堆栈:', fetchError.stack);
        }
        console.error('═══════════════════════════════════════════════════════════');
        
        throw new Error(`无法连接到 Prompt Agent (${secondRequestUrl}): ${fetchError instanceof Error ? fetchError.message : 'fetch failed'}`);
      }

      // 检查响应状态和 Content-Type
      const secondContentType = secondResponse.headers.get('content-type') || '';
      const secondIsJson = secondContentType.includes('application/json');
      
      console.log('Prompt Agent 第二次调用响应状态:', secondResponse.status);
      console.log('Prompt Agent 第二次调用响应 Content-Type:', secondContentType);
      console.log('是否为 JSON:', secondIsJson);
      
      let secondResult: any;
      try {
        if (secondIsJson) {
          secondResult = await secondResponse.json();
        } else {
          // 如果不是 JSON，先读取文本（可能是 HTML 错误页面）
          const text = await secondResponse.text();
          console.error('Prompt Agent 第二次调用返回了非 JSON 响应:');
          console.error('响应文本（前 500 字符）:', text.substring(0, 500));
          
          // 尝试解析为 JSON（可能 Content-Type 设置错误）
          try {
            secondResult = JSON.parse(text);
          } catch (parseError) {
            // 确实是 HTML 或其他非 JSON 格式
            throw new Error(`Prompt Agent 返回了非 JSON 响应（状态码: ${secondResponse.status}，Content-Type: ${secondContentType}）。可能是端点不存在或返回了错误页面。响应内容: ${text.substring(0, 200)}`);
          }
        }
      } catch (parseError) {
        console.error('═══════════════════════════════════════════════════════════');
        console.error('❌ 解析 Prompt Agent 第二次调用响应失败:');
        console.error('═══════════════════════════════════════════════════════════');
        console.error('请求 URL:', secondRequestUrl);
        console.error('响应状态:', secondResponse.status);
        console.error('响应 Content-Type:', secondContentType);
        console.error('错误类型:', parseError instanceof Error ? parseError.constructor.name : typeof parseError);
        console.error('错误消息:', parseError instanceof Error ? parseError.message : String(parseError));
        if (parseError instanceof Error && parseError.stack) {
          console.error('错误堆栈:', parseError.stack);
        }
        console.error('═══════════════════════════════════════════════════════════');
        
        throw parseError instanceof Error ? parseError : new Error(`解析响应失败: ${String(parseError)}`);
      }
      
      console.log('Prompt Agent 第二次调用响应数据:', JSON.stringify(secondResult, null, 2));

      // 适配新的返回格式：{ "code": 200, "msg": "success", "data": { "data": "提示词", "rarity": "N" } }
      if (secondResponse.ok && secondResult.code === 200 && secondResult.msg === 'success' && secondResult.data) {
        const prompt = secondResult.data.data; // 从新格式中提取提示词
        const rarity = secondResult.data.rarity; // 获取 SBT 级别
        console.log('✅ Prompt Agent 返回成功（新格式）');
        console.log('提取的提示词:', prompt);
        console.log('SBT 级别:', rarity);
        return {
          success: true,
          prompt: prompt,
          rarity: rarity, // 可选：返回 SBT 级别
        };
      }
      
      // 兼容旧格式
      if (secondResponse.ok && secondResult.success && secondResult.prompt) {
        console.log('✅ Prompt Agent 返回成功（旧格式，兼容处理）');
        return {
          success: true,
          prompt: secondResult.prompt,
        };
      }

      // 处理错误情况
      // 检查是否是新格式的错误响应：{ "code": 非200, "msg": "错误信息", "data": null }
      if (secondResult.code && secondResult.code !== 200) {
        const errorMessage = secondResult.msg || '调用 Prompt Agent 失败';
        console.error('Prompt Agent 返回错误（新格式）:', {
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
        // 提取错误信息
        let errorMessage = '调用 Prompt Agent 失败';
        
        // 如果是 402 错误，说明支付验证失败（这是 Generate Agent 内部的支付问题）
        if (secondResponse.status === 402) {
          // Prompt Agent 返回 402，说明 Generate Agent 的支付验证失败
          // 这是 Agent 间的支付问题，不应该传播给用户
          errorMessage = 'Generate Agent 向 Prompt Agent 支付验证失败（内部支付问题）';
          console.error('⚠️ Generate Agent 向 Prompt Agent 支付验证失败:');
          console.error('Prompt Agent 402 响应:', JSON.stringify(secondResult, null, 2));
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
            // 如果 data 是对象，尝试提取更详细的信息
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
          // 如果没有 success 字段且没有 prompt，可能是其他错误
          errorMessage = `Prompt Agent 返回错误: ${JSON.stringify(secondResult)}`;
        }
        
        console.error('Prompt Agent 第二次调用失败:', {
          status: secondResponse.status,
          error: errorMessage,
          response: secondResult,
        });
        
        // 如果 Prompt Agent 返回 402，这是 Generate Agent 内部的支付问题
        // 不应该将 Prompt Agent 的 402 响应传播给用户
        // 如果 secondResult 是 x402 格式，不应该包含在错误数据中
        let errorData = secondResult.error || secondResult;
        if (secondResponse.status === 402 && errorData && typeof errorData === 'object' && errorData.x402Version) {
          // 这是 x402 格式的响应，不应该传播给用户
          // 只返回错误消息，不包含 x402 响应数据
          errorData = { message: 'Prompt Agent 支付验证失败（内部支付问题）' };
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

    // 其他错误（非 402 错误）
    let errorMessage = '调用 Prompt Agent 失败';
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
    console.error('❌ 调用 Prompt Agent 时发生异常错误:');
    console.error('═══════════════════════════════════════════════════════════');
    console.error('错误类型:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('错误消息:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('错误堆栈:', error.stack);
    }
    console.error('═══════════════════════════════════════════════════════════');
    
    // 构建详细的错误信息（返回给客户端）
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
        message: `Internal error: ${error instanceof Error ? error.message : '未知错误'}`,
        data: error instanceof Error ? error.message : '未知错误',
        details: errorDetails,
      },
    };
  }
}

/**
 * 调用 Prompt Agent 生成 prompt（直接传递 X-PAYMENT）
 * 用于已经准备好支付的情况
 * 
 * 注意：Prompt Agent 现在是 HTTP 格式（非 JSON-RPC）
 */
export async function callPromptAgent(
  promptAgentUrl: string,
  topic: string,
  style?: string,
  additionalRequirements?: string,
  xPayment?: string // X-PAYMENT 请求头（用于支付验证）
): Promise<{ success: boolean; prompt?: string; error?: any }> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // 如果提供了 X-PAYMENT，添加到请求头
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

    // 检查响应状态和 Content-Type
    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    
    let result: any;
    try {
      if (isJson) {
        result = await response.json();
      } else {
        // 如果不是 JSON，先读取文本（可能是 HTML 错误页面）
        const text = await response.text();
        console.error('Prompt Agent 返回了非 JSON 响应:');
        console.error('响应文本（前 500 字符）:', text.substring(0, 500));
        
        // 尝试解析为 JSON（可能 Content-Type 设置错误）
        try {
          result = JSON.parse(text);
        } catch (parseError) {
          // 确实是 HTML 或其他非 JSON 格式
          throw new Error(`Prompt Agent 返回了非 JSON 响应（状态码: ${response.status}，Content-Type: ${contentType}）。可能是端点不存在或返回了错误页面。响应内容: ${text.substring(0, 200)}`);
        }
      }
    } catch (parseError) {
      console.error('解析 Prompt Agent 响应失败:', parseError);
      throw parseError instanceof Error ? parseError : new Error(`解析响应失败: ${String(parseError)}`);
    }

    if (!response.ok || !result.success) {
      return {
        success: false,
        error: result.error || '调用 Prompt Agent 失败',
      };
    }

    return {
      success: true,
      prompt: result.prompt,
    };
  } catch (error) {
    console.error('调用 Prompt Agent 时发生错误:', error);
    return {
      success: false,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error instanceof Error ? error.message : '未知错误',
      },
    };
  }
}

