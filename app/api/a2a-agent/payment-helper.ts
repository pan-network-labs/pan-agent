/**
 * Agent 间支付辅助函数
 * 用于 Generate Agent 调用其他 Agent 时的支付处理
 */

import { discoverAgentCard } from './agent-client';
import { makeContractPayment, makeDirectPayment } from '../payment/simple';

/**
 * 为调用其他 Agent 准备支付
 * 如果目标 Agent 是付费的，会自动支付；如果是免费的，返回 null
 * 
 * @param agentUrl - Agent 的 URL
 * @param capabilityName - 能力名称
 * @param userAddress - 用户地址（用于发放 SBT），必需
 */
export async function preparePaymentForAgent(
  agentUrl: string,
  capabilityName: string,
  userAddress: string, // 必需：用户地址（用于发放 SBT）
  referrer?: string // 可选：推广人地址
): Promise<{ xPayment: string | null; error?: string }> {
  try {
    // 1. 发现 Agent Card
    const discovery = await discoverAgentCard(`${agentUrl}/task`);
    
    if (!discovery.success || !discovery.card) {
      return { xPayment: null, error: '无法获取 Agent Card' };
    }

    // 2. 查找能力的价格信息
    const capability = discovery.card.capabilities?.find(
      (cap: any) => cap.name === capabilityName
    );

    if (!capability) {
      return { xPayment: null, error: `能力 ${capabilityName} 不存在` };
    }

    // 3. 检查是否需要支付
    const pricing = capability.pricing;
    const price = parseFloat(pricing?.price || '0');
    const isFree = price === 0;

    if (isFree) {
      // 免费服务，返回 null（可选传递 X-PAYMENT 用于审计）
      return { xPayment: null };
    }

    // 4. 需要支付，执行支付
    // 验证用户地址
    if (!userAddress) {
      return { xPayment: null, error: '用户地址未提供，无法发放 SBT' };
    }

    // 使用合约地址（合约直接收款，给用户发放 SBT）
    const contractAddress = process.env.PAYMENT_CONTRACT_ADDRESS;
    if (!contractAddress) {
      return { xPayment: null, error: 'PAYMENT_CONTRACT_ADDRESS 未配置' };
    }

    // 5. 调用支付功能（合约直接收款，给用户发放 SBT）
    const paymentResult = await makeContractPayment(
      pricing.price,
      `支付给 ${discovery.card.name} 的 ${capabilityName} 能力`,
      userAddress, // 用户地址（用于发放 SBT）
      contractAddress, // 合约地址
      referrer || '', // 推广人（字符串格式，如果没有则使用空字符串）
      'N' // SBT 级别（默认为 N 级）
    );

    if (!paymentResult.success || !paymentResult.txHash) {
      console.error('═══════════════════════════════════════════════════════════');
      console.error('❌ 为 Agent 准备支付时失败:');
      console.error('═══════════════════════════════════════════════════════════');
      console.error('Agent URL:', agentUrl);
      console.error('能力名称:', capabilityName);
      console.error('用户地址:', userAddress);
      console.error('错误信息:', paymentResult.error || '支付失败');
      console.error('完整结果:', JSON.stringify(paymentResult, null, 2));
      console.error('═══════════════════════════════════════════════════════════');
      
      return { 
        xPayment: null, 
        error: paymentResult.error || '合约支付失败',
      };
    }

    // 6. 将交易哈希编码为 Base64（用于 X-PAYMENT 头）
    // X-PAYMENT 头格式：base64(txHash)
    const xPayment = Buffer.from(paymentResult.txHash, 'utf-8').toString('base64');

    return { xPayment };
  } catch (error) {
    console.error('准备支付时发生错误:', error);
    return {
      xPayment: null,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

