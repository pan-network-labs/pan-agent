/**
 * Prompt Agent Payment Validation Utilities
 * 
 * Prompt Agent is a paid service, price is 0.001 BNB
 * Requires complete payment validation (X-PAYMENT mechanism)
 */

import { ethers } from 'ethers';
import { isTxHashUsed, markTxHashAsUsed } from './txhash-store';

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
    
    // ============================================================================
    // Check 1: Verify if transaction hash has been used before
    // ============================================================================
    const isUsed = await isTxHashUsed(tsHash);
    if (isUsed) {
      console.error('═══════════════════════════════════════════════════════════');
      console.error('❌ Transaction hash already used:', tsHash);
      console.error('═══════════════════════════════════════════════════════════');
      return { 
        valid: false, 
        error: 'This payment transaction has already been used. Each transaction can only be used once.' 
      };
    }
    console.log('✅ Transaction hash not used before, continuing validation...');
    
    const provider = new ethers.JsonRpcProvider(PAYMENT_CONFIG.rpcUrl);
    const tx = await provider.getTransaction(tsHash);
    
    if (!tx) {
      console.error('Prompt Agent payment validation failed: transaction does not exist', tsHash);
      return { valid: false, error: 'Transaction does not exist' };
    }
    
    if (!tx.blockNumber) {
      console.error('Prompt Agent payment validation failed: transaction not yet confirmed', tsHash);
      return { valid: false, error: 'Transaction not yet confirmed' };
    }

    const receipt = await provider.getTransactionReceipt(tsHash);
    if (!receipt) {
      console.error('Prompt Agent payment validation failed: transaction not yet confirmed', tsHash);
      return { valid: false, error: 'Transaction not yet confirmed' };
    }

    console.log('Prompt Agent found transaction:', {
      hash: tsHash,
      from: tx.from,
      to: tx.to,
      value: tx.value.toString(),
      blockNumber: tx.blockNumber,
    });

    // ============================================================================
    // Check 2: Verify if transaction is older than 10 minutes (before payment validation)
    // ============================================================================
    console.log('═══════════════════════════════════════════════════════════');
    console.log('⏰ Checking transaction timestamp (10 minute window)');
    console.log('═══════════════════════════════════════════════════════════');
    
    // Get transaction block timestamp
    const txBlock = await provider.getBlock(tx.blockNumber);
    if (!txBlock) {
      console.error('Prompt Agent payment validation failed: transaction block not found', tx.blockNumber);
      return { valid: false, error: 'Transaction block not found' };
    }
    const txTimestamp = txBlock.timestamp; // Block timestamp in seconds
    
    // Get current latest block timestamp (use chain time, not server time)
    const currentBlock = await provider.getBlock('latest');
    if (!currentBlock) {
      console.error('Prompt Agent payment validation failed: current block not found');
      return { valid: false, error: 'Current block not found' };
    }
    const currentBlockTimestamp = currentBlock.timestamp; // Current block timestamp in seconds
    
    // Calculate time difference
    const timeDiff = currentBlockTimestamp - txTimestamp;
    const tenMinutesInSeconds = 10 * 60; // 10 minutes = 600 seconds
    
    console.log('Transaction block number:', tx.blockNumber);
    console.log('Transaction block timestamp:', new Date(txTimestamp * 1000).toISOString());
    console.log('Current block number:', currentBlock.number);
    console.log('Current block timestamp:', new Date(currentBlockTimestamp * 1000).toISOString());
    console.log('Time difference:', timeDiff, 'seconds (', (timeDiff / 60).toFixed(2), 'minutes)');
    console.log('10 minute threshold:', tenMinutesInSeconds, 'seconds');
    console.log('Is expired:', timeDiff > tenMinutesInSeconds ? '❌ Yes' : '✅ No');
    console.log('═══════════════════════════════════════════════════════════');
    
    if (timeDiff > tenMinutesInSeconds) {
      // Mark as used to prevent repeated checks
      await markTxHashAsUsed(tsHash);
      
      console.error('═══════════════════════════════════════════════════════════');
      console.error('❌ Transaction hash expired (older than 10 minutes)');
      console.error('═══════════════════════════════════════════════════════════');
      console.error('Transaction hash:', tsHash);
      console.error('Transaction age:', (timeDiff / 60).toFixed(2), 'minutes');
      console.error('Maximum allowed age: 10 minutes');
      console.error('═══════════════════════════════════════════════════════════');
      
      return { 
        valid: false, 
        error: `Payment transaction expired. Transaction is ${(timeDiff / 60).toFixed(2)} minutes old (maximum allowed: 10 minutes).` 
      };
    }
    
    console.log('✅ Transaction timestamp check passed');

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

    // ============================================================================
    // All validations passed, mark transaction hash as used
    // ============================================================================
    await markTxHashAsUsed(tsHash);
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ Prompt Agent payment validation successful');
    console.log('✅ Transaction hash marked as used in KV:', tsHash);
    console.log('═══════════════════════════════════════════════════════════');
    return { valid: true };
  } catch (error) {
    console.error('Payment validation error:', error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Payment validation failed',
    };
  }
}

