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

export type TonClaimIssuerConfig = {
    owner: Address;
    nextClaimId: bigint;
    authorizedIssuers: Map<string, boolean>;
};

export function tonClaimIssuerConfigToCell(config: TonClaimIssuerConfig): Cell {
    return beginCell()
        .storeAddress(config.owner)
        .storeUint(config.nextClaimId, 64)
        .endCell();
}

export class TonClaimIssuer implements Contract {
    
    static createFromAddress(address: Address) {
        return new TonClaimIssuer(address);
    }
    
    static createFromConfig(config: TonClaimIssuerConfig, code: Cell, workchain = 0) {
        const data = tonClaimIssuerConfigToCell(config);
        const init = { code, data };
        return new TonClaimIssuer(contractAddress(workchain, init), init);
    }
    
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}
    
    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: 1,
            body: beginCell().storeUint(0, 32).storeStringTail("Deploy").endCell(),
        });
    }
    
    async sendAddClaim(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            identity: Address;
            topic: bigint;
            scheme: bigint;
            data: Slice;
            signature: Slice;
            uri: string;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: 1,
            body: beginCell()
                .storeUint(0x11111111, 32) // AddClaim opcode
                .storeAddress(opts.identity)
                .storeUint(opts.topic, 32)
                .storeUint(opts.scheme, 8)
                .storeSlice(opts.data)
                .storeSlice(opts.signature)
                .storeStringTail(opts.uri)
                .endCell(),
        });
    }
    
    async sendRemoveClaim(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            claimId: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: 1,
            body: beginCell()
                .storeUint(0x22222222, 32) // RemoveClaim opcode
                .storeUint(opts.claimId, 64)
                .endCell(),
        });
    }
    
    async sendRevokeClaim(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            claimId: bigint;
            reason: string;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: 1,
            body: beginCell()
                .storeUint(0x33333333, 32) // RevokeClaim opcode
                .storeUint(opts.claimId, 64)
                .storeStringTail(opts.reason)
                .endCell(),
        });
    }
    
    async getGetClaim(provider: ContractProvider, claimId: bigint): Promise<{
        topic: bigint;
        scheme: bigint;
        issuer: Address;
        signature: Slice;
        data: Slice;
        uri: string;
        valid: bigint;
    }> {
        const result = await provider.get('getClaim', [
            { type: 'int', value: claimId }
        ]);
        return {
            topic: result.stack.readBigNumber(),
            scheme: result.stack.readBigNumber(),
            issuer: result.stack.readAddress(),
            signature: result.stack.readCell().asSlice(),
            data: result.stack.readCell().asSlice(),
            uri: result.stack.readString(),
            valid: result.stack.readBigNumber()
        };
    }
    
    async getGetClaimIdsByTopic(provider: ContractProvider, identity: Address, topic: bigint): Promise<Cell> {
        const result = await provider.get('getClaimIdsByTopic', [
            { type: 'slice', cell: beginCell().storeAddress(identity).endCell() },
            { type: 'int', value: topic }
        ]);
        return result.stack.readCell();
    }
    
    async getIsClaimValid(provider: ContractProvider, claimId: bigint): Promise<bigint> {
        const result = await provider.get('isClaimValid', [
            { type: 'int', value: claimId }
        ]);
        return result.stack.readBigNumber();
    }
    
    async getGetClaimsByIssuer(provider: ContractProvider, issuer: Address): Promise<Cell> {
        const result = await provider.get('getClaimsByIssuer', [
            { type: 'slice', cell: beginCell().storeAddress(issuer).endCell() }
        ]);
        return result.stack.readCell();
    }
}

