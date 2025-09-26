import { 
    Cell,
    Slice, 
    Address, 
    Builder, 
    beginCell, 
    ComputeError, 
    TupleItem, 
    TupleReader, 
    Dictionary, 
    contractAddress, 
    ContractProvider, 
    Sender, 
    Contract, 
    ContractABI, 
    ABIType,
    ABIGetter,
    ABIReceiver,
    TupleBuilder,
    DictionaryValue
} from '@ton/core';

export type TonIdentityConfig = {
    owner: Address;
    nextKeyId: bigint;
    executionNonce: bigint;
};

export function tonIdentityConfigToCell(config: TonIdentityConfig): Cell {
    return beginCell()
        .storeAddress(config.owner)
        .storeUint(config.nextKeyId, 64)
        .storeUint(config.executionNonce, 64)
        .endCell();
}

const TonIdentityABI: ContractABI = {
    types: [
        {
            "name": "StateInit",
            "header": null,
            "fields": [
                {
                    "name": "code",
                    "type": {
                        "kind": "simple",
                        "type": "cell",
                        "optional": false
                    }
                },
                {
                    "name": "data",
                    "type": {
                        "kind": "simple",
                        "type": "cell",
                        "optional": false
                    }
                }
            ]
        }
    ],
    receivers: [
        {"receiver": "internal", "message": {"kind": "typed", "type": "AddKey"}},
        {"receiver": "internal", "message": {"kind": "typed", "type": "RemoveKey"}},
        {"receiver": "internal", "message": {"kind": "typed", "type": "Execute"}},
        {"receiver": "internal", "message": {"kind": "text", "text": "Deploy"}}
    ],
    getters: [
        {"name": "getKey", "arguments": [{"name": "key", "type": {"kind": "simple", "type": "int", "optional": false, "format": 257}}], "returnType": {"kind": "simple", "type": "int", "optional": false, "format": 257}},
        {"name": "keyHasPurpose", "arguments": [{"name": "key", "type": {"kind": "simple", "type": "int", "optional": false, "format": 257}}, {"name": "purpose", "type": {"kind": "simple", "type": "int", "optional": false, "format": 257}}], "returnType": {"kind": "simple", "type": "int", "optional": false, "format": 257}},
        {"name": "getKeysByPurpose", "arguments": [{"name": "purpose", "type": {"kind": "simple", "type": "int", "optional": false, "format": 257}}], "returnType": {"kind": "simple", "type": "cell", "optional": false}},
        {"name": "getExecutionNonce", "arguments": [], "returnType": {"kind": "simple", "type": "int", "optional": false, "format": 257}}
    ],
    errors: {
        2: { message: "Stack underflow" },
        3: { message: "Stack overflow" },
        4: { message: "Integer overflow" },
        5: { message: "Integer out of expected range" },
        6: { message: "Invalid opcode" },
        7: { message: "Type check error" },
        8: { message: "Cell overflow" },
        9: { message: "Cell underflow" },
        10: { message: "Dictionary error" },
        13: { message: "Out of gas error" },
        32: { message: "Method ID not found" },
        34: { message: "Action error" },
        37: { message: "Not enough TON" },
        38: { message: "Not enough extra-currencies" },
        128: { message: "Null reference exception" },
        129: { message: "Invalid serialization prefix" },
        130: { message: "Invalid incoming message" },
        131: { message: "Constraints error" },
        132: { message: "Access denied" },
        133: { message: "Contract stopped" },
        134: { message: "Invalid argument" },
        135: { message: "Code of a contract was not found" },
        136: { message: "Invalid address" },
        137: { message: "Masterchain support is not enabled for this contract" },
        100: { message: "Unauthorized access" },
        101: { message: "Invalid parameters" },
        102: { message: "Insufficient balance" },
        200: { message: "Key not found" },
        201: { message: "Key already exists" },
        202: { message: "Invalid key purpose" },
        203: { message: "Cannot remove last management key" },
        204: { message: "Invalid execution nonce" }
    }
}

const TonIdentity_getters: ABIGetter[] = [
    {"name": "getKey", "arguments": [{"name": "key", "type": {"kind": "simple", "type": "int", "optional": false, "format": 257}}], "returnType": {"kind": "simple", "type": "int", "optional": false, "format": 257}},
    {"name": "keyHasPurpose", "arguments": [{"name": "key", "type": {"kind": "simple", "type": "int", "optional": false, "format": 257}}, {"name": "purpose", "type": {"kind": "simple", "type": "int", "optional": false, "format": 257}}], "returnType": {"kind": "simple", "type": "int", "optional": false, "format": 257}},
    {"name": "getKeysByPurpose", "arguments": [{"name": "purpose", "type": {"kind": "simple", "type": "int", "optional": false, "format": 257}}], "returnType": {"kind": "simple", "type": "cell", "optional": false}},
    {"name": "getExecutionNonce", "arguments": [], "returnType": {"kind": "simple", "type": "int", "optional": false, "format": 257}}
];

const TonIdentity_receivers: ABIReceiver[] = [
    {"receiver": "internal", "message": {"kind": "typed", "type": "AddKey"}},
    {"receiver": "internal", "message": {"kind": "typed", "type": "RemoveKey"}},
    {"receiver": "internal", "message": {"kind": "typed", "type": "Execute"}},
    {"receiver": "internal", "message": {"kind": "text", "text": "Deploy"}}
];

export class TonIdentity implements Contract {
    
    static createFromAddress(address: Address) {
        return new TonIdentity(address);
    }
    
    static createFromConfig(config: TonIdentityConfig, code: Cell, workchain = 0) {
        const data = tonIdentityConfigToCell(config);
        const init = { code, data };
        return new TonIdentity(contractAddress(workchain, init), init);
    }
    
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}
    
    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: 1,
            body: beginCell().storeUint(0, 32).storeStringTail("Deploy").endCell(),
        });
    }
    
    async sendAddKey(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            key: bigint;
            purpose: bigint;
            keyType: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: 1,
            body: beginCell()
                .storeUint(0x12345678, 32) // AddKey opcode
                .storeUint(opts.key, 256)
                .storeUint(opts.purpose, 8)
                .storeUint(opts.keyType, 8)
                .endCell(),
        });
    }
    
    async sendRemoveKey(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            key: bigint;
            purpose: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: 1,
            body: beginCell()
                .storeUint(0x87654321, 32) // RemoveKey opcode
                .storeUint(opts.key, 256)
                .storeUint(opts.purpose, 8)
                .endCell(),
        });
    }
    
    async sendExecute(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            to: Address;
            amount: bigint;
            data: Cell;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: 1,
            body: beginCell()
                .storeUint(0xabcdef12, 32) // Execute opcode
                .storeAddress(opts.to)
                .storeCoins(opts.amount)
                .storeRef(opts.data)
                .endCell(),
        });
    }
    
    async getGetKey(provider: ContractProvider, key: bigint): Promise<{
        purpose: bigint;
        keyType: bigint;
        exists: bigint;
    }> {
        const result = await provider.get('getKey', [
            { type: 'int', value: key }
        ]);
        return {
            purpose: result.stack.readBigNumber(),
            keyType: result.stack.readBigNumber(),
            exists: result.stack.readBigNumber()
        };
    }
    
    async getKeyHasPurpose(provider: ContractProvider, key: bigint, purpose: bigint): Promise<bigint> {
        const result = await provider.get('keyHasPurpose', [
            { type: 'int', value: key },
            { type: 'int', value: purpose }
        ]);
        return result.stack.readBigNumber();
    }
    
    async getGetKeysByPurpose(provider: ContractProvider, purpose: bigint): Promise<Cell> {
        const result = await provider.get('getKeysByPurpose', [
            { type: 'int', value: purpose }
        ]);
        return result.stack.readCell();
    }
    
    async getGetExecutionNonce(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('getExecutionNonce', []);
        return result.stack.readBigNumber();
    }
}

