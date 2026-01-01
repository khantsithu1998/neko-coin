/**
 * ========================================
 * NEKO CHAIN - WALLET MODULE
 * ========================================
 * 
 * This module handles cryptographic key pair generation for the blockchain.
 * 
 * EDUCATIONAL NOTES:
 * ==================
 * 
 * 1. ASYMMETRIC CRYPTOGRAPHY
 *    - Uses a pair of keys: private key (secret) and public key (shareable)
 *    - Private key is used to SIGN transactions (prove ownership)
 *    - Public key is used to VERIFY signatures (confirm identity)
 *    - You CANNOT derive the private key from the public key
 * 
 * 2. WHY ECDSA (Elliptic Curve Digital Signature Algorithm)?
 *    - Same algorithm used by Bitcoin and Ethereum
 *    - secp256k1 curve provides 256-bit security
 *    - Smaller key sizes than RSA with equivalent security
 *    - Efficient for signing and verification
 * 
 * 3. HOW IT WORKS
 *    - Random number generates private key
 *    - Mathematical operation derives public key
 *    - Public key = wallet address (simplified for learning)
 */

const EC = require('elliptic').ec;

// Initialize the elliptic curve - secp256k1 is used by Bitcoin
const ec = new EC('secp256k1');

/**
 * Creates a new wallet with a public/private key pair.
 * 
 * The private key must be kept SECRET - anyone with it can spend your coins!
 * The public key can be shared - it's your wallet address.
 * 
 * @returns {Object} Object containing publicKey and privateKey as hex strings
 */
function createWallet() {
    // Generate a new random key pair
    // The private key is a random 256-bit number
    // The public key is derived from the private key using elliptic curve math
    const keyPair = ec.genKeyPair();

    // Extract keys as hexadecimal strings
    const publicKey = keyPair.getPublic('hex');
    const privateKey = keyPair.getPrivate('hex');

    return {
        publicKey,   // This is your wallet address
        privateKey   // Keep this SECRET! Never share it!
    };
}

/**
 * Gets a key pair object from a private key.
 * Used to sign transactions.
 * 
 * @param {string} privateKey - The private key in hex format
 * @returns {Object} The elliptic curve key pair object
 */
function getKeyPairFromPrivate(privateKey) {
    return ec.keyFromPrivate(privateKey, 'hex');
}

/**
 * Gets a public key object for verification.
 * Used to verify transaction signatures.
 * 
 * @param {string} publicKey - The public key in hex format
 * @returns {Object} The elliptic curve key object
 */
function getKeyFromPublic(publicKey) {
    return ec.keyFromPublic(publicKey, 'hex');
}

/**
 * Signs data with a private key.
 * 
 * HOW DIGITAL SIGNATURES WORK:
 * 1. Take the data you want to sign (usually a hash)
 * 2. Use your private key to create a unique signature
 * 3. Anyone can verify this signature using your public key
 * 4. The signature proves YOU signed it (only you have the private key)
 * 5. The signature proves the data wasn't changed after signing
 * 
 * @param {string} privateKey - The signer's private key
 * @param {string} dataHash - The hash of the data to sign
 * @returns {string} The signature in DER format (hex encoded)
 */
function signData(privateKey, dataHash) {
    const keyPair = getKeyPairFromPrivate(privateKey);
    const signature = keyPair.sign(dataHash, 'base64');
    return signature.toDER('hex');
}

/**
 * Verifies a signature against data and a public key.
 * 
 * This proves:
 * 1. The owner of the public key created this signature
 * 2. The data hasn't been modified since signing
 * 
 * @param {string} publicKey - The signer's public key
 * @param {string} dataHash - The hash of the original data
 * @param {string} signature - The signature to verify
 * @returns {boolean} True if signature is valid
 */
function verifySignature(publicKey, dataHash, signature) {
    try {
        const key = getKeyFromPublic(publicKey);
        return key.verify(dataHash, signature);
    } catch (error) {
        // Invalid signature format or verification failed
        return false;
    }
}

// Export functions for use in other modules
module.exports = {
    createWallet,
    getKeyPairFromPrivate,
    getKeyFromPublic,
    signData,
    verifySignature,
    ec  // Export for direct access if needed
};
