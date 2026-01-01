/**
 * ========================================
 * NEKO CHAIN - VIRTUAL MACHINE (VM)
 * ========================================
 * 
 * A stack-based Virtual Machine for executing smart contracts.
 * 
 * EDUCATIONAL NOTES:
 * ==================
 * 
 * 1. WHAT IS A VM?
 *    - Executes bytecode instructions
 *    - Has a stack for operations
 *    - Has memory for temporary data
 *    - Has storage for persistent state
 * 
 * 2. STACK-BASED
 *    - Operations push/pop from stack
 *    - ADD: pop 2 values, push sum
 *    - Simple and secure
 * 
 * 3. GAS
 *    - Each operation costs gas
 *    - Prevents infinite loops
 *    - User pays for computation
 * 
 * 4. SIMILAR TO
 *    - Ethereum Virtual Machine (EVM)
 *    - Java Virtual Machine (JVM)
 */

// Opcodes - Instructions the VM understands
const OPCODES = {
    // Stack Operations
    STOP: 0x00,      // Halt execution
    PUSH1: 0x01,     // Push 1 byte to stack
    PUSH32: 0x02,    // Push 32 bytes to stack
    POP: 0x03,       // Remove top of stack
    DUP: 0x04,       // Duplicate top of stack
    SWAP: 0x05,      // Swap top 2 stack items

    // Arithmetic
    ADD: 0x10,       // a + b
    SUB: 0x11,       // a - b
    MUL: 0x12,       // a * b
    DIV: 0x13,       // a / b
    MOD: 0x14,       // a % b

    // Comparison
    LT: 0x20,        // a < b
    GT: 0x21,        // a > b
    EQ: 0x22,        // a == b
    ISZERO: 0x23,    // a == 0

    // Logic
    AND: 0x30,       // a & b
    OR: 0x31,        // a | b
    NOT: 0x32,       // !a

    // Control Flow
    JUMP: 0x40,      // Jump to position
    JUMPI: 0x41,     // Conditional jump
    JUMPDEST: 0x42,  // Mark valid jump destination

    // Environment
    CALLER: 0x50,    // Get caller address
    CALLVALUE: 0x51, // Get sent value
    CALLDATALOAD: 0x52, // Load call data
    CALLDATASIZE: 0x53, // Get call data size

    // Storage
    SLOAD: 0x60,     // Load from storage
    SSTORE: 0x61,    // Store to storage

    // Memory
    MLOAD: 0x70,     // Load from memory
    MSTORE: 0x71,    // Store to memory

    // System
    RETURN: 0x80,    // Return data
    REVERT: 0x81,    // Revert execution
    LOG: 0x90,       // Emit event log
};

// Gas costs for each operation
const GAS_COSTS = {
    [OPCODES.STOP]: 0,
    [OPCODES.PUSH1]: 3,
    [OPCODES.PUSH32]: 3,
    [OPCODES.POP]: 2,
    [OPCODES.DUP]: 3,
    [OPCODES.SWAP]: 3,
    [OPCODES.ADD]: 3,
    [OPCODES.SUB]: 3,
    [OPCODES.MUL]: 5,
    [OPCODES.DIV]: 5,
    [OPCODES.MOD]: 5,
    [OPCODES.LT]: 3,
    [OPCODES.GT]: 3,
    [OPCODES.EQ]: 3,
    [OPCODES.ISZERO]: 3,
    [OPCODES.AND]: 3,
    [OPCODES.OR]: 3,
    [OPCODES.NOT]: 3,
    [OPCODES.JUMP]: 8,
    [OPCODES.JUMPI]: 10,
    [OPCODES.JUMPDEST]: 1,
    [OPCODES.CALLER]: 2,
    [OPCODES.CALLVALUE]: 2,
    [OPCODES.CALLDATALOAD]: 3,
    [OPCODES.CALLDATASIZE]: 2,
    [OPCODES.SLOAD]: 200,    // Storage is expensive
    [OPCODES.SSTORE]: 5000,  // Writing storage is very expensive
    [OPCODES.MLOAD]: 3,
    [OPCODES.MSTORE]: 3,
    [OPCODES.RETURN]: 0,
    [OPCODES.REVERT]: 0,
    [OPCODES.LOG]: 375,
};

class VM {
    /**
     * Create a new VM instance.
     * 
     * @param {Object} context - Execution context
     * @param {string} context.caller - Address of caller
     * @param {number} context.value - Value sent with call
     * @param {Buffer} context.data - Call data
     * @param {number} context.gasLimit - Maximum gas allowed
     * @param {Object} context.storage - Contract storage object
     */
    constructor(context = {}) {
        this.stack = [];
        this.memory = new Map();
        this.storage = context.storage || new Map();
        this.pc = 0;  // Program counter
        this.gasUsed = 0;
        this.gasLimit = context.gasLimit || 1000000;
        this.caller = context.caller || '0x0';
        this.value = context.value || 0;
        this.callData = context.data || Buffer.from([]);
        this.returnData = Buffer.from([]);
        this.logs = [];
        this.stopped = false;
        this.reverted = false;
        this.jumpDests = new Set();
    }

    /**
     * Execute bytecode.
     * 
     * @param {Buffer} bytecode - The contract bytecode
     * @returns {Object} Execution result
     */
    execute(bytecode) {
        // First pass: find valid jump destinations
        this.findJumpDests(bytecode);

        // Execute bytecode
        while (this.pc < bytecode.length && !this.stopped) {
            const opcode = bytecode[this.pc];

            // Check gas
            const gasCost = GAS_COSTS[opcode] || 3;
            if (this.gasUsed + gasCost > this.gasLimit) {
                this.reverted = true;
                this.stopped = true;
                return this.getResult('Out of gas');
            }
            this.gasUsed += gasCost;

            // Execute opcode
            try {
                this.executeOpcode(opcode, bytecode);
            } catch (error) {
                this.reverted = true;
                this.stopped = true;
                return this.getResult(error.message);
            }

            this.pc++;
        }

        return this.getResult();
    }

    /**
     * Find all valid jump destinations.
     */
    findJumpDests(bytecode) {
        for (let i = 0; i < bytecode.length; i++) {
            if (bytecode[i] === OPCODES.JUMPDEST) {
                this.jumpDests.add(i);
            }
            // Skip PUSH data
            if (bytecode[i] === OPCODES.PUSH1) i += 1;
            if (bytecode[i] === OPCODES.PUSH32) i += 32;
        }
    }

    /**
     * Execute a single opcode.
     */
    executeOpcode(opcode, bytecode) {
        switch (opcode) {
            case OPCODES.STOP:
                this.stopped = true;
                break;

            case OPCODES.PUSH1:
                this.pc++;
                this.stack.push(BigInt(bytecode[this.pc] || 0));
                break;

            case OPCODES.PUSH32:
                let value = BigInt(0);
                for (let i = 0; i < 32; i++) {
                    this.pc++;
                    value = (value << 8n) | BigInt(bytecode[this.pc] || 0);
                }
                this.stack.push(value);
                break;

            case OPCODES.POP:
                this.safePop();
                break;

            case OPCODES.DUP:
                const top = this.safeTop();
                this.stack.push(top);
                break;

            case OPCODES.SWAP:
                if (this.stack.length < 2) throw new Error('Stack underflow');
                const a = this.stack.pop();
                const b = this.stack.pop();
                this.stack.push(a);
                this.stack.push(b);
                break;

            // Arithmetic
            case OPCODES.ADD:
                this.binaryOp((a, b) => a + b);
                break;

            case OPCODES.SUB:
                this.binaryOp((a, b) => a - b);
                break;

            case OPCODES.MUL:
                this.binaryOp((a, b) => a * b);
                break;

            case OPCODES.DIV:
                this.binaryOp((a, b) => b === 0n ? 0n : a / b);
                break;

            case OPCODES.MOD:
                this.binaryOp((a, b) => b === 0n ? 0n : a % b);
                break;

            // Comparison
            case OPCODES.LT:
                this.binaryOp((a, b) => a < b ? 1n : 0n);
                break;

            case OPCODES.GT:
                this.binaryOp((a, b) => a > b ? 1n : 0n);
                break;

            case OPCODES.EQ:
                this.binaryOp((a, b) => a === b ? 1n : 0n);
                break;

            case OPCODES.ISZERO:
                const val = this.safePop();
                this.stack.push(val === 0n ? 1n : 0n);
                break;

            // Logic
            case OPCODES.AND:
                this.binaryOp((a, b) => a & b);
                break;

            case OPCODES.OR:
                this.binaryOp((a, b) => a | b);
                break;

            case OPCODES.NOT:
                const notVal = this.safePop();
                this.stack.push(~notVal);
                break;

            // Control Flow
            case OPCODES.JUMP:
                const jumpDest = Number(this.safePop());
                if (!this.jumpDests.has(jumpDest)) {
                    throw new Error('Invalid jump destination');
                }
                this.pc = jumpDest - 1;  // -1 because we increment after
                break;

            case OPCODES.JUMPI:
                const dest = Number(this.safePop());
                const condition = this.safePop();
                if (condition !== 0n) {
                    if (!this.jumpDests.has(dest)) {
                        throw new Error('Invalid jump destination');
                    }
                    this.pc = dest - 1;
                }
                break;

            case OPCODES.JUMPDEST:
                // Just a marker, no operation
                break;

            // Environment
            case OPCODES.CALLER:
                // Push caller address as number (simplified)
                const callerNum = BigInt('0x' + this.caller.slice(0, 16) || '0');
                this.stack.push(callerNum);
                break;

            case OPCODES.CALLVALUE:
                this.stack.push(BigInt(this.value));
                break;

            case OPCODES.CALLDATALOAD:
                const offset = Number(this.safePop());
                let dataValue = BigInt(0);
                for (let i = 0; i < 32; i++) {
                    dataValue = (dataValue << 8n) | BigInt(this.callData[offset + i] || 0);
                }
                this.stack.push(dataValue);
                break;

            case OPCODES.CALLDATASIZE:
                this.stack.push(BigInt(this.callData.length));
                break;

            // Storage
            case OPCODES.SLOAD:
                const loadKey = this.safePop().toString();
                const storedValue = this.storage.get(loadKey) || 0n;
                this.stack.push(BigInt(storedValue));
                break;

            case OPCODES.SSTORE:
                const storeKey = this.safePop().toString();
                const storeValue = this.safePop();
                this.storage.set(storeKey, storeValue);
                break;

            // Memory
            case OPCODES.MLOAD:
                const mloadAddr = Number(this.safePop());
                const mloadValue = this.memory.get(mloadAddr) || 0n;
                this.stack.push(BigInt(mloadValue));
                break;

            case OPCODES.MSTORE:
                const mstoreAddr = Number(this.safePop());
                const mstoreValue = this.safePop();
                this.memory.set(mstoreAddr, mstoreValue);
                break;

            // System
            case OPCODES.RETURN:
                const retOffset = Number(this.safePop());
                const retSize = Number(this.safePop());
                const retData = [];
                for (let i = 0; i < retSize; i++) {
                    retData.push(Number(this.memory.get(retOffset + i) || 0));
                }
                this.returnData = Buffer.from(retData);
                this.stopped = true;
                break;

            case OPCODES.REVERT:
                this.reverted = true;
                this.stopped = true;
                break;

            case OPCODES.LOG:
                const logData = this.safePop();
                this.logs.push({
                    data: logData.toString(),
                    pc: this.pc
                });
                break;

            default:
                throw new Error(`Unknown opcode: 0x${opcode.toString(16)}`);
        }
    }

    /**
     * Perform a binary operation (pop 2, push 1).
     */
    binaryOp(operation) {
        const b = this.safePop();
        const a = this.safePop();
        this.stack.push(operation(a, b));
    }

    /**
     * Safely pop from stack.
     */
    safePop() {
        if (this.stack.length === 0) {
            throw new Error('Stack underflow');
        }
        return this.stack.pop();
    }

    /**
     * Safely get top of stack without removing.
     */
    safeTop() {
        if (this.stack.length === 0) {
            throw new Error('Stack underflow');
        }
        return this.stack[this.stack.length - 1];
    }

    /**
     * Get execution result.
     */
    getResult(error = null) {
        return {
            success: !this.reverted && !error,
            gasUsed: this.gasUsed,
            returnData: this.returnData,
            storage: this.storage,
            logs: this.logs,
            stack: this.stack.map(v => v.toString()),
            error: error
        };
    }
}

/**
 * Compile a simple high-level language to bytecode.
 * 
 * Supports:
 *   PUSH <value>
 *   ADD, SUB, MUL, DIV
 *   STORE <key>
 *   LOAD <key>
 *   RETURN
 */
function compile(sourceCode) {
    const bytecode = [];
    const lines = sourceCode.trim().split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'));

    for (const line of lines) {
        const parts = line.split(/\s+/);
        const instruction = parts[0].toUpperCase();

        switch (instruction) {
            case 'PUSH':
                const value = parseInt(parts[1], 10);
                if (value < 256) {
                    bytecode.push(OPCODES.PUSH1);
                    bytecode.push(value);
                } else {
                    // Use PUSH32 for larger values
                    bytecode.push(OPCODES.PUSH32);
                    const bytes = [];
                    let v = BigInt(value);
                    for (let i = 0; i < 32; i++) {
                        bytes.unshift(Number(v & 0xFFn));
                        v >>= 8n;
                    }
                    bytecode.push(...bytes);
                }
                break;

            case 'ADD': bytecode.push(OPCODES.ADD); break;
            case 'SUB': bytecode.push(OPCODES.SUB); break;
            case 'MUL': bytecode.push(OPCODES.MUL); break;
            case 'DIV': bytecode.push(OPCODES.DIV); break;
            case 'MOD': bytecode.push(OPCODES.MOD); break;
            case 'LT': bytecode.push(OPCODES.LT); break;
            case 'GT': bytecode.push(OPCODES.GT); break;
            case 'EQ': bytecode.push(OPCODES.EQ); break;
            case 'ISZERO': bytecode.push(OPCODES.ISZERO); break;
            case 'AND': bytecode.push(OPCODES.AND); break;
            case 'OR': bytecode.push(OPCODES.OR); break;
            case 'NOT': bytecode.push(OPCODES.NOT); break;
            case 'POP': bytecode.push(OPCODES.POP); break;
            case 'DUP': bytecode.push(OPCODES.DUP); break;
            case 'SWAP': bytecode.push(OPCODES.SWAP); break;

            case 'STORE':
                const storeKey = parseInt(parts[1], 10);
                bytecode.push(OPCODES.PUSH1);
                bytecode.push(storeKey);
                bytecode.push(OPCODES.SSTORE);
                break;

            case 'LOAD':
                const loadKey = parseInt(parts[1], 10);
                bytecode.push(OPCODES.PUSH1);
                bytecode.push(loadKey);
                bytecode.push(OPCODES.SLOAD);
                break;

            case 'CALLER': bytecode.push(OPCODES.CALLER); break;
            case 'CALLVALUE': bytecode.push(OPCODES.CALLVALUE); break;
            case 'CALLDATASIZE': bytecode.push(OPCODES.CALLDATASIZE); break;

            case 'JUMP':
                const jumpTo = parseInt(parts[1], 10);
                bytecode.push(OPCODES.PUSH1);
                bytecode.push(jumpTo);
                bytecode.push(OPCODES.JUMP);
                break;

            case 'JUMPDEST': bytecode.push(OPCODES.JUMPDEST); break;
            case 'STOP': bytecode.push(OPCODES.STOP); break;
            case 'RETURN': bytecode.push(OPCODES.RETURN); break;
            case 'REVERT': bytecode.push(OPCODES.REVERT); break;
            case 'LOG': bytecode.push(OPCODES.LOG); break;

            default:
                throw new Error(`Unknown instruction: ${instruction}`);
        }
    }

    return Buffer.from(bytecode);
}

module.exports = { VM, OPCODES, GAS_COSTS, compile };
