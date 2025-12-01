/**
 * Transaction Hash Store
 * Store verified transaction hashes to prevent reuse
 */

// Use Set to store verified transaction hashes
const verifiedTxHashes = new Set<string>();

/**
 * Check if transaction hash has been used
 * @param txHash - Transaction hash
 * @returns true if already used, false otherwise
 */
export function isTxHashUsed(txHash: string): boolean {
  return verifiedTxHashes.has(txHash);
}

/**
 * Mark transaction hash as used
 * @param txHash - Transaction hash
 */
export function markTxHashAsUsed(txHash: string): void {
  verifiedTxHashes.add(txHash);
  console.log('✅ Transaction hash marked as used:', txHash);
  console.log('   Total verified txHashes:', verifiedTxHashes.size);
}

/**
 * Get total number of verified transaction hashes
 * @returns Number of verified transaction hashes
 */
export function getVerifiedTxHashCount(): number {
  return verifiedTxHashes.size;
}

