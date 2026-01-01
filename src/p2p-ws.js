/**
 * ========================================
 * NEKO CHAIN - WebSocket P2P Network Module
 * ========================================
 * 
 * Real-time peer-to-peer networking using WebSockets.
 * 
 * EDUCATIONAL NOTES:
 * ==================
 * 
 * 1. WHY WEBSOCKETS INSTEAD OF HTTP POLLING?
 *    - HTTP: Client must repeatedly ask "any updates?"
 *    - WebSocket: Server pushes updates instantly
 *    - More efficient, real-time, lower latency
 * 
 * 2. MESSAGE TYPES:
 *    - HANDSHAKE: Initial connection, exchange node info
 *    - NEW_BLOCK: A new block has been mined
 *    - NEW_TX: A new transaction was created
 *    - GET_CHAIN: Request the full blockchain
 *    - CHAIN: Response with the full blockchain
 *    - GET_PEERS: Request list of known peers
 *    - PEERS: Response with peer list
 * 
 * 3. CONNECTION FLOW:
 *    Client connects → Handshake → Exchange peer lists → Sync chains
 */

const WebSocket = require('ws');
const http = require('http');

// Message types for P2P communication
const MessageType = {
    HANDSHAKE: 'HANDSHAKE',
    NEW_BLOCK: 'NEW_BLOCK',
    NEW_TX: 'NEW_TX',
    GET_CHAIN: 'GET_CHAIN',
    CHAIN: 'CHAIN',
    GET_PEERS: 'GET_PEERS',
    PEERS: 'PEERS'
};

class WebSocketP2P {
    /**
     * Create a new WebSocket P2P network.
     * 
     * @param {Blockchain} blockchain - The blockchain instance
     * @param {number} port - Port for WebSocket server (HTTP port + 1000)
     */
    constructor(blockchain, httpPort) {
        this.blockchain = blockchain;
        this.httpPort = httpPort;
        this.wsPort = parseInt(httpPort) + 1000;  // WebSocket on port + 1000
        this.nodeUrl = `ws://localhost:${this.wsPort}`;

        // Connected peers (WebSocket connections)
        this.peers = new Map();  // url -> WebSocket

        // Known peer URLs (for reconnection)
        this.knownPeers = new Set();

        // Seed nodes for discovery
        this.seedNodes = this.loadSeedNodes();

        // WebSocket server
        this.wss = null;

        // Reconnection interval
        this.reconnectInterval = null;

        console.log(`🌐 WebSocket P2P initialized`);
        console.log(`   WebSocket URL: ${this.nodeUrl}`);
        console.log(`   Seed nodes: ${this.seedNodes.length} configured`);
    }

    /**
     * Load seed nodes for initial discovery.
     */
    loadSeedNodes() {
        if (process.env.SEED_NODES) {
            return process.env.SEED_NODES.split(',').map(s => s.trim());
        }
        // Default seed nodes (WebSocket ports)
        return [
            'ws://localhost:4000',
            'ws://localhost:4001',
            'ws://localhost:4002',
            'ws://localhost:4003'
        ];
    }

    /**
     * Start the WebSocket server.
     */
    startServer() {
        this.wss = new WebSocket.Server({ port: this.wsPort });

        this.wss.on('connection', (ws, req) => {
            console.log(`📡 Incoming WebSocket connection from ${req.socket.remoteAddress}`);
            this.initConnection(ws, true);
        });

        this.wss.on('error', (error) => {
            console.error(`❌ WebSocket server error: ${error.message}`);
        });

        console.log(`✅ WebSocket server listening on port ${this.wsPort}`);

        // Start peer discovery
        setTimeout(() => this.discoverPeers(), 2000);

        // Reconnect to known peers periodically
        this.reconnectInterval = setInterval(() => this.reconnectToPeers(), 30000);
    }

    /**
     * Initialize a WebSocket connection (incoming or outgoing).
     * 
     * @param {WebSocket} ws - The WebSocket connection
     * @param {boolean} isIncoming - True if connection was initiated by peer
     */
    initConnection(ws, isIncoming = false) {
        ws.isAlive = true;

        ws.on('pong', () => {
            ws.isAlive = true;
        });

        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                this.handleMessage(ws, message);
            } catch (error) {
                console.error(`❌ Failed to parse message: ${error.message}`);
            }
        });

        ws.on('close', () => {
            // Find and remove this peer
            for (const [url, peer] of this.peers) {
                if (peer === ws) {
                    console.log(`👋 Peer disconnected: ${url}`);
                    this.peers.delete(url);
                    break;
                }
            }
        });

        ws.on('error', (error) => {
            console.error(`❌ WebSocket error: ${error.message}`);
        });

        // Send handshake
        this.sendMessage(ws, {
            type: MessageType.HANDSHAKE,
            data: {
                nodeUrl: this.nodeUrl,
                chainLength: this.blockchain.chain.length,
                version: '2.0'
            }
        });
    }

    /**
     * Handle incoming messages.
     * 
     * @param {WebSocket} ws - The WebSocket connection
     * @param {Object} message - The parsed message
     */
    handleMessage(ws, message) {
        switch (message.type) {
            case MessageType.HANDSHAKE:
                this.handleHandshake(ws, message.data);
                break;

            case MessageType.NEW_BLOCK:
                this.handleNewBlock(message.data);
                break;

            case MessageType.NEW_TX:
                this.handleNewTransaction(message.data);
                break;

            case MessageType.GET_CHAIN:
                this.sendChain(ws);
                break;

            case MessageType.CHAIN:
                this.handleChain(message.data);
                break;

            case MessageType.GET_PEERS:
                this.sendPeers(ws);
                break;

            case MessageType.PEERS:
                this.handlePeers(message.data);
                break;

            default:
                console.log(`⚠️ Unknown message type: ${message.type}`);
        }
    }

    /**
     * Handle handshake from a peer.
     */
    handleHandshake(ws, data) {
        const { nodeUrl, chainLength } = data;

        // Don't connect to ourselves
        if (nodeUrl === this.nodeUrl) {
            ws.close();
            return;
        }

        // Store the connection
        if (!this.peers.has(nodeUrl)) {
            this.peers.set(nodeUrl, ws);
            this.knownPeers.add(nodeUrl);
            console.log(`🤝 Peer connected: ${nodeUrl} (chain length: ${chainLength})`);
            console.log(`   Total peers: ${this.peers.size}`);
        }

        // If peer has longer chain, request it
        if (chainLength > this.blockchain.chain.length) {
            console.log(`📥 Peer has longer chain (${chainLength} vs ${this.blockchain.chain.length}), requesting...`);
            this.sendMessage(ws, { type: MessageType.GET_CHAIN });
        }

        // Request peer list for discovery
        this.sendMessage(ws, { type: MessageType.GET_PEERS });
    }

    /**
     * Handle a new block broadcast.
     */
    handleNewBlock(blockData) {
        console.log(`📦 Received new block #${blockData.index} from peer`);

        const added = this.blockchain.addBlock(blockData);

        if (added) {
            console.log(`✅ Block #${blockData.index} added to chain`);
            // Save to storage if available
            if (this.blockchain.storage) {
                this.blockchain.storage.saveBlock(blockData);
            }
        } else {
            console.log(`❌ Block #${blockData.index} rejected`);
        }
    }

    /**
     * Handle a new transaction broadcast.
     */
    async handleNewTransaction(txData) {
        console.log(`📝 Received transaction from peer: ${txData.amount} NEKO`);

        try {
            const added = await this.blockchain.addReceivedTransaction(txData);
            if (added) {
                console.log(`✅ Transaction added to pending pool`);
            }
        } catch (error) {
            console.log(`❌ Transaction rejected: ${error.message}`);
        }
    }

    /**
     * Send our blockchain to a peer.
     */
    sendChain(ws) {
        this.sendMessage(ws, {
            type: MessageType.CHAIN,
            data: this.blockchain.chain
        });
    }

    /**
     * Handle receiving a blockchain from a peer.
     */
    handleChain(chainData) {
        console.log(`📥 Received chain with ${chainData.length} blocks`);

        if (chainData.length > this.blockchain.chain.length) {
            const replaced = this.blockchain.replaceChain(chainData);
            if (replaced) {
                console.log(`✅ Chain replaced with longer chain`);
            } else {
                console.log(`❌ Received chain is invalid`);
            }
        }
    }

    /**
     * Send our peer list to a peer.
     */
    sendPeers(ws) {
        const peerUrls = Array.from(this.peers.keys());
        this.sendMessage(ws, {
            type: MessageType.PEERS,
            data: peerUrls
        });
    }

    /**
     * Handle receiving a peer list.
     */
    handlePeers(peerUrls) {
        for (const url of peerUrls) {
            if (url !== this.nodeUrl && !this.peers.has(url)) {
                this.knownPeers.add(url);
            }
        }
        // Try to connect to new peers
        this.reconnectToPeers();
    }

    /**
     * Connect to a peer by URL.
     * 
     * @param {string} url - WebSocket URL of the peer
     */
    connectToPeer(url) {
        // Don't connect to ourselves
        if (url === this.nodeUrl) return;

        // Already connected
        if (this.peers.has(url)) return;

        try {
            const ws = new WebSocket(url);

            ws.on('open', () => {
                console.log(`🔗 Connected to peer: ${url}`);
                this.initConnection(ws, false);
                this.peers.set(url, ws);
                this.knownPeers.add(url);
            });

            ws.on('error', (error) => {
                // Silent fail for connection attempts
            });

        } catch (error) {
            // Silent fail
        }
    }

    /**
     * Discover peers from seed nodes.
     */
    discoverPeers() {
        console.log(`🔍 Discovering peers from ${this.seedNodes.length} seed nodes...`);

        for (const seedUrl of this.seedNodes) {
            if (seedUrl !== this.nodeUrl) {
                this.connectToPeer(seedUrl);
            }
        }
    }

    /**
     * Reconnect to known peers.
     */
    reconnectToPeers() {
        for (const url of this.knownPeers) {
            if (!this.peers.has(url) && url !== this.nodeUrl) {
                this.connectToPeer(url);
            }
        }
    }

    /**
     * Broadcast a new block to all peers.
     * 
     * @param {Block} block - The block to broadcast
     */
    broadcastBlock(block) {
        const message = {
            type: MessageType.NEW_BLOCK,
            data: {
                index: block.index,
                timestamp: block.timestamp,
                transactions: block.transactions,
                previousHash: block.previousHash,
                hash: block.hash,
                nonce: block.nonce
            }
        };

        console.log(`📡 Broadcasting block #${block.index} to ${this.peers.size} peer(s)...`);
        this.broadcast(message);
    }

    /**
     * Broadcast a new transaction to all peers.
     * 
     * @param {Transaction} tx - The transaction to broadcast
     */
    broadcastTransaction(tx) {
        const message = {
            type: MessageType.NEW_TX,
            data: {
                senderAddress: tx.senderAddress,
                receiverAddress: tx.receiverAddress,
                amount: tx.amount,
                timestamp: tx.timestamp,
                signature: tx.signature
            }
        };

        console.log(`📡 Broadcasting transaction to ${this.peers.size} peer(s)...`);
        this.broadcast(message);
    }

    /**
     * Broadcast a message to all connected peers.
     * 
     * @param {Object} message - The message to broadcast
     */
    broadcast(message) {
        const data = JSON.stringify(message);

        for (const [url, ws] of this.peers) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(data);
            }
        }
    }

    /**
     * Send a message to a specific peer.
     * 
     * @param {WebSocket} ws - The WebSocket connection
     * @param {Object} message - The message to send
     */
    sendMessage(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }

    /**
     * Get list of connected peers.
     */
    getPeers() {
        return Array.from(this.peers.keys());
    }

    /**
     * Get peer count.
     */
    getPeerCount() {
        return this.peers.size;
    }

    /**
     * Sync chain with peers (request from connected peers).
     */
    syncChain() {
        console.log(`🔄 Requesting chain sync from ${this.peers.size} peer(s)...`);

        for (const [url, ws] of this.peers) {
            if (ws.readyState === WebSocket.OPEN) {
                this.sendMessage(ws, { type: MessageType.GET_CHAIN });
            }
        }
    }

    /**
     * Shutdown the P2P network.
     */
    shutdown() {
        if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
        }

        // Close all connections
        for (const [url, ws] of this.peers) {
            ws.close();
        }

        if (this.wss) {
            this.wss.close();
        }

        console.log('👋 WebSocket P2P shutdown complete');
    }
}

module.exports = WebSocketP2P;
