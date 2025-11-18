/**
 * Inter-agent Payment Helper Functions
 * For payment processing when Generate Agent calls other Agents
 */

import { discoverAgentCard } from './agent-client';
import { makeContractPayment, makeDirectPayment } from '../payment/simple';

/**
 * Prepare payment for calling other Agent
 * If target Agent is paid, will automatically pay; if free, returns null
 * 
 * @param agentUrl - Agent's URL
 * @param capabilityName - Capability name
 * @param userAddress - User address (for SBT issuance), required
 */
export async function preparePaymentForAgent(
  agentUrl: string,
  capabilityName: string,
  userAddress: string, // Required: User address (for SBT issuance)
  referrer?: string // Optional: Referrer address
): Promise<{ xPayment: string | null; error?: string }> {
  try {
    // 1. Discover Agent Card
    const discovery = await discoverAgentCard(`${agentUrl}/task`);
    
    if (!discovery.success || !discovery.card) {
      return { xPayment: null, error: 'Unable to get Agent Card' };
    }

    // 2. Find capability pricing information
    const capability = discovery.card.capabilities?.find(
      (cap: any) => cap.name === capabilityName
    );

    if (!capability) {
      return { xPayment: null, error: `Capability ${capabilityName} does not exist` };
    }

    // 3. Check if payment is required
    const pricing = capability.pricing;
    const price = parseFloat(pricing?.price || '0');
    const isFree = price === 0;

    if (isFree) {
      // Free service, return null (optionally pass X-PAYMENT for auditing)
      return { xPayment: null };
    }

    // 4. Payment required, execute payment
    // Validate user address
    if (!userAddress) {
      return { xPayment: null, error: 'User address not provided, cannot issue SBT' };
    }

    // Use contract address (contract directly receives payment, issues SBT to user)
    const contractAddress = process.env.PAYMENT_CONTRACT_ADDRESS;
    if (!contractAddress) {
      return { xPayment: null, error: 'PAYMENT_CONTRACT_ADDRESS not configured' };
    }

    // 5. Call payment function (contract directly receives payment, issues SBT to user)
    const paymentResult = await makeContractPayment(
      pricing.price,
      `Payment to ${discovery.card.name}'s ${capabilityName} capability`,
      userAddress, // User address (for SBT issuance)
      contractAddress, // Contract address
      referrer || '', // Referrer (string format, use empty string if not provided)
      'N' // SBT level (default N level)
    );

    if (!paymentResult.success || !paymentResult.txHash) {
      console.error('═══════════════════════════════════════════════════════════');
      console.error('❌ Failed to prepare payment for Agent:');
      console.error('═══════════════════════════════════════════════════════════');
      console.error('Agent URL:', agentUrl);
      console.error('Capability name:', capabilityName);
      console.error('User address:', userAddress);
      console.error('Error message:', paymentResult.error || 'Payment failed');
      console.error('Full result:', JSON.stringify(paymentResult, null, 2));
      console.error('═══════════════════════════════════════════════════════════');
      
      return { 
        xPayment: null, 
        error: paymentResult.error || 'Contract payment failed',
      };
    }

    // 6. Encode transaction hash as Base64 (for X-PAYMENT header)
    // X-PAYMENT header format: base64(txHash)
    const xPayment = Buffer.from(paymentResult.txHash, 'utf-8').toString('base64');

    return { xPayment };
  } catch (error) {
    console.error('Error occurred while preparing payment:', error);
    return {
      xPayment: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

