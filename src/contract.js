/**
 * ========================================
 * NEKO CHAIN - SMART CONTRACT MODULE
 * ========================================
 * 
 * Handles smart contract deployment, storage, and execution.
 * 
 * EDUCATIONAL NOTES:
 * ==================
 * 
 * 1. CONTRACT ADDRESS
 *    - Generated from deployer address + nonce
 *    - Unique identifier for the contract
 * 
 * 2. CONTRACT STATE
 *    - Bytecode: The compiled contract code
 *    - Storage: Persistent key-value storage
 *    - Balance: NEKO held by the contract
 * 
 * 3. EXECUTION FLOW
 *    - User sends transaction to contract address
 *    - VM executes bytecode
 *    - Storage is updated
 *    - Gas is consumed
 */

const crypto = require('crypto');
const { VM, compile } = require('./vm');

class Contract {
    /**
     * Create a new contract.
     * 
     * @param {Object} options
     * @param {string} options.address - Contract address
     * @param {Buffer} options.bytecode - Compiled bytecode
     * @param {string} options.creator - Address of deployer
     * @param {Object} options.storage - Initial storage
     * @param {number} options.balance - Initial balance
     */
    constructor(options = {}) {
        this.address = options.address || '';
        this.bytecode = options.bytecode || Buffer.from([]);
        this.creator = options.creator || '';
        this.storage = new Map(Object.entries(options.storage || {}));
        this.balance = options.balance || 0;
        this.createdAt = options.createdAt || Date.now();
    }

    /**
     * Execute the contract.
     * 
     * @param {Object} context - Execution context
     * @param {string} context.caller - Who is calling
     * @param {number} context.value - NEKO sent with call
     * @param {Buffer} context.data - Call data (function selector + args)
     * @param {number} context.gasLimit - Maximum gas
     * @returns {Object} Execution result
     */
    execute(context = {}) {
        const vm = new VM({
            caller: context.caller || '0x0',
            value: context.value || 0,
            data: context.data || Buffer.from([]),
            gasLimit: context.gasLimit || 1000000,
            storage: this.storage
        });

        const result = vm.execute(this.bytecode);

        // Update storage if successful
        if (result.success) {
            this.storage = result.storage;
        }

        // Update balance if value was sent
        if (result.success && context.value > 0) {
            this.balance += context.value;
        }

        return result;
    }

    /**
     * Get storage value.
     * 
     * @param {string} key - Storage key
     * @returns {any} Storage value
     */
    getStorage(key) {
        return this.storage.get(key.toString());
    }

    /**
     * Convert to plain object for storage.
     */
    toJSON() {
        return {
            address: this.address,
            bytecode: Array.from(this.bytecode),
            creator: this.creator,
            storage: Object.fromEntries(this.storage),
            balance: this.balance,
            createdAt: this.createdAt
        };
    }

    /**
     * Create from plain object.
     */
    static fromJSON(data) {
        return new Contract({
            address: data.address,
            bytecode: Buffer.from(data.bytecode || []),
            creator: data.creator,
            storage: data.storage || {},
            balance: data.balance || 0,
            createdAt: data.createdAt
        });
    }
}

class ContractManager {
    /**
     * Manage contracts on the blockchain.
     * 
     * @param {Storage} storage - LevelDB storage instance
     */
    constructor(storage = null) {
        this.storage = storage;
        this.contracts = new Map();  // address -> Contract
        this.deployNonce = new Map();  // address -> nonce
    }

    /**
     * Generate a contract address.
     * 
     * @param {string} deployer - Deployer's address
     * @param {number} nonce - Deployer's nonce
     * @returns {string} Contract address
     */
    generateAddress(deployer, nonce) {
        const data = `${deployer}${nonce}${Date.now()}`;
        return 'contract_' + crypto.createHash('sha256')
            .update(data)
            .digest('hex')
            .substring(0, 40);
    }

    /**
     * Deploy a new contract.
     * 
     * @param {Object} options
     * @param {string} options.deployer - Deployer's address
     * @param {Buffer|string} options.bytecode - Contract bytecode or source
     * @param {boolean} options.isSource - If true, compile source first
     * @param {number} options.value - Initial NEKO to send
     * @param {number} options.gasLimit - Gas limit for constructor
     * @returns {Object} Deployment result
     */
    async deploy(options = {}) {
        const { deployer, bytecode, isSource, value, gasLimit } = options;

        // Get deployer nonce
        const nonce = this.deployNonce.get(deployer) || 0;
        this.deployNonce.set(deployer, nonce + 1);

        // Generate contract address
        const address = this.generateAddress(deployer, nonce);

        // Compile if source
        let compiledBytecode;
        if (isSource && typeof bytecode === 'string') {
            try {
                compiledBytecode = compile(bytecode);
            } catch (error) {
                return {
                    success: false,
                    error: `Compilation failed: ${error.message}`
                };
            }
        } else if (Buffer.isBuffer(bytecode)) {
            compiledBytecode = bytecode;
        } else if (Array.isArray(bytecode)) {
            compiledBytecode = Buffer.from(bytecode);
        } else {
            return {
                success: false,
                error: 'Invalid bytecode format'
            };
        }

        // Create contract
        const contract = new Contract({
            address,
            bytecode: compiledBytecode,
            creator: deployer,
            balance: value || 0
        });

        // Run constructor (execute bytecode once)
        const result = contract.execute({
            caller: deployer,
            value: value || 0,
            data: Buffer.from([]),
            gasLimit: gasLimit || 1000000
        });

        if (!result.success) {
            return {
                success: false,
                error: `Constructor failed: ${result.error}`,
                gasUsed: result.gasUsed
            };
        }

        // Store contract
        this.contracts.set(address, contract);

        // Persist to storage if available
        if (this.storage) {
            await this.saveContract(contract);
        }

        console.log(`📜 Contract deployed at: ${address}`);

        return {
            success: true,
            address,
            gasUsed: result.gasUsed,
            logs: result.logs
        };
    }

    /**
     * Call a contract.
     * 
     * @param {Object} options
     * @param {string} options.contractAddress - Contract to call
     * @param {string} options.caller - Who is calling
     * @param {Buffer} options.data - Call data
     * @param {number} options.value - NEKO to send
     * @param {number} options.gasLimit - Gas limit
     * @returns {Object} Call result
     */
    async call(options = {}) {
        const { contractAddress, caller, data, value, gasLimit } = options;

        // Get contract
        let contract = this.contracts.get(contractAddress);

        if (!contract && this.storage) {
            contract = await this.loadContract(contractAddress);
        }

        if (!contract) {
            return {
                success: false,
                error: 'Contract not found'
            };
        }

        // Execute
        const result = contract.execute({
            caller,
            value: value || 0,
            data: data || Buffer.from([]),
            gasLimit: gasLimit || 1000000
        });

        // Persist updated storage
        if (result.success && this.storage) {
            await this.saveContract(contract);
        }

        return result;
    }

    /**
     * Get a contract by address.
     */
    async getContract(address) {
        let contract = this.contracts.get(address);

        if (!contract && this.storage) {
            contract = await this.loadContract(address);
        }

        return contract;
    }

    /**
     * Save contract to LevelDB.
     */
    async saveContract(contract) {
        if (!this.storage || !this.storage.db) return;

        const data = contract.toJSON();
        // Convert BigInt to string for JSON
        if (data.storage) {
            for (const key in data.storage) {
                if (typeof data.storage[key] === 'bigint') {
                    data.storage[key] = data.storage[key].toString();
                }
            }
        }

        await this.storage.db.put(`contract:${contract.address}`, data);
    }

    /**
     * Load contract from LevelDB.
     */
    async loadContract(address) {
        if (!this.storage || !this.storage.db) return null;

        try {
            const data = await this.storage.db.get(`contract:${address}`);
            const contract = Contract.fromJSON(data);
            this.contracts.set(address, contract);
            return contract;
        } catch (error) {
            if (error.code === 'LEVEL_NOT_FOUND') {
                return null;
            }
            throw error;
        }
    }

    /**
     * Get all deployed contracts.
     */
    async getAllContracts() {
        const contracts = [];

        if (this.storage && this.storage.db) {
            for await (const [key, value] of this.storage.db.iterator({
                gte: 'contract:',
                lte: 'contract:\xFF'
            })) {
                contracts.push(Contract.fromJSON(value));
            }
        } else {
            for (const contract of this.contracts.values()) {
                contracts.push(contract);
            }
        }

        return contracts;
    }
}

module.exports = { Contract, ContractManager };
