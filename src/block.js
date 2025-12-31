/**
 * ========================================
 * NEKO COIN - BLOCK MODULE
 * ========================================
 * 
 * This module defines the Block class, the fundamental unit of the blockchain.
 * 
 * EDUCATIONAL NOTES:
 * ==================
 * 
 * 1. WHAT IS A BLOCK?
 *    - A container that holds multiple transactions
 *    - Has a unique hash (like a fingerprint)
 *    - Links to the previous block via previousHash
 *    - This creates an unbreakable chain of blocks
 * 
 * 2. HOW BLOCKS CREATE A CHAIN
 *    - Each block stores the hash of the previous block
 *    - If you change any data in a block, its hash changes
 *    - This breaks the link to the next block
 *    - You'd have to recalculate ALL subsequent blocks
 *    - This makes the blockchain tamper-resistant
 * 
 * 3. WHAT IS PROOF OF WORK (MINING)?
 *    - A computational puzzle that takes time to solve
 *    - Miners must find a "nonce" value that makes the hash start with zeros
 *    - More zeros required = harder puzzle = more computation needed
 *    - This prevents spam and controls block creation rate
 *    - The miner who solves it first gets the reward
 * 
 * 4. HOW MINING SECURES THE BLOCKCHAIN
 *    - To change old transactions, you'd need to re-mine all blocks
 *    - This requires enormous computational power
 *    - It's more profitable to mine honestly than to attack
 */

const SHA256 = require('crypto-js/sha256');

class Block {
    /**
     * Create a new block.
     * 
     * @param {number} index - Position in the blockchain (0 = genesis)
     * @param {number} timestamp - When the block was created
     * @param {Transaction[]} transactions - Array of transactions in this block
     * @param {string} previousHash - Hash of the previous block
     */
    constructor(index, timestamp, transactions, previousHash = '') {
        this.index = index;                    // Block number in chain
        this.timestamp = timestamp;            // Creation time
        this.transactions = transactions;      // List of transactions
        this.previousHash = previousHash;      // Link to previous block
        this.nonce = 0;                        // Number used in mining
        this.hash = this.calculateHash();      // This block's hash
    }

    /**
     * Calculate the hash of this block.
     * 
     * The hash is created from ALL block data:
     * - index, timestamp, transactions, previousHash, nonce
     * 
     * Any change to any of these values = different hash
     * This is what makes Bitcoin tamper-proof
     * 
     * @returns {string} SHA-256 hash of the block
     */
    calculateHash() {
        return SHA256(
            this.index +
            this.timestamp +
            JSON.stringify(this.transactions) +
            this.previousHash +
            this.nonce
        ).toString();
    }

    /**
     * Mine the block (Proof of Work).
     * 
     * HOW PROOF OF WORK WORKS:
     * ========================
     * 
     * 1. We want to find a hash that starts with N zeros
     *    - Example: difficulty 4 means hash must start with "0000"
     * 
     * 2. We can't control what the hash will be
     *    - Hashes look random (but are deterministic)
     * 
     * 3. So we add a "nonce" (Number used ONCE)
     *    - We keep changing the nonce and recalculating the hash
     *    - Eventually we find a nonce that gives us zeros
     * 
     * 4. This is called "mining" because:
     *    - You're searching for a valid hash like mining for gold
     *    - It takes work (computation) to find
     *    - The miner who finds it first wins the reward
     * 
     * WHY IS THIS SECURE?
     * - Finding the right nonce takes many attempts (trial and error)
     * - But verifying the answer is instant (just calculate the hash once)
     * - This asymmetry is key to blockchain security
     * 
     * @param {number} difficulty - Number of leading zeros required
     */
    mineBlock(difficulty) {
        // Create a string of zeros to compare against
        const target = Array(difficulty + 1).join('0');

        console.log(`\n⛏️  Mining block ${this.index}...`);
        console.log(`   Target: Hash must start with "${target}"`);

        const startTime = Date.now();
        let attempts = 0;

        // Keep trying different nonce values until we find a valid hash
        while (this.hash.substring(0, difficulty) !== target) {
            this.nonce++;
            this.hash = this.calculateHash();
            attempts++;

            // Show progress every 10000 attempts
            if (attempts % 10000 === 0) {
                process.stdout.write(`\r   Attempts: ${attempts.toLocaleString()}`);
            }
        }

        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        console.log(`\n✅ Block mined!`);
        console.log(`   Hash:     ${this.hash}`);
        console.log(`   Nonce:    ${this.nonce}`);
        console.log(`   Attempts: ${attempts.toLocaleString()}`);
        console.log(`   Time:     ${duration.toFixed(2)} seconds`);
    }

    /**
     * Validate all transactions in this block.
     * 
     * @returns {boolean} True if all transactions are valid
     */
    hasValidTransactions() {
        for (const tx of this.transactions) {
            if (!tx.isValid()) {
                return false;
            }
        }
        return true;
    }

    /**
     * Get block info for display.
     * 
     * @returns {Object} Block information
     */
    getInfo() {
        return {
            index: this.index,
            timestamp: new Date(this.timestamp).toISOString(),
            transactionCount: this.transactions.length,
            previousHash: this.previousHash,
            hash: this.hash,
            nonce: this.nonce
        };
    }
}

module.exports = Block;
