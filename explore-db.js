/**
 * ========================================
 * NEKO COIN - LevelDB Explorer
 * ========================================
 * 
 * Utility script to explore the contents of the LevelDB database.
 * 
 * Usage:
 *   node explore-db.js [port]
 * 
 * Examples:
 *   node explore-db.js          # Explores blockchain-data-3000
 *   node explore-db.js 3001     # Explores blockchain-data-3001
 */

const { Level } = require('level');

// Get port from command line or default to 3000
const PORT = process.argv[2] || '3000';
const DB_PATH = `./blockchain-data-${PORT}`;

async function explore() {
    console.log('========================================');
    console.log('🐱 NEKO COIN - LevelDB Explorer');
    console.log('========================================');
    console.log(`📁 Database: ${DB_PATH}\n`);

    let db;
    try {
        db = new Level(DB_PATH, {
            valueEncoding: 'json',
            createIfMissing: false
        });
        await db.open();
    } catch (error) {
        if (error.code === 'LEVEL_DATABASE_NOT_OPEN' || error.code === 'LEVEL_LOCKED') {
            console.log(`⚠️  Database is locked! Make sure the node server is not running.`);
            console.log(`   Stop the server first, then run this script again.`);
        } else if (error.message.includes('does not exist')) {
            console.log(`❌ Database not found at ${DB_PATH}`);
            console.log(`   Run the node first: node src/index.js ${PORT}`);
        } else {
            console.log(`❌ Could not open database: ${error.message}`);
        }
        return;
    }

    // Collect stats
    const stats = {
        blocks: [],
        pending: [],
        transactions: [],
        metadata: []
    };

    // Iterate through all entries
    for await (const [key, value] of db.iterator()) {
        if (key.startsWith('block:')) {
            stats.blocks.push({ key, value });
        } else if (key.startsWith('pending:')) {
            stats.pending.push({ key, value });
        } else if (key.startsWith('tx:')) {
            stats.transactions.push({ key, value });
        } else if (key.startsWith('height:')) {
            // Skip height mappings in display
        } else if (key.startsWith('meta:')) {
            stats.metadata.push({ key, value });
        }
    }

    // Display Metadata
    console.log('📊 METADATA');
    console.log('----------------------------------------');
    if (stats.metadata.length === 0) {
        console.log('   (no metadata)');
    } else {
        for (const { key, value } of stats.metadata) {
            console.log(`   ${key}: ${value}`);
        }
    }
    console.log('');

    // Display Blocks
    console.log(`📦 BLOCKS (${stats.blocks.length} total)`);
    console.log('----------------------------------------');
    for (const { value: block } of stats.blocks.sort((a, b) => a.value.index - b.value.index)) {
        console.log(`   Block #${block.index}`);
        console.log(`      Hash:     ${block.hash.substring(0, 20)}...`);
        console.log(`      PrevHash: ${block.previousHash.substring(0, 20)}...`);
        console.log(`      Nonce:    ${block.nonce}`);
        console.log(`      Tx Count: ${block.transactions.length}`);
        console.log(`      Time:     ${new Date(block.timestamp).toISOString()}`);
        console.log('');
    }

    // Display Pending Transactions
    console.log(`⏳ PENDING TRANSACTIONS (${stats.pending.length} total)`);
    console.log('----------------------------------------');
    if (stats.pending.length === 0) {
        console.log('   (no pending transactions)');
    } else {
        for (const { value: tx } of stats.pending) {
            console.log(`   From:   ${tx.senderAddress ? tx.senderAddress.substring(0, 20) + '...' : 'MINING REWARD'}`);
            console.log(`   To:     ${tx.receiverAddress.substring(0, 20)}...`);
            console.log(`   Amount: ${tx.amount} NEKO`);
            console.log('');
        }
    }

    // Display Transaction Index
    console.log(`🔗 TRANSACTION INDEX (${stats.transactions.length} total)`);
    console.log('----------------------------------------');
    if (stats.transactions.length === 0) {
        console.log('   (no transactions indexed)');
    } else {
        for (const { key, value } of stats.transactions.slice(0, 10)) {
            const txHash = key.replace('tx:', '');
            console.log(`   ${txHash} → Block #${value.blockIndex}`);
        }
        if (stats.transactions.length > 10) {
            console.log(`   ... and ${stats.transactions.length - 10} more`);
        }
    }

    console.log('');
    console.log('========================================');
    console.log('✅ Exploration complete!');
    console.log('========================================');

    await db.close();
}

explore().catch(console.error);
