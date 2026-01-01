/**
 * ========================================
 * NEKO CHAIN - TRANSACTION MODULE
 * ========================================
 * 
 * This module defines the Transaction class, representing transfers of coins.
 * 
 * EDUCATIONAL NOTES:
 * ==================
 * 
 * 1. WHAT IS A TRANSACTION?
 *    - A record of coin transfer from one address to another
 *    - Contains: sender, receiver, amount, timestamp, and signature
 *    - Once signed over and added to a block, it's permanent
 * 
 * 2. WHY DO WE NEED SIGNATURES?
 *    - Proves the sender authorized the transaction
 *    - Prevents others from spending your coins
 *    - Cannot be forged without the private key
 *    - If data changes, signature becomes invalid
 * 
 * 3. TRANSACTION VALIDATION
 *    - Must have valid signature (except mining rewards)
 *    - Sender must have sufficient balance (checked by blockchain)
 *    - Amount must be positive
 */

const SHA256 = require('crypto-js/sha256');
const { signData, verifySignature } = require('./wallet');

class Transaction {
    /**
     * Create a new transaction.
     * 
     * @param {string|null} senderAddress - Sender's public key (null for mining reward)
     * @param {string} receiverAddress - Receiver's public key
     * @param {number} amount - Amount of coins to transfer
     */
    constructor(senderAddress, receiverAddress, amount) {
        this.senderAddress = senderAddress;      // Public key of sender
        this.receiverAddress = receiverAddress;  // Public key of receiver
        this.amount = amount;                    // Number of coins
        this.timestamp = Date.now();             // When transaction was created
        this.signature = null;                   // Will be set when signed
    }

    /**
     * Calculate the hash of the transaction.
     * 
     * HOW HASHING WORKS:
     * - Takes any input data and produces a fixed-size output (256 bits)
     * - Same input ALWAYS produces same output
     * - Tiny change in input = completely different output
     * - Cannot reverse the hash to get original data
     * - Used to create a "fingerprint" of the transaction
     * 
     * @returns {string} SHA-256 hash of transaction data
     */
    calculateHash() {
        return SHA256(
            this.senderAddress +
            this.receiverAddress +
            this.amount +
            this.timestamp
        ).toString();
    }

    /**
     * Sign this transaction with the sender's private key.
     * 
     * This creates a digital signature that proves:
     * 1. You own the private key for the sender address
     * 2. You authorized this specific transaction
     * 3. The transaction details haven't been tampered with
     * 
     * @param {string} privateKey - The sender's private key
     * @throws {Error} If transaction is a mining reward or key mismatch
     */
    signTransaction(privateKey) {
        // Mining rewards don't need signatures
        if (this.senderAddress === null) {
            throw new Error('Cannot sign mining reward transaction!');
        }

        // Calculate the hash of the transaction
        const transactionHash = this.calculateHash();

        // Sign the hash with the private key
        this.signature = signData(privateKey, transactionHash);
    }

    /**
     * Validate the transaction.
     * 
     * Checks performed:
     * 1. Mining rewards are always valid (no sender)
     * 2. Transaction must have a signature
     * 3. Signature must be valid for the transaction hash
     * 4. Amount must be positive
     * 
     * @returns {boolean} True if transaction is valid
     */
    isValid() {
        // Mining reward transactions have no sender - they're valid
        if (this.senderAddress === null) {
            return true;
        }

        // Regular transactions must have a signature
        if (!this.signature || this.signature.length === 0) {
            console.log('Transaction rejected: No signature');
            return false;
        }

        // Amount must be positive
        if (this.amount <= 0) {
            console.log('Transaction rejected: Amount must be positive');
            return false;
        }

        // Verify the signature matches this transaction's hash
        const transactionHash = this.calculateHash();
        const isValid = verifySignature(
            this.senderAddress,
            transactionHash,
            this.signature
        );

        if (!isValid) {
            console.log('Transaction rejected: Invalid signature');
        }

        return isValid;
    }

    /**
     * Get a human-readable description of the transaction.
     * Useful for debugging and logging.
     * 
     * @returns {string} Description of the transaction
     */
    toString() {
        if (this.senderAddress === null) {
            return `Mining Reward: ${this.amount} coins -> ${this.receiverAddress.substring(0, 20)}...`;
        }
        return `Transfer: ${this.amount} coins from ${this.senderAddress.substring(0, 20)}... to ${this.receiverAddress.substring(0, 20)}...`;
    }
}

module.exports = Transaction;
