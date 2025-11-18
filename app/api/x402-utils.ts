/**
 * x402 Protocol Standard Format Utility Functions
 * Reference: Coinbase x402 Protocol Specification
 */

import { ethers } from 'ethers';

export interface X402PaymentRequirement {
  scheme: string; // Payment scheme, e.g. "exact"
  network: string; // Blockchain network, e.g. "BSCTest"
  currency: string; // Currency type, e.g. "BNB"
  address: string; // Payment address
  maxAmountRequired: string; // Maximum amount required for payment (Wei format, string)
  resource: string; // URL of the resource that requires payment
  description: string; // Description of the resource
  mimeType: string; // MIME type of the resource response
  ext?: { // Extension field (optional)
    referrer?: string; // Referrer address
    error?: string; // Error message (when validation fails)
    errorDetails?: any; // Error details (when validation fails)
  };
}

export interface X402Response {
  x402Version: number; // Protocol version number
  accepts: X402PaymentRequirement[]; // Array of acceptable payment methods
}

/**
 * Generate x402 standard format payment response
 */
export function createX402Response(
  config: {
    price: string; // Amount in Wei format (string), e.g. "20000000000000000"
    currency: string; // Currency type, e.g. "BNB"
    network: string; // Network name, e.g. "BSCTest"
    address: string; // Payment address
    resource: string; // Resource URL
    description?: string; // Resource description (optional)
    mimeType?: string; // MIME type (optional, default "application/json")
    referrer?: string; // Referrer address (optional)
    error?: string; // Error message (when validation fails, optional)
    errorDetails?: any; // Error details (when validation fails, optional)
  }
): X402Response {
  // price is already in Wei format, use directly
  const maxAmountRequired = config.price;

  // Build resource URL (preserve address query parameter for backward compatibility)
  const resourceUrl = new URL(config.resource);
  resourceUrl.searchParams.set('address', config.address);
  const resource = resourceUrl.toString();

  // Build accepts object
  const acceptsItem: X402PaymentRequirement = {
    scheme: 'exact', // Exact payment scheme
    network: config.network,
    currency: config.currency, // Currency type
    address: config.address, // Payment address
    maxAmountRequired: maxAmountRequired,
    resource: resource,
    description: config.description || `Payment required: ${ethers.formatEther(config.price)} ${config.currency}`,
    mimeType: config.mimeType || 'application/json',
  };

  // Build ext field (if referrer or error exists)
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

