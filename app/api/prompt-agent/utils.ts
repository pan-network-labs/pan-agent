/**
 * Prompt Agent Shared Utility Functions
 */

// CORS response headers configuration
export function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-PAYMENT',
    'Access-Control-Max-Age': '86400',
  };
}

// Core function to generate Prompt
export async function generatePrompt(
  topic: string,
  style?: string,
  additionalRequirements?: string
): Promise<{ success: boolean; prompt?: string; error?: string }> {
  try {
    // Here you can use AI models to generate prompt
    // For demonstration, we use simple template generation
    // In actual projects, you can call GPT, Claude and other models
    
    let prompt = `A ${style || 'abstract'} style artwork, theme: ${topic}`;
    
    if (additionalRequirements) {
      prompt += `, ${additionalRequirements}`;
    }
    
    // Can add more prompt optimization logic
    // For example: use AI models to optimize prompt, add art style descriptions, etc.
    
    return { success: true, prompt };
  } catch (error) {
    console.error('Error occurred while generating prompt:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Get Agent Card
export function getAgentCard(baseUrl: string) {
  return {
    "@context": "https://a2a.plus/context.jsonld",
    "@type": "Agent",
    "name": "Prompt Generation Agent",
    "description": "An agent for generating image generation prompts, can generate optimized prompts based on topic, style and other requirements",
    "version": "1.0.0",
    "capabilities": [
      {
        "name": "generate_prompt",
        "description": "Generate image generation prompts based on topic, style and other requirements",
        "pricing": {
          "price": "0.001", // Prompt Agent price: 0.001 BNB
          "currency": "BNB",
          "network": "BSCTest",
          // Prompt Agent payment address: use smart contract address (contract directly receives payment)
          "address": process.env.PAYMENT_CONTRACT_ADDRESS || "",
          "note": "Calling this capability requires payment of 0.001 BNB (pay to smart contract address)"
        },
        "inputSchema": {
          "type": "object",
          "properties": {
            "topic": {
              "type": "string",
              "description": "Image topic or content description"
            },
            "style": {
              "type": "string",
              "description": "Art style (optional, e.g.: abstract, realistic, watercolor, etc.)"
            },
            "additionalRequirements": {
              "type": "string",
              "description": "Additional requirements or descriptions (optional)"
            }
          },
          "required": ["topic"]
        },
        "outputSchema": {
          "type": "object",
          "properties": {
            "prompt": {
              "type": "string",
              "description": "Generated prompt"
            },
            "topic": {
              "type": "string",
              "description": "Original topic"
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
      "defaultPrice": "0.001", // Prompt Agent price: 0.001 BNB
      "currency": "BNB",
      "network": "BSCTest",
      // Prompt Agent payment address: use smart contract address (contract directly receives payment)
      "address": process.env.PAYMENT_CONTRACT_ADDRESS || "",
      "minAmount": "0.001",
      "pricingModel": "per_call",
      "note": "Calling this Agent requires payment, see capabilities[].pricing field for specific prices (pay to smart contract address)"
    },
    "metadata": {
      "provider": "Custom",
      "version": "1.0.0"
    }
  };
}

