/**
 * Payment Utility Functions
 * For Agents to call smart contracts for payment
 */

import { ethers } from 'ethers';

// Payment configuration
export interface PaymentConfig {
  rpcUrl: string;
  contractAddress: string;
  signingServiceUrl: string;
  broadcastServiceUrl: string;
}

// Get payment configuration
export function getPaymentConfig(): PaymentConfig {
  return {
    rpcUrl: process.env.PAYMENT_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/',
    contractAddress: process.env.PAYMENT_CONTRACT_ADDRESS || '',
    signingServiceUrl: process.env.SIGNING_SERVICE_URL || 'http://localhost:3000/api/payment/sign',
    broadcastServiceUrl: process.env.BROADCAST_SERVICE_URL || 'http://localhost:3000/api/payment/broadcast',
  };
}

// Call smart contract payment (using signing service)
export async function makeContractPayment(
  recipient: string,
  amount: string,
  description: string = ''
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const config = getPaymentConfig();
    
    if (!config.contractAddress) {
      return { success: false, error: 'Payment contract address not configured' };
    }

    // 1. Prepare smart contract call data
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const iface = new ethers.Interface([
      'function makePayment(address recipient, string memory description) payable returns (uint256 tokenId)'
    ]);
    
    const data = iface.encodeFunctionData('makePayment', [recipient, description]);
    const value = ethers.parseEther(amount);

    // 2. Get current nonce
    // Note: Need to know the signing service wallet address
    // Can get from signing service, or read from environment variables
    const signingWalletAddress = process.env.SIGNING_WALLET_ADDRESS;
    if (!signingWalletAddress) {
      return { success: false, error: 'Signing wallet address not configured' };
    }
    
    const nonce = await provider.getTransactionCount(signingWalletAddress, 'pending');
    
    // 3. Estimate gas
    const gasEstimate = await provider.estimateGas({
      to: config.contractAddress,
      value,
      data,
    });
    
    const gasPrice = await provider.getFeeData();
    
    // 4. Call signing service
    const signResponse = await fetch(config.signingServiceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Can add API Key authentication
        // 'Authorization': `Bearer ${process.env.SIGNING_SERVICE_API_KEY}`,
      },
      body: JSON.stringify({
        to: config.contractAddress,
        value: amount,
        data,
        nonce,
        gasPrice: gasPrice.gasPrice ? ethers.formatUnits(gasPrice.gasPrice, 'gwei') : undefined,
        gasLimit: gasEstimate.toString(),
      }),
    });

    if (!signResponse.ok) {
      const error = await signResponse.json();
      return { success: false, error: error.message || 'Failed to sign transaction' };
    }

    const signResult = await signResponse.json();
    
    if (!signResult.success) {
      return { success: false, error: signResult.error || 'Signing failed' };
    }

    // 5. Broadcast transaction
    const broadcastResponse = await fetch(config.broadcastServiceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        signedTransaction: signResult.signedTransaction,
      }),
    });

    if (!broadcastResponse.ok) {
      const error = await broadcastResponse.json();
      return { success: false, error: error.message || 'Failed to broadcast transaction' };
    }

    const broadcastResult = await broadcastResponse.json();
    
    return {
      success: true,
      txHash: broadcastResult.transactionHash,
    };
  } catch (error) {
    console.error('Error occurred while calling smart contract payment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Direct transfer (using signing service)
export async function makeDirectPayment(
  recipient: string,
  amount: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const config = getPaymentConfig();
    
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const signingWalletAddress = process.env.SIGNING_WALLET_ADDRESS;
    
    if (!signingWalletAddress) {
      return { success: false, error: 'Signing wallet address not configured' };
    }
    
    const nonce = await provider.getTransactionCount(signingWalletAddress, 'pending');
    const gasPrice = await provider.getFeeData();
    
    // Call signing service
    const signResponse = await fetch(config.signingServiceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: recipient,
        value: amount,
        nonce,
        gasPrice: gasPrice.gasPrice ? ethers.formatUnits(gasPrice.gasPrice, 'gwei') : undefined,
      }),
    });

    if (!signResponse.ok) {
      const error = await signResponse.json();
      return { success: false, error: error.message || 'Failed to sign transaction' };
    }

    const signResult = await signResponse.json();
    
    if (!signResult.success) {
      return { success: false, error: signResult.error || 'Signing failed' };
    }

    // Broadcast transaction
    const broadcastResponse = await fetch(config.broadcastServiceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        signedTransaction: signResult.signedTransaction,
      }),
    });

    if (!broadcastResponse.ok) {
      const error = await broadcastResponse.json();
      return { success: false, error: error.message || 'Failed to broadcast transaction' };
    }

    const broadcastResult = await broadcastResponse.json();
    
    return {
      success: true,
      txHash: broadcastResult.transactionHash,
    };
  } catch (error) {
    console.error('Error occurred while making direct transfer:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

