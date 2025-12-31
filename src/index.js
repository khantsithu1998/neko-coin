/**
 * ========================================
 * NEKO COIN - REST API SERVER WITH P2P
 * ========================================
 * 
 * This is the Express.js server that provides HTTP endpoints
 * to interact with the Neko Coin blockchain.
 * 
 * EDUCATIONAL NOTES:
 * ==================
 * 
 * This server allows you to:
 * - Create new wallets (key pairs)
 * - Send coins between wallets
 * - Mine new blocks
 * - View the blockchain
 * - Check balances
 * - Connect to other nodes (P2P)
 * - Sync blockchain across nodes
 * 
 * P2P NETWORKING:
 * - Nodes can register with each other
 * - Transactions are broadcast to all peers
 * - Newly mined blocks are broadcast to all peers
 * - Nodes use "longest chain" consensus
 */

const express = require('express');
const Blockchain = require('./blockchain');
const Transaction = require('./transaction');
const P2PNetwork = require('./p2p');
const WebSocketP2P = require('./p2p-ws');
const Storage = require('./storage');
const { createWallet, getKeyPairFromPrivate } = require('./wallet');

// Allow port to be specified via: node src/index.js 3001
const PORT = process.argv[2] || process.env.PORT || 3000;

// Check for in-memory mode flag: node src/index.js 3000 --memory
const useMemory = process.argv.includes('--memory');

// Check for HTTP P2P mode (legacy): node src/index.js 3000 --http-p2p
const useHttpP2P = process.argv.includes('--http-p2p');

// Initialize Express app
const app = express();
app.use(express.json());  // Parse JSON request bodies

// Enable CORS for frontend
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Initialize storage (uses LevelDB by default, --memory for in-memory)
const storage = useMemory ? null : new Storage(`./blockchain-data-${PORT}`);

// Create blockchain instance with storage
const nekoCoin = new Blockchain(storage);

// Variable to track initialization status
let initialized = false;

// Initialize P2P network (WebSocket by default, HTTP with --http-p2p flag)
const p2pNetwork = useHttpP2P
    ? new P2PNetwork(nekoCoin, PORT)
    : new WebSocketP2P(nekoCoin, PORT);

// ========================================
// API ENDPOINTS
// ========================================

/**
 * GET /
 * Welcome endpoint with API information
 */
app.get('/', (req, res) => {
    res.json({
        name: '🐱 Neko Coin Blockchain API',
        version: '2.0.0 (P2P Enabled)',
        nodeUrl: `http://localhost:${PORT}`,
        peers: p2pNetwork.getPeers().length,
        endpoints: {
            // Wallet
            'POST /wallet/create': 'Create a new wallet (key pair)',

            // Transactions
            'POST /transaction': 'Create and sign a transaction',
            'GET /pending': 'View pending transactions',

            // Mining & Chain
            'POST /mine': 'Mine pending transactions into a new block',
            'GET /chain': 'View the entire blockchain',
            'GET /chain/raw': 'Get raw chain data (for P2P sync)',
            'GET /balance/:address': 'Get balance for an address',
            'GET /validate': 'Validate the blockchain integrity',

            // P2P Network
            'GET /peers': 'List all connected peers',
            'POST /peers/connect': 'Connect to a peer node',
            'POST /peers/register': 'Register a peer (called by other nodes)',
            'POST /sync': 'Sync blockchain with peers',
            'POST /transaction/receive': 'Receive transaction from peer',
            'POST /block/receive': 'Receive block from peer'
        }
    });
});

// ========================================
// WALLET ENDPOINTS
// ========================================

/**
 * POST /wallet/create
 * 
 * Create a new wallet with a public/private key pair.
 */
app.post('/wallet/create', (req, res) => {
    try {
        const wallet = createWallet();

        console.log('\n👛 New wallet created!');
        console.log(`   Address: ${wallet.publicKey.substring(0, 40)}...`);

        res.json({
            message: 'Wallet created successfully!',
            warning: 'SAVE YOUR PRIVATE KEY! It cannot be recovered!',
            publicKey: wallet.publicKey,
            privateKey: wallet.privateKey
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========================================
// TRANSACTION ENDPOINTS
// ========================================

/**
 * POST /transaction
 * 
 * Create and sign a new transaction.
 * Broadcasts to all peers automatically.
 */
app.post('/transaction', async (req, res) => {
    try {
        const { senderPrivateKey, receiverAddress, amount } = req.body;

        // Validate input
        if (!senderPrivateKey || !receiverAddress || !amount) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['senderPrivateKey', 'receiverAddress', 'amount']
            });
        }

        if (amount <= 0) {
            return res.status(400).json({ error: 'Amount must be positive' });
        }

        // Get sender's public key from private key
        const keyPair = getKeyPairFromPrivate(senderPrivateKey);
        const senderAddress = keyPair.getPublic('hex');

        // Create the transaction
        const transaction = new Transaction(senderAddress, receiverAddress, amount);

        // Sign it with the private key
        transaction.signTransaction(senderPrivateKey);

        // Add to pending transactions (validates automatically)
        await nekoCoin.addTransaction(transaction);

        // Broadcast to all peers
        await p2pNetwork.broadcastTransaction(transaction);

        res.json({
            message: 'Transaction added and broadcast to peers',
            transaction: {
                from: senderAddress.substring(0, 40) + '...',
                to: receiverAddress.substring(0, 40) + '...',
                amount: amount,
                timestamp: new Date(transaction.timestamp).toISOString(),
                signed: true
            },
            broadcastedTo: p2pNetwork.getPeers().length + ' peer(s)',
            txHash: transaction.calculateHash()
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * GET /transaction/status/:hash
 * 
 * Get the status of a transaction by its hash.
 * 
 * Status values:
 * - pending: Transaction is in the pending pool
 * - confirmed: Transaction is included in a block
 * - unknown: Transaction not found
 */
app.get('/transaction/status/:hash', (req, res) => {
    try {
        const { hash } = req.params;

        if (!hash) {
            return res.status(400).json({ error: 'Missing transaction hash' });
        }

        const status = nekoCoin.getTransactionStatus(hash);

        res.json(status);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /transaction/receive
 * 
 * Receive a transaction broadcast from another node.
 * This is called by peer nodes, not directly by users.
 */
app.post('/transaction/receive', (req, res) => {
    try {
        const { transaction } = req.body;

        if (!transaction) {
            return res.status(400).json({ error: 'Missing transaction data' });
        }

        const added = nekoCoin.addReceivedTransaction(transaction);

        res.json({
            success: added,
            message: added ? 'Transaction added to pending pool' : 'Transaction already exists or invalid'
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * GET /pending
 * 
 * Get all pending (unconfirmed) transactions.
 */
app.get('/pending', (req, res) => {
    res.json({
        count: nekoCoin.pendingTransactions.length,
        transactions: nekoCoin.pendingTransactions.map(tx => ({
            from: tx.senderAddress ? tx.senderAddress.substring(0, 20) + '...' : 'MINING REWARD',
            to: tx.receiverAddress.substring(0, 20) + '...',
            amount: tx.amount,
            timestamp: new Date(tx.timestamp).toISOString()
        }))
    });
});

// ========================================
// MINING ENDPOINTS
// ========================================

/**
 * POST /mine
 * 
 * Mine all pending transactions into a new block.
 * Broadcasts the new block to all peers.
 */
app.post('/mine', async (req, res) => {
    try {
        const { minerAddress } = req.body;

        if (!minerAddress) {
            return res.status(400).json({
                error: 'Missing minerAddress',
                hint: 'Create a wallet first with POST /wallet/create'
            });
        }

        console.log('\n⛏️  Mining requested by:', minerAddress.substring(0, 40) + '...');

        // Record start time for response
        const startTime = Date.now();

        // Mine the block (this takes time due to Proof of Work)
        const newBlock = await nekoCoin.minePendingTransactions(minerAddress);

        const miningTime = (Date.now() - startTime) / 1000;

        // Broadcast the new block to all peers
        await p2pNetwork.broadcastBlock(newBlock);

        res.json({
            message: 'Block mined and broadcast to peers!',
            block: {
                index: newBlock.index,
                hash: newBlock.hash,
                previousHash: newBlock.previousHash,
                transactions: newBlock.transactions.length,
                nonce: newBlock.nonce,
                timestamp: new Date(newBlock.timestamp).toISOString()
            },
            miningTime: `${miningTime.toFixed(2)} seconds`,
            reward: `${nekoCoin.miningReward} NEKO`,
            minerBalance: nekoCoin.getBalance(minerAddress),
            broadcastedTo: p2pNetwork.getPeers().length + ' peer(s)'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /block/receive
 * 
 * Receive a newly mined block from another node.
 * This is called by peer nodes, not directly by users.
 */
app.post('/block/receive', (req, res) => {
    try {
        const { block } = req.body;

        if (!block) {
            return res.status(400).json({ error: 'Missing block data' });
        }

        const added = nekoCoin.addBlock(block);

        res.json({
            success: added,
            message: added ? 'Block added to chain' : 'Block rejected (invalid or does not link)',
            chainLength: nekoCoin.chain.length
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ========================================
// BLOCKCHAIN ENDPOINTS
// ========================================

/**
 * GET /chain
 * 
 * Get the entire blockchain (formatted for display).
 */
app.get('/chain', (req, res) => {
    res.json({
        length: nekoCoin.chain.length,
        chain: nekoCoin.chain.map(block => ({
            index: block.index,
            timestamp: new Date(block.timestamp).toISOString(),
            transactions: block.transactions.map(tx => ({
                from: tx.senderAddress ? tx.senderAddress.substring(0, 20) + '...' : 'MINING REWARD',
                to: tx.receiverAddress.substring(0, 20) + '...',
                amount: tx.amount
            })),
            previousHash: block.previousHash.substring(0, 20) + '...',
            hash: block.hash,
            nonce: block.nonce
        }))
    });
});

/**
 * GET /chain/raw
 * 
 * Get the entire blockchain in raw format (for P2P sync).
 * Returns full data without truncation.
 */
app.get('/chain/raw', (req, res) => {
    res.json({
        length: nekoCoin.chain.length,
        chain: nekoCoin.chain
    });
});

/**
 * GET /balance/:address
 * 
 * Get the balance for a wallet address.
 */
app.get('/balance/:address', (req, res) => {
    try {
        const { address } = req.params;

        if (!address) {
            return res.status(400).json({ error: 'Address is required' });
        }

        const balance = nekoCoin.getBalance(address);

        res.json({
            address: address.substring(0, 40) + '...',
            balance: balance,
            unit: 'NEKO'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /transactions/:address
 * 
 * Get all transactions for an address.
 */
app.get('/transactions/:address', (req, res) => {
    try {
        const { address } = req.params;
        const transactions = nekoCoin.getTransactionsForAddress(address);

        res.json({
            address: address.substring(0, 40) + '...',
            totalTransactions: transactions.length,
            transactions
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /stats
 * 
 * Get blockchain statistics.
 */
app.get('/stats', (req, res) => {
    const stats = nekoCoin.getStats();
    res.json({
        ...stats,
        nodeUrl: `http://localhost:${PORT}`,
        connectedPeers: p2pNetwork.getPeers().length
    });
});

/**
 * GET /validate
 * 
 * Validate the entire blockchain integrity.
 */
app.get('/validate', (req, res) => {
    const isValid = nekoCoin.isChainValid();

    res.json({
        valid: isValid,
        message: isValid
            ? '✅ Blockchain is valid and secure!'
            : '❌ Blockchain has been tampered with!'
    });
});

// ========================================
// P2P NETWORK ENDPOINTS
// ========================================

/**
 * GET /peers
 * 
 * Get list of all connected peers.
 */
app.get('/peers', (req, res) => {
    res.json({
        nodeUrl: `http://localhost:${PORT}`,
        peers: p2pNetwork.getPeers(),
        count: p2pNetwork.getPeers().length
    });
});

/**
 * POST /peers/connect
 * 
 * Connect to a peer node.
 * This initiates a two-way connection.
 * 
 * Request body:
 * {
 *   peerUrl: "http://localhost:3001"
 * }
 */
app.post('/peers/connect', async (req, res) => {
    try {
        const { peerUrl } = req.body;

        if (!peerUrl) {
            return res.status(400).json({ error: 'Missing peerUrl' });
        }

        const success = await p2pNetwork.connectToPeer(peerUrl);

        if (success) {
            res.json({
                message: `Connected to peer: ${peerUrl}`,
                peers: p2pNetwork.getPeers()
            });
        } else {
            res.status(400).json({
                error: `Failed to connect to peer: ${peerUrl}`
            });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /peers/register
 * 
 * Register a peer (called by other nodes during connection).
 * 
 * Request body:
 * {
 *   peerUrl: "http://localhost:3001"
 * }
 */
app.post('/peers/register', (req, res) => {
    try {
        const { peerUrl } = req.body;

        if (!peerUrl) {
            return res.status(400).json({ error: 'Missing peerUrl' });
        }

        const success = p2pNetwork.registerPeer(peerUrl);

        res.json({
            message: success ? 'Peer registered' : 'Peer already registered',
            peers: p2pNetwork.getPeers()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /sync
 * 
 * Sync blockchain with all peers (get longest valid chain).
 * Uses the "longest chain wins" consensus mechanism.
 */
app.post('/sync', async (req, res) => {
    try {
        const wasReplaced = await p2pNetwork.syncChain();

        res.json({
            message: wasReplaced
                ? 'Chain was replaced with longer valid chain from peer'
                : 'Our chain is already the longest or no valid longer chain found',
            chainLength: nekoCoin.chain.length,
            peers: p2pNetwork.getPeers().length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========================================
// SEED NODE MANAGEMENT ENDPOINTS
// ========================================

/**
 * GET /seeds
 * 
 * Get all configured seed nodes.
 */
app.get('/seeds', (req, res) => {
    res.json({
        nodeUrl: `http://localhost:${PORT}`,
        seedNodes: p2pNetwork.getSeedNodes(),
        count: p2pNetwork.getSeedNodes().length
    });
});

/**
 * POST /seeds/add
 * 
 * Add a new seed node dynamically.
 * 
 * Request body:
 * {
 *   nodeUrl: "http://192.168.1.10:3000"
 * }
 */
app.post('/seeds/add', (req, res) => {
    try {
        const { nodeUrl } = req.body;

        if (!nodeUrl) {
            return res.status(400).json({ error: 'Missing nodeUrl' });
        }

        p2pNetwork.addSeedNode(nodeUrl);

        res.json({
            message: `Seed node added: ${nodeUrl}`,
            seedNodes: p2pNetwork.getSeedNodes()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /seeds/remove
 * 
 * Remove a seed node.
 * 
 * Request body:
 * {
 *   nodeUrl: "http://192.168.1.10:3000"
 * }
 */
app.post('/seeds/remove', (req, res) => {
    try {
        const { nodeUrl } = req.body;

        if (!nodeUrl) {
            return res.status(400).json({ error: 'Missing nodeUrl' });
        }

        p2pNetwork.removeSeedNode(nodeUrl);

        res.json({
            message: `Seed node removed: ${nodeUrl}`,
            seedNodes: p2pNetwork.getSeedNodes()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========================================
// START SERVER
// ========================================

async function startServer() {
    // Initialize blockchain (loads from storage if available)
    await nekoCoin.initialize();
    initialized = true;

    // Start P2P server (WebSocket or HTTP)
    if (p2pNetwork.startServer) {
        p2pNetwork.startServer();
    }

    const wsPort = parseInt(PORT) + 1000;
    const p2pType = useHttpP2P ? 'HTTP (legacy)' : 'WebSocket (real-time)';

    app.listen(PORT, () => {
        console.log('\n========================================');
        console.log('🐱 NEKO COIN BLOCKCHAIN');
        console.log('========================================');
        console.log(`🚀 HTTP API:     http://localhost:${PORT}`);
        if (!useHttpP2P) {
            console.log(`📡 WebSocket:    ws://localhost:${wsPort}`);
        }
        console.log(`💾 Storage:      ${storage ? 'LevelDB (persistent)' : 'In-memory'}`);
        console.log(`🌐 P2P Mode:     ${p2pType}`);
        console.log('\n💰 Blockchain Commands:');
        console.log('  POST /wallet/create  - Create new wallet');
        console.log('  POST /transaction    - Send coins');
        console.log('  POST /mine           - Mine a block');
        console.log('  GET  /chain          - View blockchain');
        console.log('  GET  /balance/:addr  - Check balance');
        console.log('  GET  /peers          - List connected peers');
        console.log('\n🎓 Educational blockchain for learning!');
        console.log('========================================\n');
    });
}

// Start the server
startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});

module.exports = { app, nekoCoin, p2pNetwork };

