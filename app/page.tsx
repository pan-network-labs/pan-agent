'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ethers } from 'ethers';

interface PaymentInfo {
  address: string;
  amountWei: string; // Wei 格式
  currency: string;
  chain: string;
  referrer?: string; // 推广人地址（可选）
}

// MetaMask 类型声明
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

// 获取正确的 ethereum 提供者（处理多个钱包的情况）
function getEthereumProvider(): EthereumProvider | null {
  if (typeof window === 'undefined' || !window.ethereum) {
    return null;
  }
  
  // 如果 ethereum 是数组，优先选择 MetaMask
  if (Array.isArray(window.ethereum)) {
    // 优先查找 MetaMask
    const metaMask = window.ethereum.find((provider: any) => provider.isMetaMask);
    if (metaMask) {
      return metaMask;
    }
    // 如果没有 MetaMask，使用第一个
    return window.ethereum[0];
  }
  
  // 单个提供者，检查是否是 MetaMask
  if (window.ethereum.isMetaMask) {
    return window.ethereum;
  }
  
  return window.ethereum;
}

// 安全地请求钱包连接（避免 evmAsk.js 错误）
async function safeRequestAccounts(ethereum: EthereumProvider): Promise<string[]> {
  // 首先尝试使用 eth_accounts（如果已经连接过，不会触发选择器）
  try {
    const existingAccounts = await ethereum.request({
      method: 'eth_accounts',
    });
    if (existingAccounts && existingAccounts.length > 0) {
      console.log('使用已连接的账户:', existingAccounts);
      return existingAccounts;
    }
  } catch (error) {
    console.warn('eth_accounts 查询失败:', error);
  }

  // 如果没有已连接的账户，尝试请求连接
  // 添加小延迟，确保用户交互已完成
  await new Promise(resolve => setTimeout(resolve, 100));
  
  try {
    // 方法1: 直接使用 eth_requestAccounts
    return await ethereum.request({
      method: 'eth_requestAccounts',
    });
  } catch (error: any) {
    // 如果失败，再次尝试使用 eth_accounts（可能连接已建立）
    if (error.code === -32603 || error.message?.includes('Unexpected error') || error.message?.includes('evmAsk')) {
      console.warn('eth_requestAccounts 失败（可能是扩展冲突），再次尝试 eth_accounts:', error);
      // 等待一下，让钱包扩展有时间处理
      await new Promise(resolve => setTimeout(resolve, 500));
      try {
        const accounts = await ethereum.request({
          method: 'eth_accounts',
        });
        if (accounts && accounts.length > 0) {
          console.log('通过 eth_accounts 获取到账户:', accounts);
          return accounts;
        }
        // 如果 eth_accounts 也失败，抛出原始错误
        throw new Error('钱包未连接，请手动在 MetaMask 中连接此网站');
      } catch (accountsError: any) {
        throw new Error('无法连接钱包，请确保 MetaMask 已安装并解锁，然后刷新页面重试');
      }
    }
    throw error;
  }
}

export default function Home() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [x402ResponseData, setX402ResponseData] = useState<any>(null); // 存储 402 响应的完整数据

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setImageUrl(null);
    setPaymentInfo(null);
    setShowPaymentModal(false);

    try {
      // 从当前页面的 URL 查询参数中获取 referrer
      const urlParams = new URLSearchParams(window.location.search);
      const referrer = urlParams.get('referrer') || '';
      
      // 构建请求 URL，如果存在 referrer 则添加到查询参数中
      let requestUrl = '/api/generate-agent/task';
      if (referrer) {
        requestUrl += `?referrer=${encodeURIComponent(referrer)}`;
      }
      
      console.log('请求 URL（包含 referrer）:', requestUrl);
      
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      // 检查是否是 402 状态码（需要支付）
      if (response.status === 402) {
        const data = await response.json();
        
        // 保存完整的 402 响应数据（用于调试和显示）
        setX402ResponseData(data);
        console.log('402 响应数据格式:', JSON.stringify(data, null, 2));
        
        // 检查是否是 x402 标准格式
        if (data.x402Version && data.accepts && data.accepts.length > 0) {
          const requirement = data.accepts[0];
          
          // 直接使用 Wei 格式（已经是字符串格式）
          const amountWei = requirement.maxAmountRequired;
          
          // 优先从 accepts 对象中直接获取地址和货币（标准化格式）
          // 如果不存在，则从 resource URL 的查询参数中提取（向后兼容）
          let address = requirement.address || '';
          let currency = requirement.currency || 'BNB';
          
          if (!address) {
            // 向后兼容：从 resource URL 的查询参数中提取地址
            try {
              const resourceUrl = new URL(requirement.resource);
              address = resourceUrl.searchParams.get('address') || '';
            } catch (e) {
              // 如果解析失败，尝试从 resource 中直接匹配地址
              const match = requirement.resource.match(/0x[a-fA-F0-9]{40}/);
              address = match ? match[0] : '';
            }
          }
          
          // 解析 referrer（从 ext.referrer 字段）
          // 优先使用 402 响应中的 referrer，如果没有则使用 URL 中的 referrer
          const referrerFromResponse = requirement.ext?.referrer || '';
          const referrerFromUrl = urlParams.get('referrer') || '';
          const referrer = referrerFromResponse || referrerFromUrl || '';
          
          console.log('Referrer 信息:', {
            fromResponse: referrerFromResponse,
            fromUrl: referrerFromUrl,
            final: referrer,
          });
          
          if (address) {
            // 保存支付信息（使用 Wei 格式）
            setPaymentInfo({
              address: address,
              amountWei: amountWei,
              currency: currency,
              chain: requirement.network,
              referrer: referrer, // 保存 referrer（可能来自 402 响应或 URL）
            });
            setShowPaymentModal(true);
            setLoading(false);
            return;
          } else {
            setError(`需要支付，但未找到收款地址。请查看 x402 响应获取支付地址。`);
            setLoading(false);
            return;
          }
        } else {
          // 向后兼容：旧格式（BNB 格式）
          const priceBNB = data.price || '0.02';
          // 将 BNB 转换为 Wei
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
            setError(`需要支付 ${priceBNB} ${data.currency || 'BNB'}，但未找到收款地址。`);
            setLoading(false);
            return;
          }
        }
      }

      const data = await response.json();

      // 统一响应格式：{ code: 200, msg: "success", data: { data: "图片URL" } }
      if (data.code === 200 && data.data?.data) {
        setImageUrl(data.data.data);
      } else {
        throw new Error(data.msg || '生成图片失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成图片时发生错误');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  // 连接钱包并支付（使用 Wei 格式）
  const handlePayment = async () => {
    if (!paymentInfo) return;

    setPaymentLoading(true);
    try {
      // 获取正确的 ethereum 提供者
      const ethereum = getEthereumProvider();
      
      if (!ethereum) {
        throw new Error('请安装 MetaMask 钱包');
      }

      // 请求连接钱包（使用安全方法，避免 evmAsk.js 错误）
      let accounts: string[];
      try {
        accounts = await safeRequestAccounts(ethereum);
      } catch (error: any) {
        // 处理用户拒绝连接的情况
        if (error.code === 4001) {
          throw new Error('用户拒绝了连接钱包请求');
        }
        // 处理 JSON-RPC 内部错误或 evmAsk.js 错误
        if (error.code === -32603 || error.message?.includes('Unexpected error') || error.message?.includes('evmAsk')) {
          console.error('钱包连接错误（可能是扩展冲突）:', error);
          // 提供更详细的错误信息
          throw new Error('钱包连接失败。请尝试：1) 刷新页面 2) 确保只启用 MetaMask 扩展 3) 在 MetaMask 中手动连接此网站');
        } else {
          // 处理其他错误
          console.error('连接钱包失败:', error);
          throw new Error(error.message || `连接钱包失败: ${error.message || '未知错误'}`);
        }
      }

      if (!accounts || accounts.length === 0) {
        throw new Error('请连接钱包');
      }

      const fromAddress = accounts[0];

      // 获取网络信息（添加错误处理）
      let chainId: string;
      try {
        chainId = await ethereum.request({ method: 'eth_chainId' });
      } catch (error: any) {
        console.error('获取链 ID 失败:', error);
        throw new Error(`获取网络信息失败: ${error.message || '未知错误'}`);
      }
      
      // BSC Testnet chainId: 0x61 (97)
      const bscTestnetChainId = '0x61';
      
      if (chainId !== bscTestnetChainId) {
        // 尝试切换到 BSC Testnet
        try {
          await ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: bscTestnetChainId }],
          });
        } catch (switchError: any) {
          // 如果链不存在，添加链
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
              console.error('添加链失败:', addError);
              throw new Error(`添加 BSC Testnet 失败: ${addError.message || '未知错误'}`);
            }
          } else if (switchError.code === 4001) {
            throw new Error('用户拒绝了切换网络请求');
          } else {
            console.error('切换网络失败:', switchError);
            throw new Error(`切换网络失败: ${switchError.message || '未知错误'}`);
          }
        }
      }

      // 检查地址是否是合约地址（通过检查 code 是否为空）
      const provider = new ethers.BrowserProvider(ethereum);
      const code = await provider.getCode(paymentInfo.address);
      const isContract = code && code !== '0x';
      
      // 将 Wei 字符串转换为十六进制
      const amountHex = '0x' + BigInt(paymentInfo.amountWei).toString(16);
      
      let txHash: string;
      
      if (isContract) {
        // 如果是合约地址，调用合约的 makePayment 方法（支持 referrer）
        const contractAddress = paymentInfo.address;
        
        // 准备合约调用数据
        // 合约方法：makePayment(address recipient, string memory description, string memory referrer) payable returns (uint256 tokenId)
        const iface = new ethers.Interface([
          'function makePayment(address recipient, string memory description, string memory referrer) payable returns (uint256 tokenId)'
        ]);
        
        // 从 URL 中获取 referrer（优先使用 URL 中的 referrer，因为这是用户输入的）
        const urlParams = new URLSearchParams(window.location.search);
        const referrerFromUrl = urlParams.get('referrer') || '';
        // 优先使用 URL 中的 referrer，如果没有则使用 paymentInfo 中的 referrer
        const referrerString = referrerFromUrl || paymentInfo.referrer || '';
        
        console.log('前端支付时 referrer 信息:');
        console.log('  - 当前页面 URL:', window.location.href);
        console.log('  - 从 URL 获取的 referrer:', referrerFromUrl || '(空字符串)');
        console.log('  - paymentInfo.referrer:', paymentInfo.referrer || '(空字符串)');
        console.log('  - 最终使用的 referrer:', referrerString || '(空字符串)');
        
        // 编码函数调用数据
        const data = iface.encodeFunctionData('makePayment', [
          fromAddress, // 用户地址作为 recipient，用于发放 SBT
          '', // 备注信息（前端支付时可以为空）
          referrerString, // 推广人（字符串格式）
        ]);
        
        console.log('前端调用合约 makePayment 的参数:');
        console.log('  - recipient:', fromAddress);
        console.log('  - description:', '(空字符串)');
        console.log('  - referrer:', referrerString || '(空字符串)');
        console.log('  - 编码后的 data:', data);

        // 估算 gas（合约调用需要更多 gas）
        let gasLimit = '0x186a0'; // 默认 100000
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
          // 增加 20% 的缓冲
          gasLimit = '0x' + (BigInt(gasEstimate) * BigInt(120) / BigInt(100)).toString(16);
        } catch (error) {
          console.warn('Gas 估算失败，使用默认值:', error);
        }

        // 发起合约调用交易（添加错误处理）
        try {
          txHash = await ethereum.request({
            method: 'eth_sendTransaction',
            params: [
              {
                from: fromAddress,
                to: contractAddress,
                value: amountHex,
                data: data, // 包含合约方法调用数据（包括 referrer）
                gas: gasLimit,
              },
            ],
          });
        } catch (error: any) {
          if (error.code === 4001) {
            throw new Error('用户拒绝了交易请求');
          }
          if (error.code === -32603) {
            throw new Error('钱包内部错误，请刷新页面重试');
          }
          console.error('发送交易失败:', error);
          throw new Error(`发送交易失败: ${error.message || '未知错误'}`);
        }
      } else {
        // 如果是普通钱包地址（EOA），使用简单转账（不支持 referrer）
        console.warn('地址是普通钱包地址，使用简单转账（不支持 referrer）');
        
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
            throw new Error('用户拒绝了交易请求');
          }
          if (error.code === -32603) {
            throw new Error('钱包内部错误，请刷新页面重试');
          }
          console.error('发送交易失败:', error);
          throw new Error(`发送交易失败: ${error.message || '未知错误'}`);
        }
      }

      console.log('支付交易已发送:', txHash);

      // 等待交易确认
      let receipt = null;
      let retryCount = 0;
      const maxRetries = 30; // 最多等待 60 秒
      while (!receipt && retryCount < maxRetries) {
        try {
          receipt = await ethereum.request({
            method: 'eth_getTransactionReceipt',
            params: [txHash],
          });
        } catch (error) {
          console.warn('查询交易收据失败，重试中...', error);
        }
        if (!receipt) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          retryCount++;
        }
      }
      
      if (!receipt) {
        throw new Error('交易确认超时，请手动检查交易状态');
      }

      console.log('交易已确认:', receipt);

      // 将交易哈希编码为 Base64
      const xPayment = btoa(txHash);

      // 关闭支付弹窗
      setShowPaymentModal(false);
      setPaymentInfo(null);

      // 重新发送请求，带上 X-PAYMENT 头
      await handleGenerateWithPayment(xPayment);
    } catch (err) {
      setError(err instanceof Error ? err.message : '支付失败');
      console.error('支付错误:', err);
    } finally {
      setPaymentLoading(false);
    }
  };

  // 带支付信息的生成请求
  const handleGenerateWithPayment = async (xPayment: string) => {
    setLoading(true);
    setError(null);
    setImageUrl(null);

    try {
      // 从 URL 中获取 referrer，确保在请求中包含
      const urlParams = new URLSearchParams(window.location.search);
      const referrer = urlParams.get('referrer') || '';
      
      // 构建请求 URL，如果存在 referrer 则添加到查询参数中
      let requestUrl = '/api/generate-agent/task';
      if (referrer) {
        requestUrl += `?referrer=${encodeURIComponent(referrer)}`;
      }
      
      console.log('handleGenerateWithPayment 请求 URL（包含 referrer）:', requestUrl);
      
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-PAYMENT': xPayment,
        },
        body: JSON.stringify({}),
      });

      // 如果仍然返回 402，说明支付验证失败
      if (response.status === 402) {
        const data = await response.json();
        throw new Error(data.error || '支付验证失败，请重试');
      }

      const data = await response.json();

      // 统一响应格式：{ code: 200, msg: "success", data: { data: "图片URL" } }
      if (data.code === 200 && data.data?.data) {
        setImageUrl(data.data.data);
      } else {
        throw new Error(data.msg || '生成图片失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成图片时发生错误');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };


  // 将 Wei 转换为 BNB 用于显示
  const weiToBNB = (wei: string): string => {
    try {
      const weiBigInt = BigInt(wei);
      const bnb = Number(weiBigInt) / 1e18;
      return bnb.toFixed(18).replace(/\.?0+$/, ''); // 移除尾随零
    } catch {
      return '0';
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      {/* 导航栏 */}
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
          {/* 标题 */}
          <div className="text-center">
            <h1 className="text-3xl font-bold text-black dark:text-zinc-50 mb-2">
              智谱AI 图片生成测试
            </h1>
            <p className="text-zinc-600 dark:text-zinc-400">
              CogView-3-Flash 模型
            </p>
          </div>

          {/* 生成按钮区域 */}
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg p-6">
            <p className="text-center text-sm text-zinc-600 dark:text-zinc-400 mb-6">
              点击按钮即可生成图片，系统会自动调用 Prompt Agent 生成优化的提示词
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
                  <span>生成中...</span>
                </>
              ) : (
                <span>生成图片</span>
              )}
            </button>

            {/* 错误提示 */}
            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
              </div>
            )}
          </div>

          {/* 支付弹窗 */}
          {showPaymentModal && paymentInfo && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
                  需要支付
                </h2>
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">金额：</span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {weiToBNB(paymentInfo.amountWei)} {paymentInfo.currency}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">网络：</span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {paymentInfo.chain}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">收款地址：</span>
                    <span className="font-mono text-sm text-zinc-900 dark:text-zinc-100 break-all">
                      {paymentInfo.address}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">Wei 格式：</span>
                    <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 break-all">
                      {paymentInfo.amountWei}
                    </span>
                  </div>
                </div>
                {/* 402 响应数据格式显示 */}
                {x402ResponseData && (
                  <div className="mb-4 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
                    <details className="cursor-pointer">
                      <summary className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2 select-none">
                        📋 查看 402 响应数据格式
                      </summary>
                      <div className="mt-2">
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                          这是从服务器接收到的完整 402 响应数据（x402 标准格式）：
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
                      setX402ResponseData(null); // 清空 402 响应数据
                    }}
                    className="flex-1 px-4 py-2 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-900 dark:text-zinc-100 rounded-lg transition-colors"
                    disabled={paymentLoading}
                  >
                    取消
                  </button>
                  <button
                    onClick={handlePayment}
                    disabled={paymentLoading}
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
                        <span>支付中...</span>
                      </>
                    ) : (
                      <span>连接钱包并支付</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 图片展示区域 */}
          {imageUrl && (
            <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg p-6">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
                生成的图片
              </h2>
              <div className="relative w-full aspect-square bg-zinc-100 dark:bg-zinc-800 rounded-lg overflow-hidden">
                <Image
                  src={imageUrl}
                  alt="生成的图片"
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
                  查看原图
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
                  下载图片
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
