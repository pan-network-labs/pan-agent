/**
 * Prompt Agent 共享工具函数
 */

// CORS响应头配置
export function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-PAYMENT',
    'Access-Control-Max-Age': '86400',
  };
}

// 生成 Prompt 的核心函数
export async function generatePrompt(
  topic: string,
  style?: string,
  additionalRequirements?: string
): Promise<{ success: boolean; prompt?: string; error?: string }> {
  try {
    // 这里可以使用 AI 模型来生成 prompt
    // 为了演示，我们使用简单的模板生成
    // 实际项目中可以调用 GPT、Claude 等模型
    
    let prompt = `一幅${style || '抽象'}风格的画作，主题是：${topic}`;
    
    if (additionalRequirements) {
      prompt += `，${additionalRequirements}`;
    }
    
    // 可以添加更多 prompt 优化逻辑
    // 例如：使用 AI 模型优化 prompt、添加艺术风格描述等
    
    return { success: true, prompt };
  } catch (error) {
    console.error('生成 prompt 时发生错误:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

// 获取代理卡片（Agent Card）
export function getAgentCard(baseUrl: string) {
  return {
    "@context": "https://a2a.plus/context.jsonld",
    "@type": "Agent",
    "name": "Prompt Generation Agent",
    "description": "一个用于生成图片生成提示词（prompt）的代理，可以根据主题、风格等要求生成优化的提示词",
    "version": "1.0.0",
    "capabilities": [
      {
        "name": "generate_prompt",
        "description": "根据主题、风格等要求生成图片生成的提示词",
        "pricing": {
          "price": "0.01", // Prompt Agent 价格：0.01 BNB
          "currency": "BNB",
          "network": "BSCTest",
          // Prompt Agent 收款地址：使用智能合约地址（合约直接收款）
          "address": process.env.PAYMENT_CONTRACT_ADDRESS || "",
          "note": "调用此能力需要支付 0.01 BNB（支付到智能合约地址）"
        },
        "inputSchema": {
          "type": "object",
          "properties": {
            "topic": {
              "type": "string",
              "description": "图片主题或内容描述"
            },
            "style": {
              "type": "string",
              "description": "艺术风格（可选，如：抽象、写实、水彩等）"
            },
            "additionalRequirements": {
              "type": "string",
              "description": "额外的要求或描述（可选）"
            }
          },
          "required": ["topic"]
        },
        "outputSchema": {
          "type": "object",
          "properties": {
            "prompt": {
              "type": "string",
              "description": "生成的提示词"
            },
            "topic": {
              "type": "string",
              "description": "原始主题"
            }
          }
        }
      }
    ],
    "endpoints": {
      "task": `${baseUrl}/api/prompt-agent/task`,
      "agentCard": `${baseUrl}/api/prompt-agent/.well-known/agent.json`
    },
    "payment": {
      "required": true,
      "defaultPrice": "0.01", // Prompt Agent 价格：0.01 BNB
      "currency": "BNB",
      "network": "BSCTest",
      // Prompt Agent 收款地址：使用智能合约地址（合约直接收款）
      "address": process.env.PAYMENT_CONTRACT_ADDRESS || "",
      "minAmount": "0.01",
      "pricingModel": "per_call",
      "note": "调用此 Agent 需要支付，具体价格请查看 capabilities[].pricing 字段（支付到智能合约地址）"
    },
    "metadata": {
      "provider": "Custom",
      "version": "1.0.0"
    }
  };
}

