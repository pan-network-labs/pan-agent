/**
 * Prompt Agent Payment Validation Utilities
 * 
 * Prompt Agent is a paid service, price is 0.001 BNB
 * Requires complete payment validation (X-PAYMENT mechanism)
 */

import { ethers } from 'ethers';

// Get payment configuration
export function getPaymentConfig() {
  // Prompt Agent price read from environment variables, should be in Wei format (string)
  // Default 0.001 BNB = 1000000000000000 Wei
  const priceEnv = process.env.PROMPT_AGENT_PRICE || '1000000000000000';
  const minAmountEnv = process.env.PROMPT_AGENT_MIN_AMOUNT || '1000000000000000';
  
  // Determine if BNB format or Wei format (BNB format usually < 1e15, Wei format usually > 1e15)
  const priceWei = parseFloat(priceEnv) < 1e15 
    ? ethers.parseEther(priceEnv).toString() 
    : priceEnv;
  const minAmountWei = parseFloat(minAmountEnv) < 1e15 
    ? ethers.parseEther(minAmountEnv).toString() 
    : minAmountEnv;
  
  // ============================================================================
  // 【Important】Prompt Agent Payment Address Configuration:
  // ============================================================================
  // PAYMENT_CONTRACT_ADDRESS: Smart contract address (required)
  //   - Purpose: Address for Generate Agent to pay Prompt Agent (through smart contract)
  //   - Function: Receive payment from Generate Agent and issue SBT Token to user
  //   - Note: When Generate Agent calls Prompt Agent, payment is made through smart contract
  //   - Flow: Generate Agent → call contract makePayment → contract issues SBT to user
  //   - Example: 0x1956f3E39c7a9Bdd8E35a0345379692C3f433898
  //
  // Note: Prompt Agent does not use PAYMENT_ADDRESS (regular wallet address)
  //       Prompt Agent only receives contract payment from Generate Agent
  // ============================================================================
  const contractAddress = process.env.PAYMENT_CONTRACT_ADDRESS || '';
  
  // Log address used (for debugging)
  if (contractAddress) {
    console.log(`📋 Prompt Agent payment address configuration: PAYMENT_CONTRACT_ADDRESS (smart contract)`);
    console.log(`   Address: ${contractAddress}`);
  } else {
    console.warn('⚠️  Prompt Agent payment address not configured: PAYMENT_CONTRACT_ADDRESS is empty');
  }
  
  const config = {
    price: priceWei, // Wei format
    currency: process.env.PROMPT_AGENT_CURRENCY || 'BNB',
    network: process.env.PROMPT_AGENT_NETWORK || 'BSC',
    // Prompt Agent payment address: use smart contract address (contract directly receives payment, issues SBT to user)
    address: contractAddress,
    minAmount: minAmountWei, // Wei format
    rpcUrl: process.env.PAYMENT_RPC_URL || 'https://bsc-dataseed1.binance.org/',
  };

  return config;
}

// Validate payment information
export async function validatePayment(xPaymentHeader: string | null): Promise<{ valid: boolean; error?: any }> {
  const PAYMENT_CONFIG = getPaymentConfig();

  // X-PAYMENT header is required
  if (!xPaymentHeader) {
    return {
      valid: false,
      error: {
        price: PAYMENT_CONFIG.price,
        currency: PAYMENT_CONFIG.currency,
        network: PAYMENT_CONFIG.network,
        address: PAYMENT_CONFIG.address,
      },
    };
  }

  // Complete validation logic (same as generate agent)
  try {
    console.log('Prompt Agent starting payment validation, X-PAYMENT header:', xPaymentHeader);
    const tsHash = Buffer.from(xPaymentHeader, 'base64').toString('utf-8');
    console.log('Decoded transaction hash:', tsHash);
    
    const provider = new ethers.JsonRpcProvider(PAYMENT_CONFIG.rpcUrl);
    const tx = await provider.getTransaction(tsHash);
    
    if (!tx) {
      console.error('Prompt Agent payment validation failed: transaction does not exist', tsHash);
      return { valid: false, error: 'Transaction does not exist' };
    }

    console.log('Prompt Agent found transaction:', {
      hash: tsHash,
      from: tx.from,
      to: tx.to,
      value: tx.value.toString(),
      blockNumber: tx.blockNumber,
    });

    const receipt = await provider.getTransactionReceipt(tsHash);
    if (!receipt) {
      console.error('Prompt Agent payment validation failed: transaction not yet confirmed', tsHash);
      return { valid: false, error: 'Transaction not yet confirmed' };
    }

    console.log('Prompt Agent transaction information:');
    console.log('Transaction hash:', tsHash);
    console.log('Sender:', tx.from);
    console.log('Recipient (contract address):', tx.to);
    console.log('Transaction amount:', ethers.formatEther(tx.value), 'BNB');
    console.log('Transaction status:', receipt.status === 1 ? 'Success' : 'Failed');
    console.log('Expected contract address:', PAYMENT_CONFIG.address);
    console.log('Environment variable PAYMENT_CONTRACT_ADDRESS:', process.env.PAYMENT_CONTRACT_ADDRESS || '(not set)');

    // Validate payment: check if transaction to address is contract address (contract directly receives payment)
    if (PAYMENT_CONFIG.address) {
      const expectedAddress = PAYMENT_CONFIG.address.toLowerCase();
      const toAddress = tx.to?.toLowerCase();
      const amountWei = BigInt(tx.value.toString());
      const minAmountWei = BigInt(PAYMENT_CONFIG.minAmount);

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📍 Prompt Agent address validation:');
      console.log('  - Expected address (from PAYMENT_CONTRACT_ADDRESS):', expectedAddress);
      console.log('  - Actual transaction recipient address:', toAddress);
      console.log('  - Address match:', toAddress === expectedAddress ? '✅ Match' : '❌ Mismatch');
      console.log('  - Payment amount (Wei):', amountWei.toString());
      console.log('  - Minimum amount (Wei):', minAmountWei.toString());
      console.log('  - Is amount sufficient:', amountWei >= minAmountWei ? '✅ Sufficient' : '❌ Insufficient');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Check if transaction is sent to contract address
      if (toAddress !== expectedAddress) {
        console.error('Prompt Agent payment validation failed: recipient address mismatch', {
          expected: expectedAddress,
          actual: toAddress,
        });
        return { valid: false, error: `Recipient address mismatch (should send to contract address ${expectedAddress}, actually sent to ${toAddress})` };
      }

      if (amountWei < minAmountWei) {
        console.error('Prompt Agent payment validation failed: insufficient transaction amount', {
          required: minAmountWei.toString(),
          actual: amountWei.toString(),
        });
        return { valid: false, error: `Insufficient transaction amount (requires at least ${ethers.formatEther(minAmountWei)} BNB, actual ${ethers.formatEther(amountWei)} BNB)` };
      }
    } else {
      console.error('Prompt Agent payment validation failed: PAYMENT_CONTRACT_ADDRESS not configured');
      return { valid: false, error: 'PAYMENT_CONTRACT_ADDRESS not configured' };
    }

    if (receipt.status !== 1) {
      console.error('Prompt Agent payment validation failed: transaction failed', {
        status: receipt.status,
        hash: tsHash,
      });
      return { valid: false, error: 'Transaction failed' };
    }

    console.log('Prompt Agent payment validation successful');
    return { valid: true };
  } catch (error) {
    console.error('Payment validation error:', error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Payment validation failed',
    };
  }
}

