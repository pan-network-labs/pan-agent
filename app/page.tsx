'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { ethers } from 'ethers';
import { getLocale, setLocale, useTranslations, type Locale, locales, localeNames } from '../lib/i18n';
import LocaleSwitcher from '../components/LocaleSwitcher';

interface PaymentInfo {
  address: string;
  amountWei: string; // Wei format
  currency: string;
  chain: string;
  referrer?: string; // Referrer address (optional)
}

// MetaMask type declaration
interface EthereumProvider {
  request(args: { method: string; params?: any[] }): Promise<any>;
  on(event: string, handler: (...args: any[]) => void): void;
  removeListener(event: string, handler: (...args: any[]) => void): void;
  isMetaMask?: boolean;
  selectedAddress?: string;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider | EthereumProvider[];
  }
}

// Get correct ethereum provider (handle multiple wallets)
function getEthereumProvider(): EthereumProvider | null {
  if (typeof window === 'undefined' || !window.ethereum) {
    return null;
  }
  
  // If ethereum is an array, prioritize MetaMask
  if (Array.isArray(window.ethereum)) {
    // Prioritize finding MetaMask
    const metaMask = window.ethereum.find((provider: any) => provider.isMetaMask);
    if (metaMask) {
      return metaMask;
    }
    // If no MetaMask, use the first one
    return window.ethereum[0];
  }
  
  // Single provider, check if it's MetaMask
  if (window.ethereum.isMetaMask) {
    return window.ethereum;
  }
  
  return window.ethereum;
}

// Safely request wallet connection (avoid evmAsk.js errors, especially for HTTPS environments)
// Note: This function must be called directly in user click events, no delays or wrappers allowed
async function safeRequestAccounts(ethereum: EthereumProvider): Promise<string[]> {
  // First try using eth_accounts (if already connected, won't trigger selector)
  try {
    const existingAccounts = await ethereum.request({
      method: 'eth_accounts',
    });
    if (existingAccounts && existingAccounts.length > 0) {
      console.log('Using already connected accounts:', existingAccounts);
      return existingAccounts;
    }
  } catch (error) {
    console.warn('eth_accounts query failed:', error);
  }

  // Check if it's HTTPS environment (Vercel deployment)
  const isHTTPS = window.location.protocol === 'https:';
  
  console.log('Environment info:', {
    protocol: window.location.protocol,
    hostname: window.location.hostname,
    isHTTPS,
  });

  // Critical: In HTTPS environment, do not add delay!
  // MetaMask requires user interaction to be triggered directly, any delay will cause user interaction context to be lost
  // Only add small delay in local environment (for debugging)
  if (!isHTTPS) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  try {
    // Try multiple methods in priority order
    // Method 1: Directly use eth_requestAccounts (EIP-1193 standard)
    console.log('Trying method 1: eth_requestAccounts');
    try {
      const accounts = await ethereum.request({
        method: 'eth_requestAccounts',
      });
      
      if (accounts && accounts.length > 0) {
        console.log('✅ Successfully got accounts via eth_requestAccounts:', accounts);
        return accounts;
      }
    } catch (reqError: any) {
      // If user rejected, throw directly
      if (reqError.code === 4001) {
        throw new Error('User rejected wallet connection request');
      }
      
      // If evmAsk.js error, try other methods
      if (reqError.code === -32603 || 
          reqError.message?.includes('Unexpected error') || 
          reqError.message?.includes('evmAsk') || 
          reqError.message?.includes('selectExtension')) {
        console.warn('Method 1 failed (evmAsk.js error), trying method 2...', reqError);
        
        // Method 2: In HTTPS environment, try using wallet_requestPermissions
        if (isHTTPS) {
          try {
            console.log('Trying method 2: wallet_requestPermissions');
            await ethereum.request({
              method: 'wallet_requestPermissions',
              params: [{ eth_accounts: {} }],
            });
            
            // After permission request succeeds, get accounts
            const accounts = await ethereum.request({
              method: 'eth_accounts',
            });
            
            if (accounts && accounts.length > 0) {
              console.log('✅ Successfully got accounts via wallet_requestPermissions:', accounts);
              return accounts;
            }
          } catch (permError: any) {
            console.warn('Method 2 also failed, trying method 3...', permError);
            
            // Method 3: Wait and retry eth_accounts (connection may have been established in background)
            console.log('Trying method 3: Wait and retry eth_accounts');
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            try {
              const accounts = await ethereum.request({
                method: 'eth_accounts',
              });
              
              if (accounts && accounts.length > 0) {
                console.log('✅ Successfully got accounts via retry eth_accounts:', accounts);
                return accounts;
              }
            } catch (retryError) {
              console.warn('Method 3 also failed:', retryError);
            }
          }
        }
        
        // All methods failed, throw friendly error message
        throw new Error('Wallet connection failed. This may be caused by multiple wallet extension conflicts. Please try: 1) Refresh page 2) Temporarily disable other wallet extensions 3) Ensure MetaMask is unlocked');
      }
      
      // Other errors throw directly
      throw reqError;
    }
    
    throw new Error('No accounts obtained');
  } catch (error: any) {
    // Handle user rejection
    if (error.code === 4001) {
      throw new Error('User rejected wallet connection request');
    }
    
    // Other errors throw directly
    throw error;
  }
}

export default function Home() {
  // Multi-language support
  const [currentLocale, setCurrentLocale] = useState<Locale>(() => {
    if (typeof window !== 'undefined') {
      return getLocale();
    }
    return 'en';
  });
  const { t, loading: i18nLoading } = useTranslations(currentLocale);
  
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [sbtRarity, setSbtRarity] = useState<string | null>(null); // SBT level (N, R, S)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [x402ResponseData, setX402ResponseData] = useState<any>(null); // Store complete 402 response data
  const [walletConnected, setWalletConnected] = useState(false); // Wallet connection status
  const [walletAddress, setWalletAddress] = useState<string | null>(null); // Wallet address

  // Switch language
  const handleLocaleChange = (locale: Locale) => {
    setLocale(locale);
    setCurrentLocale(locale);
  };

  // Automatically detect wallet connection status on page load (does not trigger connection request)
  useEffect(() => {
    const checkWalletConnection = async () => {
      const ethereum = getEthereumProvider();
      if (!ethereum) {
        return;
      }

      try {
        // Only query, do not request connection
        const accounts = await ethereum.request({
          method: 'eth_accounts',
        });
        
        if (accounts && accounts.length > 0) {
          setWalletConnected(true);
          setWalletAddress(accounts[0]);
          console.log('Detected connected wallet:', accounts[0]);
        }
      } catch (error) {
        console.warn('Failed to check wallet connection status:', error);
      }
    };

    checkWalletConnection();

    // Listen for account changes
    const ethereum = getEthereumProvider();
    if (ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length > 0) {
          setWalletConnected(true);
          setWalletAddress(accounts[0]);
        } else {
          setWalletConnected(false);
          setWalletAddress(null);
        }
      };

      ethereum.on('accountsChanged', handleAccountsChanged);

      return () => {
        ethereum.removeListener('accountsChanged', handleAccountsChanged);
      };
    }
  }, []);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setImageUrl(null);
    setSbtRarity(null); // Reset SBT level
    setPaymentInfo(null);
    setShowPaymentModal(false);

    try {
      // Get referrer from current page URL query parameters
      const urlParams = new URLSearchParams(window.location.search);
      const referrer = urlParams.get('referrer') || '';
      
      // Pass referrer in request body (not in URL query parameters)
      const requestUrl = '/api/generate-agent/task';
      
      console.log('Request URL:', requestUrl);
      console.log('Referrer (passed in body):', referrer || '(empty string)');
      
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          referrer: referrer || '', // Pass referrer in body
        }),
      });

      // Check if it's 402 status code (payment required)
      if (response.status === 402) {
        const data = await response.json();
        
        // Save complete 402 response data (for debugging and display)
        setX402ResponseData(data);
        console.log('402 response data format:', JSON.stringify(data, null, 2));
        
        // Check if it's x402 standard format
        if (data.x402Version && data.accepts && data.accepts.length > 0) {
          const requirement = data.accepts[0];
          
          // Directly use Wei format (already string format)
          const amountWei = requirement.maxAmountRequired;
          
          // Prioritize getting address and currency directly from accepts object (standardized format)
          // If not exists, extract from resource URL query parameters (backward compatibility)
          let address = requirement.address || '';
          let currency = requirement.currency || 'BNB';
          
          if (!address) {
            // Backward compatibility: extract address from resource URL query parameters
            try {
              const resourceUrl = new URL(requirement.resource);
              address = resourceUrl.searchParams.get('address') || '';
            } catch (e) {
              // If parsing fails, try to match address directly from resource
              const match = requirement.resource.match(/0x[a-fA-F0-9]{40}/);
              address = match ? match[0] : '';
            }
          }
          
          // Parse referrer (from ext.referrer field in 402 response)
          // Referrer should come from 402 response, not from URL
          const referrer = requirement.ext?.referrer || '';
          
          console.log('Referrer information (from 402 response):', {
            fromResponse: requirement.ext?.referrer || '(empty string)',
            final: referrer || '(empty string)',
          });
          
          if (address) {
            // Save payment information (using Wei format)
            setPaymentInfo({
              address: address,
              amountWei: amountWei,
              currency: currency,
              chain: requirement.network,
              referrer: referrer, // Save referrer (may come from 402 response or URL)
            });
            setShowPaymentModal(true);
            setLoading(false);
            return;
          } else {
            setError(`Payment required, but payment address not found. Please check x402 response for payment address.`);
            setLoading(false);
            return;
          }
        } else {
          // Backward compatibility: old format (BNB format)
          const priceBNB = data.price || '0.02';
          // Convert BNB to Wei
          const amountWei = (BigInt(Math.floor(parseFloat(priceBNB) * 1e18))).toString();
          
          if (data.address) {
            setPaymentInfo({
              address: data.address,
              amountWei: amountWei,
              currency: data.currency || 'BNB',
              chain: data.network || 'BSCTest',
            });
            setShowPaymentModal(true);
            setLoading(false);
            return;
          } else {
            setError(`Payment of ${priceBNB} ${data.currency || 'BNB'} required, but payment address not found.`);
            setLoading(false);
      return;
          }
        }
      }

      const data = await response.json();

      // Unified response format: { code: 200, msg: "success", data: { data: "imageURL" } }
      if (data.code === 200 && data.data?.data) {
        setImageUrl(data.data.data);
      } else {
        throw new Error(data.msg || 'Image generation failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error occurred while generating image');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Connect wallet (standalone function, called before payment)
  const handleConnectWallet = async () => {
    try {
      const ethereum = getEthereumProvider();
      
      if (!ethereum) {
        throw new Error('Please install MetaMask wallet');
      }

      // Detect if there are multiple wallet extensions
      const hasMultipleWallets = Array.isArray(window.ethereum) && window.ethereum.length > 1;
      if (hasMultipleWallets) {
        console.warn('Multiple wallet extensions detected, may cause connection issues');
      }

      // Direct call, no wrappers or delays
      console.log('Directly calling eth_requestAccounts...');
      const accounts = await ethereum.request({
        method: 'eth_requestAccounts',
      });

      if (accounts && accounts.length > 0) {
        setWalletConnected(true);
        setWalletAddress(accounts[0]);
        console.log('✅ Wallet connected successfully:', accounts[0]);
        return accounts[0];
      }

      throw new Error('No accounts obtained');
    } catch (error: any) {
      console.error('Wallet connection failed:', error);
      
      if (error.code === 4001) {
        throw new Error('User rejected wallet connection request');
      }
      
      // Detect if it's multiple wallet extension conflict
      const hasMultipleWallets = Array.isArray(window.ethereum) && window.ethereum.length > 1;
      if (hasMultipleWallets && (error.code === -32603 || error.message?.includes('evmAsk') || error.message?.includes('selectExtension'))) {
        throw new Error('Multiple wallet extension conflict detected. Please temporarily disable other wallet extensions, keep only MetaMask, then refresh the page and retry');
      }
      
      throw new Error(error.message || 'Wallet connection failed');
    }
  };

  // Connect wallet and pay (using Wei format)
  const handlePayment = async () => {
    if (!paymentInfo) return;

    setPaymentLoading(true);
    try {
      // If wallet not connected, connect first
      if (!walletConnected || !walletAddress) {
        console.log('Wallet not connected, connecting wallet...');
        await handleConnectWallet();
      }

      // Get correct ethereum provider
      const ethereum = getEthereumProvider();
      
      if (!ethereum) {
        throw new Error('Please install MetaMask wallet');
      }

      // Confirm account again (prevent state desync)
      let accounts: string[];
      try {
        accounts = await ethereum.request({
          method: 'eth_accounts',
        });
      } catch (error) {
        console.warn('Failed to get accounts, trying to reconnect...', error);
        accounts = await safeRequestAccounts(ethereum);
      }

      if (!accounts || accounts.length === 0) {
        throw new Error('Please connect wallet first');
      }

      const fromAddress = accounts[0];

      // Get network information (add error handling)
      let chainId: string;
      try {
        chainId = await ethereum.request({ method: 'eth_chainId' });
      } catch (error: any) {
        console.error('Failed to get chain ID:', error);
        throw new Error(`Failed to get network information: ${error.message || 'Unknown error'}`);
      }
      
      // BSC Testnet chainId: 0x61 (97)
      const bscTestnetChainId = '0x61';
      
      if (chainId !== bscTestnetChainId) {
        // Try to switch to BSC Testnet
        try {
          await ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: bscTestnetChainId }],
          });
        } catch (switchError: any) {
          // If chain doesn't exist, add chain
          if (switchError.code === 4902) {
            try {
              await ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [
                  {
                    chainId: bscTestnetChainId,
                    chainName: 'BSC Testnet',
                    nativeCurrency: {
                      name: 'BNB',
                      symbol: 'BNB',
                      decimals: 18,
                    },
                    rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545/'],
                    blockExplorerUrls: ['https://testnet.bscscan.com'],
                  },
                ],
              });
            } catch (addError: any) {
              console.error('Failed to add chain:', addError);
              throw new Error(`Failed to add BSC Testnet: ${addError.message || 'Unknown error'}`);
            }
          } else if (switchError.code === 4001) {
            throw new Error('User rejected network switch request');
          } else {
            console.error('Failed to switch network:', switchError);
            throw new Error(`Failed to switch network: ${switchError.message || 'Unknown error'}`);
          }
        }
      }

      // Check if address is a contract address (by checking if code is not empty)
      const provider = new ethers.BrowserProvider(ethereum);
      const code = await provider.getCode(paymentInfo.address);
      const isContract = code && code !== '0x';
      
      // Convert Wei string to hexadecimal
      const amountHex = '0x' + BigInt(paymentInfo.amountWei).toString(16);
      
      let txHash: string;
      
      if (isContract) {
        // If it's a contract address, call contract's makePayment method (supports referrer)
        const contractAddress = paymentInfo.address;
        
        // Prepare contract call data
        // Contract method: makePayment(address recipient, string memory description, string memory referrer) payable returns (uint256 tokenId)
        const iface = new ethers.Interface([
          'function makePayment(address recipient, string memory description, string memory referrer) payable returns (uint256 tokenId)'
        ]);
        
        // Get referrer from URL (prioritize referrer from URL, as it's user input)
        const urlParams = new URLSearchParams(window.location.search);
        const referrerFromUrl = urlParams.get('referrer') || '';
        // Prioritize referrer from URL, if not then use referrer from paymentInfo
        const referrerString = referrerFromUrl || paymentInfo.referrer || '';
        
        console.log('Referrer information when paying from frontend:');
        console.log('  - Current page URL:', window.location.href);
        console.log('  - Referrer from URL:', referrerFromUrl || '(empty string)');
        console.log('  - paymentInfo.referrer:', paymentInfo.referrer || '(empty string)');
        console.log('  - Final referrer used:', referrerString || '(empty string)');
        
        // Encode function call data
        const data = iface.encodeFunctionData('makePayment', [
          fromAddress, // User address as recipient, for SBT issuance
          '', // Note (can be empty for frontend payment)
          referrerString, // Referrer (string format)
        ]);
        
        console.log('Parameters for frontend calling contract makePayment:');
        console.log('  - recipient:', fromAddress);
        console.log('  - description:', '(empty string)');
        console.log('  - referrer:', referrerString || '(empty string)');
        console.log('  - Encoded data:', data);

        // Estimate gas (contract calls need more gas)
        let gasLimit = '0x186a0'; // Default 100000
        try {
          const gasEstimate = await ethereum.request({
            method: 'eth_estimateGas',
            params: [
              {
                from: fromAddress,
                to: contractAddress,
                value: amountHex,
                data: data,
              },
            ],
          });
          // Add 20% buffer
          gasLimit = '0x' + (BigInt(gasEstimate) * BigInt(120) / BigInt(100)).toString(16);
        } catch (error) {
          console.warn('Gas estimation failed, using default value:', error);
        }

        // Initiate contract call transaction (add error handling)
        try {
          txHash = await ethereum.request({
            method: 'eth_sendTransaction',
            params: [
              {
                from: fromAddress,
                to: contractAddress,
                value: amountHex,
                data: data, // Contains contract method call data (including referrer)
                gas: gasLimit,
              },
            ],
          });
        } catch (error: any) {
          if (error.code === 4001) {
            throw new Error('User rejected transaction request');
          }
          if (error.code === -32603) {
            throw new Error('Wallet internal error, please refresh page and retry');
          }
          console.error('Failed to send transaction:', error);
          throw new Error(`Failed to send transaction: ${error.message || 'Unknown error'}`);
        }
      } else {
        // If it's a regular wallet address (EOA), use simple transfer (does not support referrer)
        console.warn('Address is a regular wallet address, using simple transfer (does not support referrer)');
        
        try {
          txHash = await ethereum.request({
            method: 'eth_sendTransaction',
            params: [
              {
                from: fromAddress,
                to: paymentInfo.address,
                value: amountHex,
                gas: '0x5208', // 21000 gas limit for simple transfer
              },
            ],
          });
        } catch (error: any) {
          if (error.code === 4001) {
            throw new Error('User rejected transaction request');
          }
          if (error.code === -32603) {
            throw new Error('Wallet internal error, please refresh page and retry');
          }
          console.error('Failed to send transaction:', error);
          throw new Error(`Failed to send transaction: ${error.message || 'Unknown error'}`);
        }
      }

      console.log('Payment transaction sent:', txHash);

      // Wait for transaction confirmation
      let receipt = null;
      let retryCount = 0;
      const maxRetries = 30; // Maximum wait 60 seconds
      while (!receipt && retryCount < maxRetries) {
        try {
          receipt = await ethereum.request({
            method: 'eth_getTransactionReceipt',
            params: [txHash],
          });
        } catch (error) {
          console.warn('Failed to query transaction receipt, retrying...', error);
        }
        if (!receipt) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          retryCount++;
        }
      }
      
      if (!receipt) {
        throw new Error('Transaction confirmation timeout, please manually check transaction status');
      }

      console.log('Transaction confirmed:', receipt);
      console.log('Transaction hash (original):', txHash);
      console.log('Transaction hash type:', typeof txHash);
      console.log('Transaction hash length:', txHash.length);
      console.log('Transaction hash starts with 0x:', txHash.startsWith('0x'));

      // Encode transaction hash as Base64
      const xPayment = btoa(txHash);
      console.log('Transaction hash (Base64 encoded):', xPayment);
      
      // Verify encoding/decoding
      const decodedHash = atob(xPayment);
      console.log('Transaction hash (Base64 decoded for verification):', decodedHash);
      console.log('Encoding/decoding match:', txHash === decodedHash);

      // Close payment modal
      setShowPaymentModal(false);
      setPaymentInfo(null);

      // Resend request with X-PAYMENT header
      await handleGenerateWithPayment(xPayment);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed');
      console.error('Payment error:', err);
    } finally {
      setPaymentLoading(false);
    }
  };

  // Generate request with payment information
  const handleGenerateWithPayment = async (xPayment: string) => {
    setLoading(true);
    setError(null);
    setImageUrl(null);
    setSbtRarity(null); // Reset SBT level

    try {
      // Get referrer from 402 response (stored in paymentInfo)
      // Referrer should come from 402 response, not from URL
      const referrer = paymentInfo?.referrer || '';
      
      const requestUrl = '/api/generate-agent/task';
      
      // Prepare request body
      const requestBody = {
        referrer: referrer || '', // Pass referrer from 402 response in body
      };
      
      console.log('═══════════════════════════════════════════════════════════');
      console.log('🔍 Client: handleGenerateWithPayment Request Details:');
      console.log('  - Request URL:', requestUrl);
      console.log('  - paymentInfo:', paymentInfo);
      console.log('  - paymentInfo?.referrer:', paymentInfo?.referrer);
      console.log('  - Referrer (from 402 response, passed in body):', referrer || '(empty string)');
      console.log('  - Request body object:', requestBody);
      console.log('  - Request body JSON stringified:', JSON.stringify(requestBody));
      console.log('═══════════════════════════════════════════════════════════');
      
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-PAYMENT': xPayment,
        },
        body: JSON.stringify(requestBody),
      });

      // If still returns 402, payment verification failed
      if (response.status === 402) {
        const data = await response.json();
        const errorMsg = data.error || data.accepts?.[0]?.ext?.error || 'Payment verification failed, please retry';
        const errorDetails = data.accepts?.[0]?.ext?.errorDetails || data.accepts?.[0]?.ext || null;
        throw new Error(`${errorMsg}${errorDetails ? '\nError details: ' + JSON.stringify(errorDetails, null, 2) : ''}`);
      }

      const data = await response.json();

      // Unified response format: { code: 200, msg: "success", data: { data: "imageURL" } }
      if (data.code === 200 && data.data?.data) {
        setImageUrl(data.data.data);
      } else {
        // If data.data contains error information, display detailed error
        const errorInfo = data.data?.error || null;
        const errorMsg = data.msg || 'Image generation failed';
        
        if (errorInfo) {
          let errorDetails = '';
          
          if (typeof errorInfo === 'object') {
            // Check if there's a details field containing authorization address information
            const details = errorInfo.details || errorInfo;
            if (details.authorizedMinterAddress || details.currentAddress) {
              // Build error message with address information
              errorDetails = `\n\n[Address Information]\n`;
              if (details.currentAddress) {
                errorDetails += `Current address used (no permission): ${details.currentAddress}\n`;
              }
              if (details.authorizedMinterAddress) {
                errorDetails += `Correct authorized address: ${details.authorizedMinterAddress}\n`;
              }
              errorDetails += `\nPlease ensure the address corresponding to PROMPT_PRIVATE_KEY has been authorized as the contract's minter.\n`;
              
              // Add other error details (if any)
              const otherDetails = { ...details };
              delete otherDetails.authorizedMinterAddress;
              delete otherDetails.currentAddress;
              if (Object.keys(otherDetails).length > 0 && otherDetails.error) {
                errorDetails += `\nOther error details:\n${JSON.stringify(otherDetails, null, 2)}`;
              }
            } else {
              // Regular error details
              errorDetails = `\n\nError details:\n${JSON.stringify(errorInfo, null, 2)}`;
            }
          } else {
            errorDetails = `\n\nError details:\n${String(errorInfo)}`;
          }
          
          throw new Error(`${errorMsg}${errorDetails}`);
        } else {
          throw new Error(errorMsg);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error occurred while generating image');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };


  // Convert Wei to BNB for display
  const weiToBNB = (wei: string): string => {
    try {
      const weiBigInt = BigInt(wei);
      const bnb = Number(weiBigInt) / 1e18;
      return bnb.toFixed(18).replace(/\.?0+$/, ''); // Remove trailing zeros
    } catch {
      return '0';
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      {/* Navigation bar */}
      <nav className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <a href="/" className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                Pan Agent
              </a>
            </div>
            <div className="flex items-center space-x-4">
              <a
                href="/agents"
                className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 px-3 py-2 rounded-md text-sm font-medium"
              >
                A2A Agents
              </a>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <main className="flex w-full max-w-4xl flex-col items-center justify-start py-8 px-4 sm:px-8 md:px-16">
        <div className="w-full space-y-6">
          {/* Title */}
          <div className="text-center">
            <h1 className="text-3xl font-bold text-black dark:text-zinc-50 mb-2">
              {t('home.title')}
            </h1>
            <p className="text-zinc-600 dark:text-zinc-400">
              {t('home.subtitle')}
            </p>
          </div>

          {/* Generate button area */}
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg p-6">
            <p className="text-center text-sm text-zinc-600 dark:text-zinc-400 mb-6">
              {t('home.description')}
            </p>

            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 
                       disabled:bg-zinc-400 disabled:cursor-not-allowed
                       text-white font-medium rounded-lg 
                       transition-colors duration-200
                       flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <span>{t('home.generating')}</span>
                </>
              ) : (
                <span>{t('home.generateButton')}</span>
              )}
            </button>

            {/* Error message */}
            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
              </div>
            )}
          </div>

          {/* Payment modal */}
          {showPaymentModal && paymentInfo && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
                  {t('payment.required')}
                </h2>
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">{t('payment.amount')}：</span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {weiToBNB(paymentInfo.amountWei)} {paymentInfo.currency}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">{t('payment.network')}：</span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {paymentInfo.chain}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">{t('payment.recipient')}：</span>
                    <span className="font-mono text-sm text-zinc-900 dark:text-zinc-100 break-all">
                      {paymentInfo.address}
                    </span>
                  </div>
                  {walletAddress && (
                    <div className="flex justify-between">
                      <span className="text-zinc-600 dark:text-zinc-400">{t('wallet.address')}：</span>
                      <span className="font-mono text-sm text-zinc-900 dark:text-zinc-100 break-all">
                        {walletAddress}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">{t('payment.weiFormat')}：</span>
                    <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 break-all">
                      {paymentInfo.amountWei}
                    </span>
                  </div>
                </div>
                
                {/* If wallet not connected, show connect button */}
                {!walletConnected && (
                  <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-3">
                      {t('wallet.pleaseConnect')}
                    </p>
                    <button
                      onClick={async () => {
                        try {
                          await handleConnectWallet();
                        } catch (err: any) {
                          setError(err.message || t('wallet.connectFailed'));
                        }
                      }}
                      className="w-full py-2 px-4 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors"
                    >
                      {t('wallet.connect')}
                    </button>
                  </div>
                )}
                {/* 402 response data format display */}
                {x402ResponseData && (
                  <div className="mb-4 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
                    <details className="cursor-pointer">
                      <summary className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2 select-none">
                        📋 {t('payment.view402Response')}
                      </summary>
                      <div className="mt-2">
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                          {t('payment.view402ResponseDesc')}
                        </p>
                        <pre className="text-xs text-zinc-600 dark:text-zinc-400 overflow-auto max-h-60 p-2 bg-white dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-700">
                          {JSON.stringify(x402ResponseData, null, 2)}
                        </pre>
                      </div>
                    </details>
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowPaymentModal(false);
                      setPaymentInfo(null);
                      setX402ResponseData(null);
                    }}
                    className="flex-1 px-4 py-2 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-900 dark:text-zinc-100 rounded-lg transition-colors"
                    disabled={paymentLoading}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={handlePayment}
                    disabled={paymentLoading || !walletConnected}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {paymentLoading ? (
                      <>
                        <svg
                          className="animate-spin h-5 w-5"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        <span>{t('payment.paying')}</span>
                      </>
                    ) : (
                      <span>{t('payment.connectAndPay')}</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Image display area */}
          {imageUrl && (
            <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {t('home.generatedImage')}
              </h2>
                {sbtRarity && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">{t('home.sbtLevel')}:</span>
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      sbtRarity === 'S' 
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' 
                        : sbtRarity === 'R'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                    }`}>
                      {sbtRarity === 'S' ? t('home.sbtLevelS') : sbtRarity === 'R' ? t('home.sbtLevelR') : t('home.sbtLevelN')}
                    </span>
                  </div>
                )}
              </div>
              <div className="relative w-full aspect-square bg-zinc-100 dark:bg-zinc-800 rounded-lg overflow-hidden">
                <Image
                  src={imageUrl}
                  alt={t('home.title')}
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
              <div className="mt-4 flex gap-2">
                <a
                  href={imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
                >
                  {t('home.viewOriginal')}
                </a>
                <button
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = imageUrl;
                    link.download = `generated-image-${Date.now()}.png`;
                    link.click();
                  }}
                  className="px-4 py-2 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-900 dark:text-zinc-100 rounded-lg transition-colors text-sm"
                >
                  {t('home.downloadImage')}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
      </div>
    </div>
  );
}
