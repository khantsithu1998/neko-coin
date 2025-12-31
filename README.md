# 🐱 Neko Coin Blockchain

A minimal, educational blockchain implementation built with Node.js. This project demonstrates core cryptocurrency and P2P networking concepts in a clear, readable way.

**⚠️ This is NOT a production system. It's for learning only.**

## 📁 Project Structure

```
neko-coin/
├── miner.js               # Auto-miner standalone script
├── package.json
├── README.md
├── src/                   # Backend
│   ├── index.js           # Express API server (P2P enabled)
│   ├── blockchain.js      # Blockchain class (chain management)
│   ├── block.js           # Block class (mining, hashing)
│   ├── transaction.js     # Transaction class (signing)
│   ├── wallet.js          # Wallet utilities (key pairs)
│   └── p2p.js             # P2P networking module
└── frontend/              # Next.js PWA wallet UI
    └── src/app/           # Pages (wallet, send, mine, explorer)
```

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm

### Installation

```bash
cd neko-coin
npm install
npm start
```

Backend runs at `http://localhost:3000`

### Running Frontend (Wallet UI)

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:8000`

### Running Multiple Nodes

```bash
# Terminal 1 - Main node
node src/index.js 3000

# Terminal 2 - Additional node
node src/index.js 3001

# Terminal 3 - Additional node
node src/index.js 3002
```

Nodes **auto-discover** each other and sync automatically!

---

## ⛏️ Auto-Miner v2.0 (Multi-Node)

A standalone script that mines blocks on multiple nodes simultaneously.

### Quick Start

```bash
# Terminal 1+ : Start blockchain nodes
node src/index.js 3000
node src/index.js 3001

# Another Terminal - Start auto-miner
node miner.js
```

### Usage Options

```bash
# Auto-discover nodes and create new wallet
node miner.js

# Use existing wallet with auto-discovery
node miner.js YOUR_PUBLIC_KEY

# Connect to specific nodes
node miner.js YOUR_PUBLIC_KEY http://localhost:3000 http://localhost:3001
```

### Features
- 🔍 **Auto-Discovery** - Finds all active nodes automatically
- 📡 **Multi-Node** - Connects to all available nodes (default: 3000-3003)
- 🎯 **Smart Mining** - Mines on node with most pending transactions
- 🔄 **Auto-Refresh** - Refreshes node list every 10 attempts
- 💪 **Resilient** - Removes offline nodes, rediscovers when needed
- 🔑 Auto-creates wallet if not provided
- ⛏️ Mines blocks every 5 seconds
- 📊 Shows live stats (blocks mined, rewards, balance)
- 💰 Earns 50 NEKO per block

Press `Ctrl+C` to stop and see final statistics.

---

## 📚 Educational Concepts

### 1. Hashing (SHA-256)

A hash function takes any input and produces a fixed-size output (256 bits). Same input always produces the same output. Any tiny change = completely different output.

```javascript
hash = SHA256(index + timestamp + transactions + previousHash + nonce)
```

### 2. Digital Signatures (ECDSA)

- Proves YOU authorized a transaction
- Only the private key owner can create valid signatures
- Anyone can verify with the public key

```javascript
signature = ECDSA.sign(transactionHash, privateKey)
isValid = ECDSA.verify(transactionHash, signature, publicKey)
```

### 3. Mining (Proof of Work)

Find a "nonce" that makes the hash start with zeros:

```
Target: Hash must start with "0000"
Attempt 847293: nonce=847293 → hash="0000abc..."  ✅ FOUND!
```

### 4. Balance Calculation

Balances are NOT stored. They're calculated by scanning ALL transactions:

```
for each transaction:
    if you're receiver: balance += amount
    if you're sender:   balance -= amount
```

### 5. P2P Networking

- Nodes connect and share transactions/blocks
- "Longest chain wins" resolves conflicts
- Decentralized: no single point of failure

---

## 🔌 API Reference

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/wallet/create` | Create new wallet |
| POST | `/transaction` | Send coins (returns txHash) |
| GET | `/transaction/status/:hash` | Check transaction status |
| POST | `/mine` | Mine pending transactions |
| GET | `/chain` | View blockchain |
| GET | `/balance/:address` | Check balance |
| GET | `/pending` | View pending transactions |
| GET | `/validate` | Validate chain integrity |

### P2P Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/peers` | List connected peers |
| POST | `/peers/connect` | Connect to a peer node |
| POST | `/sync` | Sync chain with peers |

### Seed Node Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/seeds` | List all seed nodes |
| POST | `/seeds/add` | Add a seed node dynamically |
| POST | `/seeds/remove` | Remove a seed node |

---

## 🎮 Example Workflow (curl)

### Step 1: Create Wallets

```bash
# Create Alice's wallet
curl -X POST http://localhost:3000/wallet/create

# Response:
# {
#   "publicKey": "04a1b2c3...",
#   "privateKey": "abc123..."
# }

# Create Bob's wallet
curl -X POST http://localhost:3000/wallet/create
```

### Step 2: Mine Coins for Alice

```bash
curl -X POST http://localhost:3000/mine \
  -H "Content-Type: application/json" \
  -d '{"minerAddress": "ALICE_PUBLIC_KEY"}'
```

### Step 3: Send Coins to Bob

```bash
curl -X POST http://localhost:3000/transaction \
  -H "Content-Type: application/json" \
  -d '{
    "senderPrivateKey": "ALICE_PRIVATE_KEY",
    "receiverAddress": "BOB_PUBLIC_KEY",
    "amount": 25
  }'
```

### Step 4: Mine to Confirm Transaction

```bash
curl -X POST http://localhost:3000/mine \
  -H "Content-Type: application/json" \
  -d '{"minerAddress": "ALICE_PUBLIC_KEY"}'
```

### Step 5: Check Balances

```bash
# Check Alice's balance
curl http://localhost:3000/balance/ALICE_PUBLIC_KEY

# Check Bob's balance
curl http://localhost:3000/balance/BOB_PUBLIC_KEY
```

### Step 6: View Blockchain

```bash
curl http://localhost:3000/chain
```

### Step 7: Validate Chain

```bash
curl http://localhost:3000/validate
```

---

## 📡 P2P Network (Multi-Node)

### Connect Nodes

```bash
# Start 3 nodes in separate terminals first

# Connect Node 1 to Node 2
curl -X POST http://localhost:3000/peers/connect \
  -H "Content-Type: application/json" \
  -d '{"peerUrl": "http://localhost:3001"}'

# Connect Node 1 to Node 3
curl -X POST http://localhost:3000/peers/connect \
  -H "Content-Type: application/json" \
  -d '{"peerUrl": "http://localhost:3002"}'
```

### List Peers

```bash
curl http://localhost:3000/peers
```

### Sync Chain with Peers

```bash
# Sync Node 2 with peers (gets longest valid chain)
curl -X POST http://localhost:3001/sync

# Sync Node 3 with peers
curl -X POST http://localhost:3002/sync
```

### View Stats

```bash
curl http://localhost:3000/stats
```

---

## ⚙️ Configuration

Edit these values in `blockchain.js`:

```javascript
this.difficulty = 4;      // More zeros = harder mining
this.miningReward = 50;   // Coins per mined block
```

---

## 🤔 FAQ

**Q: Why is mining slow?**
A: Proof of Work requires computation. Difficulty=4 means hash must start with "0000".

**Q: How does P2P sync work?**
A: Nodes use "longest valid chain wins". When you call `/sync`, it replaces your chain with the longest valid one from peers.

**Q: Can transactions be forged?**
A: No. Each transaction is signed with the sender's private key. Without it, the signature will be invalid.

---

## 🚀 Production Roadmap

This is an **educational project**. For production use, you would need:

### 🔐 Security

| Feature | Current | Production Needed | Why? |
|---------|---------|-------------------|------|
| Data Storage | In-memory | Persistent database (LevelDB, PostgreSQL) | Data survives restarts; can't lose blockchain on crash |
| Private Keys | localStorage | Hardware wallet / encrypted keystore | localStorage is readable by any JS; easily stolen |
| API Authentication | None | JWT tokens, rate limiting | Prevent unauthorized access and spam attacks |
| HTTPS | No | Yes, with SSL certificates | Prevent man-in-the-middle attacks on transactions |
| Input Validation | Basic | Comprehensive sanitization | Prevent injection attacks and malformed data |

### 🌐 Networking

| Feature | Current | Production Needed | Why? |
|---------|---------|-------------------|------|
| P2P Protocol | HTTP polling | WebSockets / libp2p | Real-time updates; HTTP polling is slow and wasteful |
| Peer Discovery | Seed nodes | DHT / DNS seeds | Decentralized discovery; seed nodes are single point of failure |
| Node Communication | Unencrypted | TLS encryption | Prevent eavesdropping on transaction data |
| DDoS Protection | None | Rate limiting, PoW challenges | Attackers can flood network and halt operations |

### ⚡ Performance

| Feature | Current | Production Needed | Why? |
|---------|---------|-------------------|------|
| Transaction Pool | Array | Priority queue with fees | Miners should prioritize higher-fee transactions |
| Block Size | Unlimited | Block size limits | Prevent bloated blocks that slow down network |
| Mempool | No limit | Size limit with eviction | Prevent memory exhaustion; remove stale transactions |
| UTXO Model | Balance scan | UTXO set with merkle proofs | O(1) validation vs O(n) scanning entire chain |

### 📊 Features to Add

| Feature | Why Needed? |
|---------|-------------|
| **Transaction Fees** | Incentivize miners when block rewards decrease |
| **Merkle Trees** | Verify transactions without downloading full blocks (SPV) |
| **SPV Clients** | Light wallets for mobile devices with limited storage |
| **Smart Contracts** | Programmable money for DeFi, NFTs, DAOs |
| **Multi-sig Wallets** | Require multiple approvals for large transactions |
| **HD Wallets** | Generate many addresses from one seed phrase |
| **Difficulty Adjustment** | Keep block time consistent as hashrate changes |
| **Halving Events** | Control inflation; create scarcity over time |

### 🧪 Testing

| Test Type | Why Needed? |
|-----------|-------------|
| Unit tests | Catch bugs in individual functions before deployment |
| Integration tests | Ensure P2P, mining, and transactions work together |
| Load testing | Verify network handles high transaction volume |
| Security audits | Professional review to find vulnerabilities |
| Formal verification | Mathematical proof that consensus is correct |

---

## 📖 Further Reading

- [Bitcoin Whitepaper](https://bitcoin.org/bitcoin.pdf)
- [How Bitcoin Works (YouTube)](https://www.youtube.com/watch?v=bBC-nXj3Ng4)
- [SHA-256 Explained](https://en.wikipedia.org/wiki/SHA-2)
- [ECDSA Cryptography](https://en.wikipedia.org/wiki/Elliptic-curve_cryptography)
- [Building a Blockchain (Naivecoin)](https://lhartikk.github.io/)
- [libp2p Documentation](https://docs.libp2p.io/)

---

*Made with 🐱 for educational purposes*

