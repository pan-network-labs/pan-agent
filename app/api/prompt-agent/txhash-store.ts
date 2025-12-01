/**
 * Transaction Hash Store
 * Store verified transaction hashes to prevent reuse
 * Uses Vercel KV (Redis) for persistent storage
 */

import { kv } from '@vercel/kv';

// Key prefix for transaction hashes in KV
const TXHASH_KEY_PREFIX = 'txhash:';
// Expiration time: 24 hours (optional, for cleanup)
const TXHASH_EXPIRE_SECONDS = 24 * 60 * 60; // 24 hours

/**
 * Check if transaction hash has been used
 * @param txHash - Transaction hash
 * @returns true if already used, false otherwise
 */
export async function isTxHashUsed(txHash: string): Promise<boolean> {
  try {
    const key = `${TXHASH_KEY_PREFIX}${txHash}`;
    const exists = await kv.exists(key);
    return exists === 1;
  } catch (error) {
    console.error('Error checking txHash in KV:', error);
    // If KV is not available, fallback to false (allow validation to continue)
    // This prevents service disruption if KV is temporarily unavailable
    return false;
  }
}

/**
 * Mark transaction hash as used
 * @param txHash - Transaction hash
 */
export async function markTxHashAsUsed(txHash: string): Promise<void> {
  try {
    const key = `${TXHASH_KEY_PREFIX}${txHash}`;
    // Store with expiration time (24 hours) for automatic cleanup
    await kv.set(key, '1', { ex: TXHASH_EXPIRE_SECONDS });
    console.log('✅ Transaction hash marked as used in KV:', txHash);
    console.log('   Expires in:', TXHASH_EXPIRE_SECONDS / 3600, 'hours');
  } catch (error) {
    console.error('Error marking txHash as used in KV:', error);
    // Log error but don't throw - validation can still continue
    // This prevents service disruption if KV is temporarily unavailable
  }
}

/**
 * Get total number of verified transaction hashes (optional, for monitoring)
 * Note: This may be slow for large datasets, use sparingly
 * @returns Number of verified transaction hashes (approximate)
 */
export async function getVerifiedTxHashCount(): Promise<number> {
  try {
    // Note: KV doesn't have a direct count method
    // This would require scanning all keys, which is expensive
    // For monitoring, consider using a separate counter key
    console.warn('getVerifiedTxHashCount() is not efficient with KV, consider using a counter instead');
    return -1; // Indicate that count is not available
  } catch (error) {
    console.error('Error getting txHash count from KV:', error);
    return -1;
  }
}

