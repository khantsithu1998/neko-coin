/**
 * ========================================
 * NEKO CHAIN - LEVELDB STORAGE MODULE
 * ========================================
 * 
 * This module handles persistent storage of the blockchain using LevelDB.
 * 
 * EDUCATIONAL NOTES:
 * ==================
 * 
 * 1. WHY LEVELDB?
 *    - Fast key-value store optimized for blockchain use
 *    - Used by Bitcoin Core for storing blocks and UTXO set
 *    - Embedded database (no separate server needed)
 *    - Supports sorted iteration (useful for block heights)
 * 
 * 2. DATA STRUCTURE
 *    Key prefixes used:
 *    - block:{hash}     → Full block data (JSON)
 *    - height:{index}   → Block hash at that height
 *    - tx:{hash}        → Transaction location (blockHash)
 *    - meta:chainLength → Current chain length
 *    - meta:difficulty  → Current difficulty
 *    - pending:{hash}   → Pending transaction data
 * 
 * 3. CONSISTENCY
 *    - Writes are atomic within a batch
 *    - On crash, data is recoverable
 *    - Chain state is always consistent
 */

const { Level } = require('level');
const path = require('path');

class Storage {
    /**
     * Create a new storage instance.
     * 
     * @param {string} dataDir - Directory for the database files
     */
    constructor(dataDir = './blockchain-data') {
        this.dataDir = dataDir;
        this.db = null;
        this.isOpen = false;
    }

    /**
     * Initialize and open the database.
     */
    async open() {
        if (this.isOpen) return;

        console.log(`💾 Opening database at: ${path.resolve(this.dataDir)}`);

        this.db = new Level(this.dataDir, { valueEncoding: 'json' });
        await this.db.open();
        this.isOpen = true;

        console.log(`✅ Database opened successfully`);
    }

    /**
     * Close the database.
     */
    async close() {
        if (!this.isOpen) return;

        await this.db.close();
        this.isOpen = false;
        console.log(`💾 Database closed`);
    }

    // ========================================
    // BLOCK OPERATIONS
    // ========================================

    /**
     * Save a block to the database.
     * 
     * @param {Block} block - The block to save
     */
    async saveBlock(block) {
        const batch = this.db.batch();

        // Save block by hash
        batch.put(`block:${block.hash}`, {
            index: block.index,
            timestamp: block.timestamp,
            transactions: block.transactions,
            previousHash: block.previousHash,
            hash: block.hash,
            nonce: block.nonce
        });

        // Save height to hash mapping
        batch.put(`height:${block.index}`, block.hash);

        // Index all transactions in this block
        for (const tx of block.transactions) {
            // Create a simple hash for transaction lookup
            const txId = this.hashTransaction(tx);
            batch.put(`tx:${txId}`, {
                blockHash: block.hash,
                blockIndex: block.index
            });
        }

        // Update chain length
        batch.put('meta:chainLength', block.index + 1);

        await batch.write();

        console.log(`💾 Block #${block.index} saved to disk`);
    }

    /**
     * Load a block by its hash.
     * 
     * @param {string} hash - Block hash
     * @returns {Object|null} Block data or null if not found
     */
    async getBlockByHash(hash) {
        try {
            return await this.db.get(`block:${hash}`);
        } catch (error) {
            if (error.code === 'LEVEL_NOT_FOUND') {
                return null;
            }
            throw error;
        }
    }

    /**
     * Load a block by its height (index).
     * 
     * @param {number} index - Block index
     * @returns {Object|null} Block data or null if not found
     */
    async getBlockByHeight(index) {
        try {
            const hash = await this.db.get(`height:${index}`);
            return await this.getBlockByHash(hash);
        } catch (error) {
            if (error.code === 'LEVEL_NOT_FOUND') {
                return null;
            }
            throw error;
        }
    }

    /**
     * Load the entire blockchain from disk.
     * 
     * @returns {Array} Array of block data
     */
    async loadChain() {
        const chainLength = await this.getChainLength();
        const chain = [];

        console.log(`💾 Loading ${chainLength} blocks from disk...`);

        for (let i = 0; i < chainLength; i++) {
            const block = await this.getBlockByHeight(i);
            if (block) {
                chain.push(block);
            }
        }

        console.log(`✅ Loaded ${chain.length} blocks`);
        return chain;
    }

    /**
     * Get the current chain length.
     * 
     * @returns {number} Chain length (0 if empty)
     */
    async getChainLength() {
        try {
            return await this.db.get('meta:chainLength');
        } catch (error) {
            if (error.code === 'LEVEL_NOT_FOUND') {
                return 0;
            }
            throw error;
        }
    }

    // ========================================
    // PENDING TRANSACTION OPERATIONS
    // ========================================

    /**
     * Save a pending transaction.
     * 
     * @param {Transaction} tx - Transaction to save
     */
    async savePendingTransaction(tx) {
        const txId = this.hashTransaction(tx);
        await this.db.put(`pending:${txId}`, {
            senderAddress: tx.senderAddress,
            receiverAddress: tx.receiverAddress,
            amount: tx.amount,
            timestamp: tx.timestamp,
            signature: tx.signature
        });
    }

    /**
     * Remove a pending transaction.
     * 
     * @param {Transaction} tx - Transaction to remove
     */
    async removePendingTransaction(tx) {
        const txId = this.hashTransaction(tx);
        try {
            await this.db.del(`pending:${txId}`);
        } catch (error) {
            // Ignore if not found
        }
    }

    /**
     * Load all pending transactions.
     * 
     * @returns {Array} Array of pending transactions
     */
    async loadPendingTransactions() {
        const pending = [];

        for await (const [key, value] of this.db.iterator({
            gte: 'pending:',
            lte: 'pending:\xFF'
        })) {
            pending.push(value);
        }

        console.log(`💾 Loaded ${pending.length} pending transactions`);
        return pending;
    }

    /**
     * Clear all pending transactions.
     */
    async clearPendingTransactions() {
        const batch = this.db.batch();

        for await (const [key] of this.db.iterator({
            gte: 'pending:',
            lte: 'pending:\xFF',
            values: false
        })) {
            batch.del(key);
        }

        await batch.write();
    }

    // ========================================
    // UTILITY METHODS
    // ========================================

    /**
     * Create a simple hash for transaction identification.
     * 
     * @param {Object} tx - Transaction object
     * @returns {string} Simple hash string
     */
    hashTransaction(tx) {
        const crypto = require('crypto');
        const data = `${tx.senderAddress}${tx.receiverAddress}${tx.amount}${tx.timestamp}`;
        return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
    }

    /**
     * Check if the database is empty (no blocks).
     * 
     * @returns {boolean} True if empty
     */
    async isEmpty() {
        const length = await this.getChainLength();
        return length === 0;
    }

    /**
     * Get database statistics.
     * 
     * @returns {Object} Stats object
     */
    async getStats() {
        let blockCount = 0;
        let txCount = 0;
        let pendingCount = 0;

        for await (const [key] of this.db.iterator({ values: false })) {
            if (key.startsWith('block:')) blockCount++;
            if (key.startsWith('tx:')) txCount++;
            if (key.startsWith('pending:')) pendingCount++;
        }

        return {
            blocks: blockCount,
            transactions: txCount,
            pending: pendingCount,
            dataDir: path.resolve(this.dataDir)
        };
    }

    /**
     * Clear all data (use with caution!).
     */
    async clear() {
        console.log('⚠️  Clearing all blockchain data...');
        await this.db.clear();
        console.log('✅ Database cleared');
    }
}

module.exports = Storage;
