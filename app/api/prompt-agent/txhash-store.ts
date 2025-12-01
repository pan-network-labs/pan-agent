/**
 * Transaction Hash Store
 * Store verified transaction hashes to prevent reuse
 * Uses Redis for persistent storage
 */

// Key prefix for transaction hashes in Redis
const TXHASH_KEY_PREFIX = 'txhash:';
// Expiration time: 24 hours (optional, for cleanup)
const TXHASH_EXPIRE_SECONDS = 24 * 60 * 60; // 24 hours

// Check if Redis is configured
function isRedisConfigured(): boolean {
  return !!process.env.REDIS_URL;
}

// Lazy load Redis client to avoid errors when environment variables are missing
let redisClient: any = null;
async function getRedisClient() {
  // If not configured, return null
  if (!isRedisConfigured()) {
    return null;
  }

  // If already loaded, return cached client
  if (redisClient !== null) {
    return redisClient;
  }

  try {
    // Dynamic import to avoid errors when Redis is not configured
    const Redis = (await import('ioredis')).default;
    redisClient = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });
    
    // Handle connection errors
    redisClient.on('error', (error: any) => {
      console.error('Redis connection error:', error);
    });
    
    console.log('✅ Redis client connected');
    return redisClient;
  } catch (error: any) {
    console.error('Error creating Redis client:', error);
    return null;
  }
}

/**
 * Check if transaction hash has been used
 * @param txHash - Transaction hash
 * @returns true if already used, false otherwise
 */
export async function isTxHashUsed(txHash: string): Promise<boolean> {
  const redis = await getRedisClient();
  
  // If Redis is not available, return false (allow validation to continue)
  if (!redis) {
    return false;
  }

  try {
    const key = `${TXHASH_KEY_PREFIX}${txHash}`;
    const exists = await redis.exists(key);
    return exists === 1;
  } catch (error: any) {
    console.error('Error checking txHash in Redis:', error);
    // If Redis is not available, fallback to false (allow validation to continue)
    // This prevents service disruption if Redis is temporarily unavailable
    return false;
  }
}

/**
 * Mark transaction hash as used
 * @param txHash - Transaction hash
 */
export async function markTxHashAsUsed(txHash: string): Promise<void> {
  const redis = await getRedisClient();
  
  // If Redis is not available, skip marking (log warning only)
  if (!redis) {
    return;
  }

  try {
    const key = `${TXHASH_KEY_PREFIX}${txHash}`;
    // Store with expiration time (24 hours) for automatic cleanup
    await redis.setex(key, TXHASH_EXPIRE_SECONDS, '1');
    console.log('✅ Transaction hash marked as used in Redis:', txHash);
    console.log('   Expires in:', TXHASH_EXPIRE_SECONDS / 3600, 'hours');
  } catch (error: any) {
    console.error('Error marking txHash as used in Redis:', error);
    // Log error but don't throw - validation can still continue
    // This prevents service disruption if Redis is temporarily unavailable
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

