#!/usr/bin/env node
/**
 * ========================================
 * NEKO CHAIN - AUTO-MINER v2.0 (Multi-Node)
 * ========================================
 * 
 * A standalone script that continuously mines blocks in the background.
 * Now supports connecting to multiple nodes simultaneously!
 * 
 * Usage:
 *   node miner.js [wallet-address] [node-urls...]
 * 
 * Examples:
 *   node miner.js                           # Creates new wallet, uses default nodes
 *   node miner.js 04abc123...               # Uses existing wallet with default nodes
 *   node miner.js 04abc123... http://localhost:3000 http://localhost:3001
 * 
 * EDUCATIONAL NOTES:
 * ==================
 * 
 * This miner demonstrates how mining works in a blockchain:
 * 1. Connect to blockchain nodes
 * 2. Request to mine pending transactions
 * 3. Solve Proof of Work (find valid hash)
 * 4. Receive mining reward
 * 5. Block is broadcast to all connected nodes
 * 6. Repeat continuously
 * 
 * In real cryptocurrencies, miners compete globally.
 * The first to solve the puzzle gets the reward.
 */

const axios = require('axios');

// Configuration
const DEFAULT_NODES = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
];

// Parse command line arguments
let walletAddress = null;
let nodeUrls = [];

// Check if second arg is a wallet address or URL
if (process.argv[2]) {
    if (process.argv[2].startsWith('04')) {
        walletAddress = process.argv[2];
        // Rest are node URLs
        nodeUrls = process.argv.slice(3);
    } else if (process.argv[2].startsWith('http')) {
        // No wallet, just URLs
        nodeUrls = process.argv.slice(2);
    }
}

// Use default nodes if none specified
if (nodeUrls.length === 0) {
    nodeUrls = DEFAULT_NODES;
}

const MINING_INTERVAL_MS = 5000;  // Wait 5 seconds between mining attempts

// Stats
let stats = {
    startTime: Date.now(),
    blocksMined: 0,
    totalRewards: 0,
    totalAttempts: 0,
    lastBlockTime: null,
    activeNodes: [],
};

/**
 * Display banner
 */
function showBanner() {
    console.log('\n');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║  🐱 NEKO CHAIN AUTO-MINER v2.0 (Multi)    ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log('║  Mining blocks on multiple nodes...      ║');
    console.log('║  Press Ctrl+C to stop                    ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log('\n');
}

/**
 * Check which nodes are online
 */
async function discoverActiveNodes() {
    console.log('🔍 Discovering active nodes...');
    stats.activeNodes = [];

    for (const nodeUrl of nodeUrls) {
        try {
            await axios.get(`${nodeUrl}/stats`, { timeout: 2000 });
            stats.activeNodes.push(nodeUrl);
            console.log(`   ✅ ${nodeUrl} - Online`);
        } catch (error) {
            console.log(`   ❌ ${nodeUrl} - Offline`);
        }
    }

    if (stats.activeNodes.length === 0) {
        console.error('\n❌ No active nodes found! Make sure at least one node is running.');
        process.exit(1);
    }

    console.log(`\n📡 Connected to ${stats.activeNodes.length} node(s)`);
    return stats.activeNodes;
}

/**
 * Get the best node (one with most pending transactions)
 */
async function getBestNode() {
    let bestNode = stats.activeNodes[0];
    let maxPending = 0;

    for (const nodeUrl of stats.activeNodes) {
        try {
            const response = await axios.get(`${nodeUrl}/pending`, { timeout: 2000 });
            if (response.data.count > maxPending) {
                maxPending = response.data.count;
                bestNode = nodeUrl;
            }
        } catch (error) {
            // Node might be down, will be removed in next discovery
        }
    }

    return bestNode;
}

/**
 * Create a new wallet or use provided one
 */
async function getWallet() {
    if (walletAddress) {
        console.log('📍 Using provided wallet address');
        return { publicKey: walletAddress };
    }

    console.log('🔑 Creating new wallet...');
    const nodeUrl = stats.activeNodes[0];

    try {
        const response = await axios.post(`${nodeUrl}/wallet/create`);
        console.log('✅ New wallet created!');
        console.log(`   Address: ${response.data.publicKey.substring(0, 40)}...`);
        console.log(`   ⚠️  Private Key: ${response.data.privateKey.substring(0, 20)}...`);
        console.log('   SAVE YOUR PRIVATE KEY! It won\'t be shown again.\n');
        return response.data;
    } catch (error) {
        console.error('❌ Failed to create wallet:', error.message);
        process.exit(1);
    }
}

/**
 * Get balance across all nodes (use highest)
 */
async function getBalance(address) {
    let maxBalance = 0;

    for (const nodeUrl of stats.activeNodes) {
        try {
            const response = await axios.get(`${nodeUrl}/balance/${encodeURIComponent(address)}`, { timeout: 2000 });
            if (response.data.balance > maxBalance) {
                maxBalance = response.data.balance;
            }
        } catch (error) {
            // Ignore
        }
    }

    return maxBalance;
}

/**
 * Get pending transaction count from all nodes
 */
async function getTotalPending() {
    let totalPending = 0;

    for (const nodeUrl of stats.activeNodes) {
        try {
            const response = await axios.get(`${nodeUrl}/pending`, { timeout: 2000 });
            totalPending += response.data.count;
        } catch (error) {
            // Ignore
        }
    }

    return totalPending;
}

/**
 * Mine a block on a specific node
 */
async function mineBlock(minerAddress) {
    stats.totalAttempts++;

    // Get best node to mine on
    const nodeUrl = await getBestNode();

    try {
        console.log(`   Mining on: ${nodeUrl}`);

        const response = await axios.post(`${nodeUrl}/mine`, {
            minerAddress: minerAddress
        });

        const block = response.data.block;
        const miningTime = response.data.miningTime;

        stats.blocksMined++;
        stats.totalRewards += 50;  // Mining reward
        stats.lastBlockTime = new Date();

        console.log('\n✅ Block Mined Successfully!');
        console.log(`   📦 Block #${block.index}`);
        console.log(`   🔗 Hash: ${block.hash.substring(0, 24)}...`);
        console.log(`   ⏱️  Time: ${miningTime}`);
        console.log(`   💰 Reward: 50 NEKO`);
        console.log(`   � Broadcast to: ${response.data.broadcastedTo || 'peers'}`);
        console.log(`   �📊 Total Mined: ${stats.blocksMined} blocks (${stats.totalRewards} NEKO)`);

        return true;
    } catch (error) {
        if (error.response) {
            console.error('❌ Mining failed:', error.response.data.error);
        } else {
            console.error('❌ Mining failed:', error.message);
            // Remove this node from active list
            stats.activeNodes = stats.activeNodes.filter(n => n !== nodeUrl);
            if (stats.activeNodes.length === 0) {
                console.log('🔍 No active nodes, rediscovering...');
                await discoverActiveNodes();
            }
        }
        return false;
    }
}

/**
 * Show current stats
 */
async function showStats(address) {
    const balance = await getBalance(address);
    const pending = await getTotalPending();
    const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;

    console.log('\n📊 Miner Statistics');
    console.log('─'.repeat(40));
    console.log(`   💰 Current Balance: ${balance} NEKO`);
    console.log(`   ⛏️  Blocks Mined: ${stats.blocksMined}`);
    console.log(`   🎁 Total Rewards: ${stats.totalRewards} NEKO`);
    console.log(`   📝 Pending Transactions: ${pending}`);
    console.log(`   📡 Active Nodes: ${stats.activeNodes.length}`);
    console.log(`   ⏰ Uptime: ${hours}h ${minutes}m ${seconds}s`);
    console.log('─'.repeat(40));
}

/**
 * Main mining loop
 */
async function startMining() {
    showBanner();

    // Discover active nodes
    await discoverActiveNodes();

    // Get or create wallet
    const wallet = await getWallet();
    const minerAddress = wallet.publicKey;

    console.log(`\n⛏️  Starting mining loop...`);
    console.log(`   Miner Address: ${minerAddress.substring(0, 40)}...`);
    console.log(`   Mining Interval: ${MINING_INTERVAL_MS / 1000} seconds`);
    console.log(`   Active Nodes: ${stats.activeNodes.length}\n`);

    // Initial stats
    await showStats(minerAddress);

    // Mining loop
    let iteration = 0;

    const miningLoop = async () => {
        iteration++;
        console.log(`\n⛏️  [${new Date().toLocaleTimeString()}] Mining attempt #${iteration}...`);

        await mineBlock(minerAddress);

        // Show stats every 5 blocks
        if (stats.blocksMined % 5 === 0 && stats.blocksMined > 0) {
            await showStats(minerAddress);
        }

        // Rediscover nodes every 10 attempts
        if (iteration % 10 === 0) {
            console.log('\n🔄 Refreshing node list...');
            await discoverActiveNodes();
        }

        // Schedule next mining
        setTimeout(miningLoop, MINING_INTERVAL_MS);
    };

    // Start the loop
    miningLoop();
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\n🛑 Stopping miner...');
    console.log('\n📊 Final Statistics');
    console.log('═'.repeat(40));
    console.log(`   ⛏️  Total Blocks Mined: ${stats.blocksMined}`);
    console.log(`   🎁 Total Rewards Earned: ${stats.totalRewards} NEKO`);
    console.log(`   📡 Nodes Used: ${nodeUrls.length}`);
    console.log(`   ⏰ Session Duration: ${Math.floor((Date.now() - stats.startTime) / 1000)} seconds`);
    console.log('═'.repeat(40));
    console.log('\n👋 Thanks for mining NEKO! Goodbye.\n');
    process.exit(0);
});

// Start mining
startMining().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
