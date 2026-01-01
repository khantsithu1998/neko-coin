/**
 * ========================================
 * NEKO CHAIN - BLOCKCHAIN MODULE
 * ========================================
 * 
 * This is the main class that manages the entire blockchain.
 * 
 * EDUCATIONAL NOTES:
 * ==================
 * 
 * 1. WHAT IS A BLOCKCHAIN?
 *    - A chain of blocks, each containing transactions
 *    - Each block references the previous block's hash
 *    - This creates an immutable, tamper-proof ledger
 *    - Anyone can verify the entire history is valid
 * 
 * 2. THE GENESIS BLOCK
 *    - The first block in the chain
 *    - Has no previous block (previousHash = "0")
 *    - Created when the blockchain is initialized
 *    - All other blocks are descendants of this block
 * 
 * 3. HOW BALANCES WORK
 *    - There's no "balance" field stored anywhere!
 *    - Balance is calculated by scanning ALL transactions
 *    - Add coins when address is receiver
 *    - Subtract coins when address is sender
 *    - This is similar to how Bitcoin works (UTXO model simplified)
 * 
 * 4. PENDING TRANSACTIONS
 *    - Transactions wait in a "pool" until mined
 *    - Mining creates a new block with all pending transactions
 *    - After mining, pending transactions are cleared
 */

const Block = require('./block');
const Transaction = require('./transaction');

class Blockchain {
    /**
     * Create a new blockchain.
     * Initializes with a genesis block or loads from storage.
     * 
     * @param {Storage} storage - Optional storage instance for persistence
     */
    constructor(storage = null) {
        this.chain = [];
        this.pendingTransactions = [];
        this.difficulty = 4;
        this.miningReward = 50;
        this.storage = storage;
        this.initialized = false;
    }

    /**
     * Initialize the blockchain.
     * Loads from storage if available, otherwise creates genesis block.
     */
    async initialize() {
        if (this.initialized) return;

        if (this.storage) {
            await this.storage.open();

            // Check if we have existing data
            if (await this.storage.isEmpty()) {
                // No existing data, create genesis block
                console.log('🌟 Creating Genesis Block...');
                const genesis = this.createGenesisBlock();
                this.chain = [genesis];
                await this.storage.saveBlock(genesis);
            } else {
                // Load existing chain from storage
                console.log('💾 Loading blockchain from disk...');
                const chainData = await this.storage.loadChain();

                if (chainData.length === 0) {
                    // Storage corrupted or empty - recreate genesis
                    console.log('⚠️  No blocks found, creating genesis...');
                    const genesis = this.createGenesisBlock();
                    this.chain = [genesis];
                    await this.storage.saveBlock(genesis);
                } else {
                    this.chain = chainData.map(blockData => {
                        const block = new Block(
                            blockData.index,
                            blockData.timestamp,
                            blockData.transactions,
                            blockData.previousHash
                        );
                        block.hash = blockData.hash;
                        block.nonce = blockData.nonce;
                        return block;
                    });
                }

                // Load pending transactions
                const pendingData = await this.storage.loadPendingTransactions();
                this.pendingTransactions = pendingData.map(txData => {
                    const tx = new Transaction(txData.senderAddress, txData.receiverAddress, txData.amount);
                    tx.timestamp = txData.timestamp;
                    tx.signature = txData.signature;
                    return tx;
                });
            }
        } else {
            // In-memory mode (no persistence)
            console.log('🌟 Creating Genesis Block...');
            this.chain = [this.createGenesisBlock()];
        }

        this.initialized = true;
        console.log('🐱 Neko Chain Blockchain initialized!');
        console.log(`   Chain length: ${this.chain.length} blocks`);
        console.log(`   Difficulty: ${this.difficulty} (hash must start with ${'0'.repeat(this.difficulty)})`);
        console.log(`   Mining Reward: ${this.miningReward} NEKO`);
        console.log(`   Storage: ${this.storage ? 'LevelDB (persistent)' : 'In-memory (volatile)'}`);
    }

    /**
     * Create the genesis block (first block in the chain).
     * 
     * WHY A GENESIS BLOCK?
     * - Every block needs a previousHash, but the first block has no previous
     * - Genesis block uses "0" as its previousHash
     * - It's the foundation of the entire blockchain
     * - Often contains a special message (Bitcoin's genesis has a newspaper headline)
     * 
     * @returns {Block} The genesis block
     */
    createGenesisBlock() {
        console.log('🌟 Creating Genesis Block...');
        const genesisBlock = new Block(
            0,                              // Index 0 = first block
            Date.now(),                     // Current timestamp
            [],                             // No transactions in genesis
            '0'                             // No previous hash
        );
        return genesisBlock;
    }

    /**
     * Get the most recent block in the chain.
     * Needed to get the previousHash for the next block.
     * 
     * @returns {Block} The latest block
     */
    getLatestBlock() {
        return this.chain[this.chain.length - 1];
    }

    /**
     * Add a transaction to the pending pool.
     * The transaction will be included in the next mined block.
     * 
     * @param {Transaction} transaction - The transaction to add
     * @throws {Error} If transaction is invalid
     */
    async addTransaction(transaction) {
        // Validate the transaction
        if (!transaction.senderAddress && transaction.senderAddress !== null) {
            throw new Error('Transaction must have a sender address');
        }

        if (!transaction.receiverAddress) {
            throw new Error('Transaction must have a receiver address');
        }

        // Verify the transaction is valid (signature check)
        if (!transaction.isValid()) {
            throw new Error('Cannot add invalid transaction to the chain');
        }

        // Check if sender has enough balance (except for mining rewards)
        if (transaction.senderAddress !== null) {
            const balance = this.getBalance(transaction.senderAddress);
            if (balance < transaction.amount) {
                throw new Error(`Insufficient balance! Have: ${balance}, Need: ${transaction.amount}`);
            }
        }

        // Add to pending transactions pool
        this.pendingTransactions.push(transaction);
        console.log(`📝 Transaction added to pending pool: ${transaction.toString()}`);

        // Save to persistent storage if available
        if (this.storage) {
            await this.storage.savePendingTransaction(transaction);
        }

        return transaction;
    }

    /**
     * Mine all pending transactions into a new block.
     * 
     * HOW MINING WORKS (STEP BY STEP):
     * =================================
     * 
     * 1. Create a mining reward transaction
     *    - Sender is null (coins created from nothing)
     *    - Receiver is the miner's address
     *    - This is how new coins enter circulation
     * 
     * 2. Create a new block with pending transactions
     *    - includes the mining reward
     *    - Links to previous block via hash
     * 
     * 3. Mine the block (Proof of Work)
     *    - Find a nonce that makes hash start with zeros
     *    - This takes computational work
     * 
     * 4. Add the block to the chain
     *    - Clear pending transactions
     *    - Block is now permanent
     * 
     * @param {string} minerAddress - Address to receive mining reward
     * @returns {Block} The newly mined block
     */
    async minePendingTransactions(minerAddress) {
        // Create the mining reward transaction
        // Notice: senderAddress is null - coins are created from nothing!
        const rewardTransaction = new Transaction(
            null,                           // No sender (new coins)
            minerAddress,                   // Goes to the miner
            this.miningReward               // The reward amount
        );

        // Add reward to pending transactions
        this.pendingTransactions.push(rewardTransaction);

        // Create a new block with all pending transactions
        const newBlock = new Block(
            this.chain.length,              // Next index in chain
            Date.now(),                     // Current time
            this.pendingTransactions,       // All pending transactions
            this.getLatestBlock().hash      // Link to previous block
        );

        // Mine the block (find valid hash through Proof of Work)
        newBlock.mineBlock(this.difficulty);

        // Add the mined block to the chain
        this.chain.push(newBlock);
        console.log(`\n📦 Block ${newBlock.index} added to blockchain!`);

        // Save to persistent storage if available
        if (this.storage) {
            await this.storage.saveBlock(newBlock);
            await this.storage.clearPendingTransactions();
        }

        // Clear pending transactions (they're now in the block)
        this.pendingTransactions = [];

        return newBlock;
    }

    /**
     * Calculate the balance of an address.
     * 
     * HOW BALANCE CALCULATION WORKS:
     * ==============================
     * 
     * There's no "balance" stored anywhere in the blockchain!
     * To find a balance, we scan EVERY transaction in EVERY block:
     * 
     * 1. Start with balance = 0
     * 2. For each transaction where address is RECEIVER: add amount
     * 3. For each transaction where address is SENDER: subtract amount
     * 4. The result is the current balance
     * 
     * This is why "full nodes" need to store the entire blockchain -
     * you need the full history to calculate any balance!
     * 
     * @param {string} address - The wallet address to check
     * @returns {number} The current balance
     */
    getBalance(address) {
        let balance = 0;

        // Scan through every block in the chain
        for (const block of this.chain) {
            // Look at every transaction in each block
            for (const tx of block.transactions) {
                // If we received coins, add to balance
                if (tx.receiverAddress === address) {
                    balance += tx.amount;
                }

                // If we sent coins, subtract from balance
                if (tx.senderAddress === address) {
                    balance -= tx.amount;
                }
            }
        }

        return balance;
    }

    /**
     * Check if the blockchain is valid.
     * 
     * BLOCKCHAIN VALIDATION:
     * ======================
     * 
     * For each block (except genesis), we verify:
     * 1. The stored hash matches the calculated hash
     * 2. The previousHash matches the previous block's hash
     * 3. All transactions in the block are valid
     * 
     * If ANY of these fail, the chain is invalid!
     * This is how tampering is detected.
     * 
     * @returns {boolean} True if the entire blockchain is valid
     */
    isChainValid() {
        console.log('\n🔍 Validating blockchain...');

        // Start from block 1 (skip genesis which has no previous)
        for (let i = 1; i < this.chain.length; i++) {
            const currentBlock = this.chain[i];
            const previousBlock = this.chain[i - 1];

            // Check 1: Does the stored hash match the calculated hash?
            // If someone modified block data, the hashes won't match
            if (currentBlock.hash !== currentBlock.calculateHash()) {
                console.log(`❌ Block ${i}: Hash is invalid (data was modified)`);
                return false;
            }

            // Check 2: Does previousHash match the actual previous block?
            // If blocks were reordered, this would fail
            if (currentBlock.previousHash !== previousBlock.hash) {
                console.log(`❌ Block ${i}: Previous hash doesn't match`);
                return false;
            }

            // Check 3: Are all transactions in the block valid?
            if (!currentBlock.hasValidTransactions()) {
                console.log(`❌ Block ${i}: Contains invalid transaction(s)`);
                return false;
            }

            console.log(`   ✓ Block ${i} is valid`);
        }

        console.log('✅ Blockchain is valid!\n');
        return true;
    }

    /**
     * Get all transactions for a specific address.
     * Useful for viewing transaction history.
     * 
     * @param {string} address - The wallet address
     * @returns {Array} Array of transaction objects
     */
    getTransactionsForAddress(address) {
        const transactions = [];

        for (const block of this.chain) {
            for (const tx of block.transactions) {
                if (tx.senderAddress === address || tx.receiverAddress === address) {
                    transactions.push({
                        type: tx.senderAddress === address ? 'SENT' : 'RECEIVED',
                        amount: tx.amount,
                        from: tx.senderAddress ? tx.senderAddress.substring(0, 20) + '...' : 'MINING REWARD',
                        to: tx.receiverAddress.substring(0, 20) + '...',
                        timestamp: new Date(tx.timestamp).toISOString(),
                        blockIndex: block.index
                    });
                }
            }
        }

        return transactions;
    }

    /**
     * Get blockchain stats.
     * 
     * @returns {Object} Statistics about the blockchain
     */
    getStats() {
        let totalTransactions = 0;
        let totalCoins = 0;

        for (const block of this.chain) {
            totalTransactions += block.transactions.length;
            for (const tx of block.transactions) {
                if (tx.senderAddress === null) {
                    totalCoins += tx.amount;  // Only count newly minted coins
                }
            }
        }

        return {
            totalBlocks: this.chain.length,
            totalTransactions,
            totalCoinsInCirculation: totalCoins,
            difficulty: this.difficulty,
            miningReward: this.miningReward,
            pendingTransactions: this.pendingTransactions.length
        };
    }

    /**
     * Get the status of a transaction by its hash.
     * 
     * TRANSACTION LIFECYCLE:
     * ======================
     * 1. PENDING - Transaction is in the pending pool, waiting to be mined
     * 2. CONFIRMED - Transaction has been included in a mined block
     * 3. UNKNOWN - Transaction not found in pending or any block
     * 
     * @param {string} txHash - The transaction hash to look up
     * @returns {Object} Transaction status with details
     */
    getTransactionStatus(txHash) {
        // Check pending transactions first
        for (const tx of this.pendingTransactions) {
            if (tx.calculateHash() === txHash) {
                return {
                    status: 'pending',
                    message: 'Transaction is waiting to be mined',
                    transaction: {
                        from: tx.senderAddress ? tx.senderAddress.substring(0, 20) + '...' : 'MINING REWARD',
                        to: tx.receiverAddress.substring(0, 20) + '...',
                        amount: tx.amount,
                        timestamp: new Date(tx.timestamp).toISOString()
                    },
                    confirmations: 0,
                    blockIndex: null
                };
            }
        }

        // Check confirmed transactions in blocks
        for (let i = this.chain.length - 1; i >= 0; i--) {
            const block = this.chain[i];
            for (const tx of block.transactions) {
                // Calculate hash for comparison
                const Transaction = require('./transaction');
                const txObj = new Transaction(tx.senderAddress, tx.receiverAddress, tx.amount);
                txObj.timestamp = tx.timestamp;
                txObj.signature = tx.signature;

                if (txObj.calculateHash() === txHash) {
                    const confirmations = this.chain.length - block.index;
                    return {
                        status: 'confirmed',
                        message: `Transaction confirmed in block #${block.index}`,
                        transaction: {
                            from: tx.senderAddress ? tx.senderAddress.substring(0, 20) + '...' : 'MINING REWARD',
                            to: tx.receiverAddress.substring(0, 20) + '...',
                            amount: tx.amount,
                            timestamp: new Date(tx.timestamp).toISOString()
                        },
                        confirmations: confirmations,
                        blockIndex: block.index,
                        blockHash: block.hash
                    };
                }
            }
        }

        // Transaction not found
        return {
            status: 'unknown',
            message: 'Transaction not found',
            transaction: null,
            confirmations: 0,
            blockIndex: null
        };
    }

    // ========================================
    // P2P NETWORK SUPPORT METHODS
    // ========================================

    /**
     * Replace the chain with a new one (used for consensus).
     * 
     * CONSENSUS MECHANISM:
     * When we receive a longer chain from a peer, we need to
     * validate it and replace our chain if it's valid.
     * 
     * @param {Array} newChainData - Array of block data from peer
     * @returns {boolean} True if chain was replaced
     */
    replaceChain(newChainData) {
        // Reconstruct Block objects from plain data
        const newChain = newChainData.map(blockData => {
            const block = new Block(
                blockData.index,
                blockData.timestamp,
                blockData.transactions.map(txData => {
                    const tx = new Transaction(
                        txData.senderAddress,
                        txData.receiverAddress,
                        txData.amount
                    );
                    tx.timestamp = txData.timestamp;
                    tx.signature = txData.signature;
                    return tx;
                }),
                blockData.previousHash
            );
            block.nonce = blockData.nonce;
            block.hash = blockData.hash;
            return block;
        });

        // Validate the new chain
        if (!this.validateChain(newChain)) {
            console.log('❌ Received chain is invalid');
            return false;
        }

        // Replace our chain
        this.chain = newChain;
        console.log('✅ Chain replaced with valid longer chain');
        return true;
    }

    /**
     * Validate a chain (used for validating received chains).
     * Similar to isChainValid but works on any chain array.
     * 
     * @param {Array} chain - The chain to validate
     * @returns {boolean} True if chain is valid
     */
    validateChain(chain) {
        // Check genesis block
        if (chain.length === 0) return false;

        // Validate each block
        for (let i = 1; i < chain.length; i++) {
            const currentBlock = chain[i];
            const previousBlock = chain[i - 1];

            // Verify hash
            if (currentBlock.hash !== currentBlock.calculateHash()) {
                return false;
            }

            // Verify chain link
            if (currentBlock.previousHash !== previousBlock.hash) {
                return false;
            }

            // Verify proof of work
            if (currentBlock.hash.substring(0, this.difficulty) !== '0'.repeat(this.difficulty)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Add a received block from another node.
     * Used when a peer broadcasts a newly mined block.
     * 
     * @param {Object} blockData - Block data from peer
     * @returns {boolean} True if block was added
     */
    addBlock(blockData) {
        // Reconstruct the block
        const block = new Block(
            blockData.index,
            blockData.timestamp,
            blockData.transactions.map(txData => {
                const tx = new Transaction(
                    txData.senderAddress,
                    txData.receiverAddress,
                    txData.amount
                );
                tx.timestamp = txData.timestamp;
                tx.signature = txData.signature;
                return tx;
            }),
            blockData.previousHash
        );
        block.nonce = blockData.nonce;
        block.hash = blockData.hash;

        // Verify the block links to our latest block
        const latestBlock = this.getLatestBlock();

        if (block.previousHash !== latestBlock.hash) {
            console.log('❌ Block does not link to our chain');
            return false;
        }

        if (block.index !== latestBlock.index + 1) {
            console.log('❌ Block index mismatch');
            return false;
        }

        // Verify the hash is valid
        if (block.hash !== block.calculateHash()) {
            console.log('❌ Block hash is invalid');
            return false;
        }

        // Verify proof of work
        if (block.hash.substring(0, this.difficulty) !== '0'.repeat(this.difficulty)) {
            console.log('❌ Block does not meet difficulty requirement');
            return false;
        }

        // Add the block
        this.chain.push(block);
        console.log(`📦 Received block #${block.index} added to chain`);

        // Remove transactions that are now in the block from pending
        this.removeMinedTransactions(block.transactions);

        return true;
    }

    /**
     * Add a received transaction from another node.
     * Used when a peer broadcasts a new transaction.
     * 
     * @param {Object} txData - Transaction data from peer
     * @returns {boolean} True if transaction was added
     */
    addReceivedTransaction(txData) {
        // Reconstruct the transaction
        const transaction = new Transaction(
            txData.senderAddress,
            txData.receiverAddress,
            txData.amount
        );
        transaction.timestamp = txData.timestamp;
        transaction.signature = txData.signature;

        // Check if we already have this transaction
        const exists = this.pendingTransactions.some(tx =>
            tx.senderAddress === transaction.senderAddress &&
            tx.receiverAddress === transaction.receiverAddress &&
            tx.amount === transaction.amount &&
            tx.timestamp === transaction.timestamp
        );

        if (exists) {
            return false;  // Already have it
        }

        // Validate and add
        if (transaction.isValid()) {
            this.pendingTransactions.push(transaction);
            console.log(`📝 Received transaction added to pending pool`);
            return true;
        }

        return false;
    }

    /**
     * Remove transactions that have been mined from pending pool.
     * 
     * @param {Array} minedTransactions - Transactions in the new block
     */
    removeMinedTransactions(minedTransactions) {
        this.pendingTransactions = this.pendingTransactions.filter(pending => {
            return !minedTransactions.some(mined =>
                mined.senderAddress === pending.senderAddress &&
                mined.receiverAddress === pending.receiverAddress &&
                mined.amount === pending.amount &&
                mined.timestamp === pending.timestamp
            );
        });
    }
}

module.exports = Blockchain;
