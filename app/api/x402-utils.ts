/**
 * x402 协议标准格式工具函数
 * 参考：Coinbase x402 协议规范
 */

import { ethers } from 'ethers';

export interface X402PaymentRequirement {
  scheme: string; // 支付方案，如 "exact"
  network: string; // 区块链网络，如 "BSCTest"
  currency: string; // 货币类型，如 "BNB"
  address: string; // 收款地址
  maxAmountRequired: string; // 所需支付的最大金额（Wei 格式，字符串）
  resource: string; // 需要支付的资源的 URL
  description: string; // 资源的描述
  mimeType: string; // 资源响应的 MIME 类型
  ext?: { // 扩展字段（可选）
    referrer?: string; // 推广人地址
    error?: string; // 错误信息（验证失败时）
    errorDetails?: any; // 错误详情（验证失败时）
  };
}

export interface X402Response {
  x402Version: number; // 协议版本号
  accepts: X402PaymentRequirement[]; // 可接受的支付方式数组
}

/**
 * 生成 x402 标准格式的支付响应
 */
export function createX402Response(
  config: {
    price: string; // Wei 格式的金额（字符串），如 "20000000000000000"
    currency: string; // 货币类型，如 "BNB"
    network: string; // 网络名称，如 "BSCTest"
    address: string; // 收款地址
    resource: string; // 资源 URL
    description?: string; // 资源描述（可选）
    mimeType?: string; // MIME 类型（可选，默认 "application/json"）
    referrer?: string; // 推广人地址（可选）
    error?: string; // 错误信息（验证失败时，可选）
    errorDetails?: any; // 错误详情（验证失败时，可选）
  }
): X402Response {
  // price 已经是 Wei 格式，直接使用
  const maxAmountRequired = config.price;

  // 构建 resource URL（保留地址查询参数以保持向后兼容）
  const resourceUrl = new URL(config.resource);
  resourceUrl.searchParams.set('address', config.address);
  const resource = resourceUrl.toString();

  // 构建 accepts 对象
  const acceptsItem: X402PaymentRequirement = {
    scheme: 'exact', // 精确支付方案
    network: config.network,
    currency: config.currency, // 货币类型
    address: config.address, // 收款地址
    maxAmountRequired: maxAmountRequired,
    resource: resource,
    description: config.description || `Payment required: ${ethers.formatEther(config.price)} ${config.currency}`,
    mimeType: config.mimeType || 'application/json',
  };

  // 构建 ext 字段（如果有 referrer 或 error）
  if (config.referrer || config.error) {
    acceptsItem.ext = {};
    if (config.referrer) {
      acceptsItem.ext.referrer = config.referrer;
    }
    if (config.error) {
      acceptsItem.ext.error = config.error;
      if (config.errorDetails) {
        acceptsItem.ext.errorDetails = config.errorDetails;
      }
    }
  }

  return {
    x402Version: 1,
    accepts: [acceptsItem],
  };
}

