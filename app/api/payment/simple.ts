/**
 * Simplified payment utility functions
 * Directly use private key for payment on server
 * 
 * Note: Ensure private key is securely stored in environment variables
 */

import { ethers } from 'ethers';

// Get payment configuration
function getPaymentConfig() {
  // ============================================================================
  // 【Important】Contract Payment Configuration:
  // ============================================================================
  // PAYMENT_CONTRACT_ADDRESS: Smart contract address (required, for contract payment)
  //   - Purpose: Contract address called when Generate Agent pays Prompt Agent
  //   - Function: Receive payment from Generate Agent and issue SBT Token to user (recipient)
  //   - Use cases:
  //     * Generate Agent pays Prompt Agent (via contract makePayment method)
  //   - Flow: Generate Agent → call contract makePayment(recipient, description, referrer) → contract issues SBT to user
  //   - Example: 0x1956f3E39c7a9Bdd8E35a0345379692C3f433898
  //
  // PAYMENT_PRIVATE_KEY: Generate Agent wallet private key
  //   - Purpose: Private key used when Generate Agent automatically pays Prompt Agent
  //
  // PROMPT_PRIVATE_KEY: Prompt Agent wallet private key (priority)
  //   - Purpose: Private key used when Prompt Agent calls contract to mint SBT
  //   - Priority: If PROMPT_PRIVATE_KEY exists, use it first; otherwise use PAYMENT_PRIVATE_KEY
  //
  // Note: User payment to Generate Agent does not use this configuration
  //       User payment to Generate Agent is direct transfer to PAYMENT_ADDRESS (regular wallet address)
  // ============================================================================
  const contractAddress = process.env.PAYMENT_CONTRACT_ADDRESS || '';
  
  // Prioritize PROMPT_PRIVATE_KEY, otherwise use PAYMENT_PRIVATE_KEY
  const privateKey = process.env.PROMPT_PRIVATE_KEY || process.env.PAYMENT_PRIVATE_KEY || '';
  
  // Log configuration info (for debugging)
  if (contractAddress) {
    console.log(`📋 Contract payment configuration: PAYMENT_CONTRACT_ADDRESS (smart contract)`);
    console.log(`   Contract address: ${contractAddress}`);
  } else {
    console.warn('⚠️  Contract address not configured: PAYMENT_CONTRACT_ADDRESS is empty');
  }
  
  if (process.env.PROMPT_PRIVATE_KEY) {
    console.log(`📋 Private key used: PROMPT_PRIVATE_KEY (Prompt Agent)`);
  } else if (process.env.PAYMENT_PRIVATE_KEY) {
    console.log(`📋 Private key used: PAYMENT_PRIVATE_KEY (Generate Agent)`);
  }
  
  return {
    rpcUrl: process.env.PAYMENT_RPC_URL || 'https://bsc-dataseed1.binance.org/',
    contractAddress: contractAddress,
    privateKey: privateKey,
  };
}

// SBT rarity level type
export type SBTRarity = 'N' | 'R' | 'S';

// Call smart contract payment (contract directly receives payment, issues SBT to recipient)
export async function makeContractPayment(
  amount: string,
  description: string = '',
  recipient: string, // Required: Address to receive SBT (user's payment wallet address)
  contractAddress?: string, // Optional: Specify contract address (if not provided, use address from env vars)
  referrer: string = '', // Optional: Referrer (string format, default empty string)
  rarity: SBTRarity = 'N' // Optional: SBT level (N, R, S), default N
): Promise<{ success: boolean; txHash?: string; error?: string; errorDetails?: any }> {
  try {
    const config = getPaymentConfig();
    
    // Directly use private key from config (already prioritized PROMPT_PRIVATE_KEY, otherwise PAYMENT_PRIVATE_KEY)
    const usedPrivateKey = config.privateKey;
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔍 makeContractPayment private key check');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('PROMPT_PRIVATE_KEY exists:', process.env.PROMPT_PRIVATE_KEY ? 'Yes' : 'No');
    console.log('PAYMENT_PRIVATE_KEY exists:', process.env.PAYMENT_PRIVATE_KEY ? 'Yes' : 'No');
    console.log('Final private key source:', process.env.PROMPT_PRIVATE_KEY ? 'PROMPT_PRIVATE_KEY (Prompt Agent)' : 'PAYMENT_PRIVATE_KEY (Generate Agent)');
    if (usedPrivateKey) {
      const testWallet = new ethers.Wallet(usedPrivateKey);
      console.log('Address corresponding to private key used:', testWallet.address);
    }
    console.log('═══════════════════════════════════════════════════════════');
    
    if (!usedPrivateKey) {
      return { success: false, error: 'Private key not configured (neither PROMPT_PRIVATE_KEY nor PAYMENT_PRIVATE_KEY in env)' };
    }
    
    // Use provided address or address from environment variables
    const targetAddress = contractAddress || config.contractAddress;
    if (!targetAddress) {
      return { success: false, error: 'Contract address not configured' };
    }

    // Validate recipient address format
    if (!recipient || !ethers.isAddress(recipient)) {
      return { success: false, error: 'Invalid recipient address' };
    }

    // 1. Create wallet and provider
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const wallet = new ethers.Wallet(usedPrivateKey, provider);

    // 2. Check wallet balance
    const balance = await provider.getBalance(wallet.address);
    const value = ethers.parseEther(amount);
    const minBalance = value + ethers.parseEther('0.001'); // Reserve some gas fees
    
    if (balance < minBalance) {
      return {
        success: false,
        error: `Insufficient wallet balance. Required: ${ethers.formatEther(minBalance)} BNB, Current balance: ${ethers.formatEther(balance)} BNB`,
      };
    }

    // 3. Prepare smart contract call data
    // Select different contract methods based on rarity:
    // - N level: mintNSBT(address recipient, string memory description, string memory referrer) payable returns (uint256 tokenId)
    // - R level: mintRSBT(address recipient, string memory description, string memory referrer) payable returns (uint256 tokenId)
    // - S level: mintSSBT(address recipient, string memory description, string memory referrer) payable returns (uint256 tokenId)
    // recipient is used to issue SBT to user
    // referrer is used for referrer statistics (optional, use empty string if not provided)
    
    // Select method name based on rarity
    const methodName = rarity === 'N' ? 'mintNSBT' : rarity === 'R' ? 'mintRSBT' : 'mintSSBT';
    
    const iface = new ethers.Interface([
      `function ${methodName}(address recipient, string memory description, string memory referrer) payable returns (uint256 tokenId)`
    ]);
    
    // referrer is already string format, use empty string if not provided
    const referrerString = typeof referrer === 'string' ? referrer : '';
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔄 makeContractPayment starting execution');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 Received parameters:');
    console.log('  - Contract address:', targetAddress);
    console.log('  - Payment amount (BNB):', amount);
    console.log('  - Payment amount (Wei):', ethers.parseEther(amount).toString());
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎯 SBT issuance target wallet address (recipient):', recipient);
    console.log('   ⚠️  Contract will issue SBT Token to this address');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  - Description:', description || '(empty string)');
    console.log('  - Referrer:', referrerString || '(empty string)');
    console.log('  - SBT level:', rarity, `(${rarity === 'N' ? 'N (Normal)' : rarity === 'R' ? 'R (Rare)' : 'S (Super Rare)'})`);
    console.log('  - Contract method:', methodName);
    console.log('═══════════════════════════════════════════════════════════');
    
    // Encode function call data (using method name selected based on rarity)
    const data = iface.encodeFunctionData(methodName, [recipient, description || '', referrerString]);
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📦 Encoded contract call data (data):', data);
    console.log('📤 Parameters passed to contract:');
    console.log('  - recipient (SBT receiver):', recipient);
    console.log('  - description:', description || '(empty string)');
    console.log('  - referrer:', referrerString || '(empty string)');
    console.log('  - referrer type:', typeof referrerString);
    console.log('  - referrer length:', referrerString.length);
    console.log('  - referrer === "":', referrerString === '');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 [CONTRACT] Referrer will be stored in contract for this SBT');
    console.log('   After minting, you can query referrer using:');
    console.log('   - getPaymentInfo(tokenId) - should return referrer field');
    console.log('   - getSBTsByAddress(address) - should return referrer in paymentInfos');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 4. Estimate gas and set sufficient gas limit
    let gasLimit: bigint;
    try {
      const gasEstimate = await provider.estimateGas({
        from: wallet.address,
        to: targetAddress,
        value,
        data,
      });
      console.log('Gas estimation successful:', gasEstimate.toString());
      
      // Add 30% buffer to ensure sufficient gas
      gasLimit = (gasEstimate * BigInt(130)) / BigInt(100);
      console.log('Set Gas Limit:', gasLimit.toString(), '(130% of estimated value)');
    } catch (gasError: any) {
      // Gas estimation failed, contract call will fail
      let errorMessage = 'Contract call failed (gas estimation failed)';
      let authorizedMinterAddress: string | null = null;
      
      if (gasError?.reason) {
        errorMessage = `Contract call failed: ${gasError.reason}`;
      } else if (gasError?.message) {
        // Try to extract useful information from error message
        const msg = gasError.message;
        if (msg.includes('execution reverted')) {
          errorMessage = 'Contract execution reverted, possibly contract require check failed. Please check: 1) Is recipient address valid 2) Does contract state allow this operation 3) Does payment amount meet contract requirements';
        } else {
          errorMessage = `Contract call failed: ${msg}`;
        }
      }
      
      // If "Only authorized minter" error, query contract's authorized minter address
      if (errorMessage.includes('Only authorized minter') || errorMessage.includes('authorized minter')) {
        try {
          const contract = new ethers.Contract(targetAddress, ['function authorizedMinter() view returns (address)'], provider);
          authorizedMinterAddress = await contract.authorizedMinter();
          console.log('Queried contract authorized minter address:', authorizedMinterAddress);
        } catch (queryError) {
          console.error('Failed to query authorized minter address:', queryError);
        }
      }
      
      // Check actual private key source used
      const isUsingPromptKey = !!process.env.PROMPT_PRIVATE_KEY;
      
      console.error('═══════════════════════════════════════════════════════════');
      console.error('❌ Contract call failed (Gas estimation phase)');
      console.error('═══════════════════════════════════════════════════════════');
      console.error('Current wallet address used:', wallet.address);
      console.error('Private key source:', isUsingPromptKey ? 'PROMPT_PRIVATE_KEY (Prompt Agent)' : 'PAYMENT_PRIVATE_KEY (Generate Agent)');
      if (authorizedMinterAddress) {
        console.error('Contract authorized minter address:', authorizedMinterAddress);
        console.error('⚠️  Address mismatch! Please check:');
        if (isUsingPromptKey) {
          console.error('   Currently using PROMPT_PRIVATE_KEY, but the address corresponding to this private key is not an authorized minter');
          console.error('   Solution: Update PROMPT_PRIVATE_KEY environment variable to the private key corresponding to address', authorizedMinterAddress);
        } else {
          console.error('   Currently using PAYMENT_PRIVATE_KEY, but the address corresponding to this private key is not an authorized minter');
          console.error('   Solution: Update PAYMENT_PRIVATE_KEY environment variable to the private key corresponding to address', authorizedMinterAddress);
        }
      }
      console.error('═══════════════════════════════════════════════════════════');
      
      // Build detailed error information
      const detailedError: any = {
        message: errorMessage,
        currentAddress: wallet.address,
        privateKeySource: isUsingPromptKey ? 'PROMPT_PRIVATE_KEY (env var)' : 'PAYMENT_PRIVATE_KEY (env var)',
      };
      
      if (authorizedMinterAddress) {
        detailedError.authorizedMinterAddress = authorizedMinterAddress;
        if (isUsingPromptKey) {
          detailedError.solution = `Please update PROMPT_PRIVATE_KEY environment variable to the private key corresponding to address ${authorizedMinterAddress}`;
        } else {
          detailedError.solution = `Please update PAYMENT_PRIVATE_KEY environment variable to the private key corresponding to address ${authorizedMinterAddress}`;
        }
      }
      
      return {
        success: false,
        error: errorMessage,
        errorDetails: detailedError,
      };
    }

    // 5. Send transaction, call contract's makePayment method (set sufficient gas limit)
    const tx = await wallet.sendTransaction({
      to: targetAddress,
      value,
      data, // Contains contract method call data
      gasLimit, // Set sufficient gas limit
    });

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ Payment transaction sent to contract');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📝 Transaction info:');
    console.log('  - Transaction hash:', tx.hash);
    console.log('  - Sender (payment wallet):', wallet.address);
    console.log('  - Recipient (contract address):', targetAddress);
    console.log('  - Payment amount (BNB):', amount);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎯 SBT issuance target wallet address (recipient):', recipient);
    console.log('   ⚠️  Contract will issue SBT Token to this address');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  - Description:', description || '(empty string)');
    console.log('  - Referrer:', referrerString || '(empty string)');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('⏳ Waiting for transaction confirmation...');

    // 6. Wait for transaction confirmation (must wait to ensure transaction success)
    let receipt: ethers.TransactionReceipt | null;
    try {
      receipt = await tx.wait();
      
      // Check if receipt is null
      if (!receipt) {
        console.error('❌ Transaction confirmation failed: receipt is null');
        return {
          success: false,
          error: 'Transaction sent but confirmation failed: receipt is null',
          txHash: tx.hash, // Still return transaction hash, user can manually check
        };
      }
      
      console.log('═══════════════════════════════════════════════════════════');
      console.log('✅ Transaction confirmed');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('📋 Transaction receipt info:');
      console.log('  - Transaction hash:', receipt.hash);
      console.log('  - Block number:', receipt.blockNumber?.toString() || 'N/A');
      console.log('  - Gas used:', receipt.gasUsed?.toString() || 'N/A');
      console.log('  - Transaction status:', receipt.status === 1 ? '✅ Success' : '❌ Failed');
      console.log('═══════════════════════════════════════════════════════════');
      
      // Check transaction status
      if (receipt.status !== 1) {
        console.error('❌ Transaction failed (status code:', receipt.status, ')');
        console.error('Transaction may have been reverted, contract will not have record');
        return {
          success: false,
          error: `Transaction failed (status code: ${receipt.status}). Transaction may have been reverted, please check contract logs or transaction details.`,
        };
      }
      
      // Parse contract events (PaymentReceived, SBTMinted)
      const contractInterface = new ethers.Interface([
        'event PaymentReceived(uint256 indexed tokenId, address indexed payer, address indexed recipient, uint256 amount, uint256 timestamp)',
        'event SBTMinted(uint256 indexed tokenId, address indexed owner, address indexed recipient, uint256 amount, uint8 rarity)',
      ]);
      
      console.log('📊 Parsing contract events...');
      for (const log of receipt.logs) {
        try {
          const parsedLog = contractInterface.parseLog(log);
          if (parsedLog) {
            console.log('  - Event name:', parsedLog.name);
            if (parsedLog.name === 'PaymentReceived') {
              console.log('    - Token ID:', parsedLog.args.tokenId?.toString());
              console.log('    - Payer:', parsedLog.args.payer);
              console.log('    - Recipient:', parsedLog.args.recipient);
              console.log('    - Amount:', parsedLog.args.amount?.toString());
            } else if (parsedLog.name === 'SBTMinted') {
              console.log('    - Token ID:', parsedLog.args.tokenId?.toString());
              console.log('    - Owner:', parsedLog.args.owner);
              console.log('    - Recipient:', parsedLog.args.recipient);
              console.log('    - Amount:', parsedLog.args.amount?.toString());
              console.log('    - Rarity:', parsedLog.args.rarity?.toString());
            }
          }
        } catch (e) {
          // Ignore logs that cannot be parsed (may be events from other contracts)
        }
      }
      
      console.log('═══════════════════════════════════════════════════════════');
      console.log('✅ Contract call successful, SBT issued');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('🔍 [CONTRACT] Verifying referrer was stored in contract...');
      console.log('  - Referrer passed to contract:', referrerString || '(empty string)');
      console.log('  - Note: You can verify by calling getPaymentInfo(tokenId) after transaction confirms');
      console.log('═══════════════════════════════════════════════════════════');
    } catch (waitError: any) {
      console.error('═══════════════════════════════════════════════════════════');
      console.error('❌ Error while waiting for transaction confirmation:');
      console.error('═══════════════════════════════════════════════════════════');
      console.error('Error type:', waitError instanceof Error ? waitError.constructor.name : typeof waitError);
      console.error('Error message:', waitError instanceof Error ? waitError.message : String(waitError));
      if (waitError instanceof Error && waitError.stack) {
        console.error('Error stack:', waitError.stack);
      }
      console.error('═══════════════════════════════════════════════════════════');
      
      // Even if wait fails, return transaction hash (transaction may have been sent)
      return {
        success: false,
        error: `Transaction sent but confirmation failed: ${waitError instanceof Error ? waitError.message : 'Unknown error'}`,
        txHash: tx.hash, // Still return transaction hash, user can manually check
      };
    }

    return {
      success: true,
      txHash: tx.hash,
    };
  } catch (error: any) {
    console.error('Error occurred while calling smart contract payment:', error);
    
    // Extract more detailed error information
    let errorMessage = 'Unknown error';
    let authorizedMinterAddress: string | null = null;
    let currentAddress: string | null = null;
    
    // Try to get current wallet address used
    try {
      const config = getPaymentConfig();
      if (config.privateKey) {
        const provider = new ethers.JsonRpcProvider(config.rpcUrl);
        const wallet = new ethers.Wallet(config.privateKey, provider);
        currentAddress = wallet.address;
      }
    } catch (e) {
      // Ignore error getting address
    }
    
    if (error instanceof Error) {
      errorMessage = error.message;
      
      // If contract execution error, provide more detailed explanation
      if (error.message.includes('execution reverted')) {
        errorMessage = 'Contract execution reverted. Possible reasons: 1) recipient address is invalid or not allowed 2) contract state does not allow this operation 3) payment amount does not meet contract requirements 4) other contract business logic checks failed';
      } else if (error.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient wallet balance, cannot pay';
      } else if (error.message.includes('nonce')) {
        errorMessage = 'Transaction nonce error, please retry later';
      }
    } else if (error?.reason) {
      errorMessage = error.reason;
    } else if (error?.message) {
      errorMessage = error.message;
    }
    
    // If "Only authorized minter" error, query contract's authorized minter address
    if (errorMessage.includes('Only authorized minter') || errorMessage.includes('authorized minter')) {
      try {
        const config = getPaymentConfig();
        const targetAddress = contractAddress || config.contractAddress;
        if (targetAddress) {
          const provider = new ethers.JsonRpcProvider(config.rpcUrl);
          const contract = new ethers.Contract(targetAddress, ['function authorizedMinter() view returns (address)'], provider);
          authorizedMinterAddress = await contract.authorizedMinter();
          console.log('Queried contract authorized minter address:', authorizedMinterAddress);
        }
      } catch (queryError) {
        console.error('Failed to query authorized minter address:', queryError);
      }
    }
    
    // Check actual private key source used
    const isUsingPromptKey = !!process.env.PROMPT_PRIVATE_KEY;
    
    console.error('═══════════════════════════════════════════════════════════');
    console.error('❌ Contract call failed');
    console.error('═══════════════════════════════════════════════════════════');
    if (currentAddress) {
      console.error('Current wallet address used:', currentAddress);
      console.error('Private key source:', isUsingPromptKey ? 'PROMPT_PRIVATE_KEY (Prompt Agent)' : 'PAYMENT_PRIVATE_KEY (Generate Agent)');
    }
    if (authorizedMinterAddress) {
      console.error('Contract authorized minter address:', authorizedMinterAddress);
      console.error('⚠️  Address mismatch!');
      if (isUsingPromptKey) {
        console.error('   Currently using PROMPT_PRIVATE_KEY, but the address corresponding to this private key is not an authorized minter');
        console.error('   Solution: Update PROMPT_PRIVATE_KEY environment variable to the private key corresponding to address', authorizedMinterAddress);
      } else {
        console.error('   Currently using PAYMENT_PRIVATE_KEY, but the address corresponding to this private key is not an authorized minter');
        console.error('   Solution: Update PAYMENT_PRIVATE_KEY environment variable to the private key corresponding to address', authorizedMinterAddress);
      }
    }
    console.error('═══════════════════════════════════════════════════════════');
    
    // Build detailed error information
    const errorDetails: any = {
      message: errorMessage,
    };
    
    if (currentAddress) {
      errorDetails.currentAddress = currentAddress;
      errorDetails.privateKeySource = isUsingPromptKey ? 'PROMPT_PRIVATE_KEY (env var)' : 'PAYMENT_PRIVATE_KEY (env var)';
    }
    
    if (authorizedMinterAddress) {
      errorDetails.authorizedMinterAddress = authorizedMinterAddress;
      if (isUsingPromptKey) {
        errorDetails.solution = `Please update PROMPT_PRIVATE_KEY environment variable to the private key corresponding to address ${authorizedMinterAddress}`;
      } else {
        errorDetails.solution = `Please update PAYMENT_PRIVATE_KEY environment variable to the private key corresponding to address ${authorizedMinterAddress}`;
      }
    }
    
    return {
      success: false,
      error: errorMessage,
      errorDetails: Object.keys(errorDetails).length > 1 ? errorDetails : undefined,
    };
  }
}

// Direct transfer
export async function makeDirectPayment(
  recipient: string,
  amount: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const config = getPaymentConfig();
    
    if (!config.privateKey) {
      return { success: false, error: 'PAYMENT_PRIVATE_KEY not configured' };
    }

    // 1. Create wallet and provider
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const wallet = new ethers.Wallet(config.privateKey, provider);

    // 2. Send transaction
    const tx = await wallet.sendTransaction({
      to: recipient,
      value: ethers.parseEther(amount),
    });

    console.log('Transfer transaction sent:', {
      hash: tx.hash,
      from: wallet.address,
      to: recipient,
      amount,
    });

    return {
      success: true,
      txHash: tx.hash,
    };
  } catch (error) {
    console.error('Error occurred during direct transfer:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Get wallet address
export function getWalletAddress(): string | null {
  const config = getPaymentConfig();
  
  if (!config.privateKey) {
    return null;
  }

  try {
    const wallet = new ethers.Wallet(config.privateKey);
    return wallet.address;
  } catch {
    return null;
  }
}

