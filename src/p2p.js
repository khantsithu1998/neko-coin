/**
 * ========================================
 * NEKO CHAIN - P2P NETWORK MODULE
 * ========================================
 * 
 * This module handles peer-to-peer networking between blockchain nodes.
 * 
 * EDUCATIONAL NOTES:
 * ==================
 * 
 * 1. WHY P2P NETWORKING?
 *    - Decentralization: No single point of failure
 *    - All nodes have a copy of the blockchain
 *    - Nodes share transactions and blocks with each other
 *    - If one node goes down, the network continues
 * 
 * 2. HOW NODES COMMUNICATE
 *    - Nodes register with each other (peer discovery)
 *    - When a transaction is created, broadcast to all peers
 *    - When a block is mined, broadcast to all peers
 *    - Peers validate and add to their chain
 * 
 * 3. CONSENSUS (Longest Chain Rule)
 *    - If two nodes mine at the same time, a fork occurs
 *    - The network follows the LONGEST valid chain
 *    - This resolves conflicts automatically
 * 
 * 4. SIMPLIFIED IMPLEMENTATION
 *    - Uses HTTP for communication (real blockchains use WebSockets/TCP)
 *    - Manual peer registration (real blockchains use discovery protocols)
 *    - Suitable for learning and local testing
 */

const axios = require('axios');

class P2PNetwork {
    /**
     * Create a new P2P network manager.
     * 
     * @param {Blockchain} blockchain - Reference to the local blockchain
     * @param {number} port - This node's port
     * @param {Array} seedNodes - Optional array of seed node URLs
     */
    constructor(blockchain, port, seedNodes = null) {
        this.blockchain = blockchain;
        this.port = port;
        this.peers = new Set();  // Set of peer URLs (e.g., "http://localhost:3001")
        this.nodeUrl = `http://localhost:${port}`;

        // Seed nodes - can be configured in 3 ways:
        // 1. Constructor parameter
        // 2. Environment variable SEED_NODES (comma-separated)
        // 3. Default fallback
        this.seedNodes = this.loadSeedNodes(seedNodes);

        // Auto-sync interval (every 30 seconds)
        this.syncInterval = 30000;

        // Auto-discovery interval (every 15 seconds)
        this.discoveryInterval = 15000;

        console.log(`🌐 P2P Network initialized for node at ${this.nodeUrl}`);
        console.log(`   Seed nodes: ${this.seedNodes.length} configured`);

        // Start auto-discovery and sync after a short delay
        setTimeout(() => this.startAutoDiscovery(), 3000);
    }

    /**
     * Load seed nodes from various sources.
     * 
     * Priority:
     * 1. Constructor parameter (passed directly)
     * 2. Environment variable SEED_NODES (comma-separated URLs)
     * 3. Default nodes (localhost:3000-3003)
     * 
     * @param {Array} providedSeeds - Seeds provided to constructor
     * @returns {Array} Array of seed node URLs
     */
    loadSeedNodes(providedSeeds) {
        // Option 1: Use provided seeds
        if (providedSeeds && Array.isArray(providedSeeds) && providedSeeds.length > 0) {
            console.log('📌 Using provided seed nodes');
            return providedSeeds;
        }

        // Option 2: Use environment variable
        const envSeeds = process.env.SEED_NODES;
        if (envSeeds) {
            const seeds = envSeeds.split(',').map(s => s.trim()).filter(s => s);
            if (seeds.length > 0) {
                console.log('📌 Using seed nodes from SEED_NODES environment variable');
                return seeds;
            }
        }

        // Option 3: Default seeds (for local development)
        console.log('📌 Using default seed nodes (localhost:3000-3003)');
        return [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:3002',
            'http://localhost:3003',
        ];
    }

    /**
     * Add a new seed node dynamically.
     * 
     * @param {string} nodeUrl - URL of the new seed node
     */
    addSeedNode(nodeUrl) {
        if (!this.seedNodes.includes(nodeUrl)) {
            this.seedNodes.push(nodeUrl);
            console.log(`📌 Added seed node: ${nodeUrl}`);
            // Try to connect immediately
            this.connectToPeer(nodeUrl);
        }
    }

    /**
     * Remove a seed node.
     * 
     * @param {string} nodeUrl - URL of the seed node to remove
     */
    removeSeedNode(nodeUrl) {
        const index = this.seedNodes.indexOf(nodeUrl);
        if (index > -1) {
            this.seedNodes.splice(index, 1);
            console.log(`🗑️  Removed seed node: ${nodeUrl}`);
        }
    }

    /**
     * Get all seed nodes.
     * 
     * @returns {Array} Array of seed node URLs
     */
    getSeedNodes() {
        return [...this.seedNodes];
    }

    /**
     * Start automatic peer discovery and sync.
     * 
     * AUTO-DISCOVERY MECHANISM:
     * =========================
     * 
     * 1. Try to connect to all seed nodes
     * 2. Ask each peer for their known peers
     * 3. Connect to new peers found
     * 4. Periodically sync chain with peers
     * 
     * This creates a gossip-like network where nodes
     * gradually discover each other.
     */
    startAutoDiscovery() {
        console.log('🔍 Starting automatic peer discovery...');

        // Initial discovery - connect to seed nodes
        this.discoverPeers();

        // Periodic discovery
        setInterval(() => {
            this.discoverPeers();
        }, this.discoveryInterval);

        // Periodic sync
        setInterval(() => {
            if (this.peers.size > 0) {
                this.syncChain();
            }
        }, this.syncInterval);
    }

    /**
     * Discover and connect to new peers.
     */
    async discoverPeers() {
        // Try to connect to seed nodes we're not connected to
        for (const seedUrl of this.seedNodes) {
            if (seedUrl !== this.nodeUrl && !this.peers.has(seedUrl)) {
                await this.connectToPeer(seedUrl);
            }
        }

        // Ask existing peers for their peers
        for (const peerUrl of this.peers) {
            try {
                const response = await axios.get(`${peerUrl}/peers`, { timeout: 2000 });
                const theirPeers = response.data.peers || [];

                for (const newPeer of theirPeers) {
                    if (newPeer !== this.nodeUrl && !this.peers.has(newPeer)) {
                        await this.connectToPeer(newPeer);
                    }
                }
            } catch (error) {
                // Peer unreachable, remove it
                this.peers.delete(peerUrl);
            }
        }
    }

    /**
     * Register a new peer node.
     * 
     * PEER DISCOVERY:
     * In a real blockchain, nodes would automatically discover each other
     * through various protocols (DNS seeds, DHT, etc.).
     * Here, we manually register peers for simplicity.
     * 
     * @param {string} peerUrl - URL of the peer node (e.g., "http://localhost:3001")
     * @returns {boolean} True if peer was added
     */
    registerPeer(peerUrl) {
        // Don't add ourselves as a peer
        if (peerUrl === this.nodeUrl) {
            console.log('Cannot register self as peer');
            return false;
        }

        // Don't add duplicates
        if (this.peers.has(peerUrl)) {
            console.log(`Peer ${peerUrl} already registered`);
            return false;
        }

        this.peers.add(peerUrl);
        console.log(`✅ Peer registered: ${peerUrl}`);
        console.log(`   Total peers: ${this.peers.size}`);

        return true;
    }

    /**
     * Register this node with a peer and get their known peers.
     * This creates a two-way connection.
     * 
     * @param {string} peerUrl - URL of the peer to connect to
     */
    async connectToPeer(peerUrl) {
        try {
            // Register ourselves with the peer
            await axios.post(`${peerUrl}/peers/register`, {
                peerUrl: this.nodeUrl
            });

            // Add them as our peer
            this.registerPeer(peerUrl);

            // Get their known peers and register them too
            const response = await axios.get(`${peerUrl}/peers`);
            const theirPeers = response.data.peers || [];

            for (const peer of theirPeers) {
                if (peer !== this.nodeUrl && !this.peers.has(peer)) {
                    this.registerPeer(peer);
                }
            }

            console.log(`🤝 Connected to peer: ${peerUrl}`);
            return true;
        } catch (error) {
            console.log(`❌ Failed to connect to peer ${peerUrl}: ${error.message}`);
            return false;
        }
    }

    /**
     * Broadcast a new transaction to all peers.
     * 
     * TRANSACTION PROPAGATION:
     * When a user creates a transaction, it needs to reach all nodes
     * so that any miner can include it in a block.
     * 
     * @param {Transaction} transaction - The transaction to broadcast
     */
    async broadcastTransaction(transaction) {
        console.log(`📡 Broadcasting transaction to ${this.peers.size} peer(s)...`);

        const promises = [];

        for (const peerUrl of this.peers) {
            const promise = axios.post(`${peerUrl}/transaction/receive`, {
                transaction: {
                    senderAddress: transaction.senderAddress,
                    receiverAddress: transaction.receiverAddress,
                    amount: transaction.amount,
                    timestamp: transaction.timestamp,
                    signature: transaction.signature
                }
            }).catch(err => {
                console.log(`   Failed to send to ${peerUrl}: ${err.message}`);
            });

            promises.push(promise);
        }

        await Promise.all(promises);
        console.log(`   Transaction broadcast complete`);
    }

    /**
     * Broadcast a newly mined block to all peers.
     * 
     * BLOCK PROPAGATION:
     * When a miner finds a valid block, it broadcasts to all nodes.
     * Other nodes validate and add it to their chain.
     * This is how the network stays in sync.
     * 
     * @param {Block} block - The newly mined block
     */
    async broadcastBlock(block) {
        console.log(`📡 Broadcasting new block #${block.index} to ${this.peers.size} peer(s)...`);

        const promises = [];

        for (const peerUrl of this.peers) {
            const promise = axios.post(`${peerUrl}/block/receive`, {
                block: block
            }).catch(err => {
                console.log(`   Failed to send to ${peerUrl}: ${err.message}`);
            });

            promises.push(promise);
        }

        await Promise.all(promises);
        console.log(`   Block broadcast complete`);
    }

    /**
     * Sync the blockchain with peers (get the longest valid chain).
     * 
     * CONSENSUS MECHANISM (Longest Chain Rule):
     * ==========================================
     * 
     * When there's a conflict (multiple valid chains), we use the
     * "longest chain" rule:
     * 
     * 1. Ask all peers for their blockchain
     * 2. Find the longest chain that is valid
     * 3. Replace our chain if a longer valid one exists
     * 
     * WHY LONGEST CHAIN?
     * - More blocks = more computational work invested
     * - An attacker would need >50% of network computing power
     * - This makes the network secure against manipulation
     * 
     * @returns {boolean} True if chain was replaced
     */
    async syncChain() {
        console.log(`🔄 Syncing blockchain with ${this.peers.size} peer(s)...`);

        let longestChain = null;
        let maxLength = this.blockchain.chain.length;

        for (const peerUrl of this.peers) {
            try {
                const response = await axios.get(`${peerUrl}/chain/raw`);
                const peerChain = response.data.chain;

                console.log(`   ${peerUrl}: ${peerChain.length} blocks`);

                // Check if peer has a longer chain
                if (peerChain.length > maxLength) {
                    // We'll validate it before accepting
                    longestChain = peerChain;
                    maxLength = peerChain.length;
                }
            } catch (error) {
                console.log(`   ${peerUrl}: unreachable`);
            }
        }

        // If we found a longer chain, validate and replace
        if (longestChain) {
            console.log(`   Found longer chain with ${maxLength} blocks!`);

            // Reconstruct and validate the chain
            if (this.blockchain.replaceChain(longestChain)) {
                console.log(`✅ Chain replaced with longer valid chain`);
                return true;
            } else {
                console.log(`❌ Longer chain was invalid, keeping current`);
            }
        } else {
            console.log(`   Our chain is already the longest (${this.blockchain.chain.length} blocks)`);
        }

        return false;
    }

    /**
     * Get list of all registered peers.
     * 
     * @returns {Array} Array of peer URLs
     */
    getPeers() {
        return Array.from(this.peers);
    }

    /**
     * Remove a peer from the network.
     * 
     * @param {string} peerUrl - URL of peer to remove
     */
    removePeer(peerUrl) {
        if (this.peers.delete(peerUrl)) {
            console.log(`🗑️  Peer removed: ${peerUrl}`);
            return true;
        }
        return false;
    }
}

module.exports = P2PNetwork;
