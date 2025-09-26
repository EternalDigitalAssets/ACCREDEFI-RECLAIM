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

export type TonIdentityFactoryConfig = {
    admin: Address;
    identityCode: Cell;
    deploymentCount: bigint;
};

export function tonIdentityFactoryConfigToCell(config: TonIdentityFactoryConfig): Cell {
    return beginCell()
        .storeAddress(config.admin)
        .storeRef(config.identityCode)
        .storeUint(config.deploymentCount, 64)
        .endCell();
}

export class TonIdentityFactory implements Contract {
    
    static createFromAddress(address: Address) {
        return new TonIdentityFactory(address);
    }
    
    static createFromConfig(config: TonIdentityFactoryConfig, code: Cell, workchain = 0) {
        const data = tonIdentityFactoryConfigToCell(config);
        const init = { code, data };
        return new TonIdentityFactory(contractAddress(workchain, init), init);
    }
    
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}
    
    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: 1,
            body: beginCell().storeUint(0, 32).storeStringTail("Deploy").endCell(),
        });
    }
    
    async sendDeployIdentity(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            owner: Address;
            salt: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: 1,
            body: beginCell()
                .storeUint(0x44444444, 32) // DeployIdentity opcode
                .storeAddress(opts.owner)
                .storeUint(opts.salt, 256)
                .endCell(),
        });
    }
    
    async sendUpdateImplementation(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            newImplementation: Cell;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: 1,
            body: beginCell()
                .storeUint(0x55555555, 32) // UpdateImplementation opcode
                .storeRef(opts.newImplementation)
                .endCell(),
        });
    }
    
    async getGetIdentityAddress(provider: ContractProvider, owner: Address, salt: bigint): Promise<Address> {
        const result = await provider.get('getIdentityAddress', [
            { type: 'slice', cell: beginCell().storeAddress(owner).endCell() },
            { type: 'int', value: salt }
        ]);
        return result.stack.readAddress();
    }
    
    async getIsValidIdentity(provider: ContractProvider, identity: Address): Promise<bigint> {
        const result = await provider.get('isValidIdentity', [
            { type: 'slice', cell: beginCell().storeAddress(identity).endCell() }
        ]);
        return result.stack.readBigNumber();
    }
    
    async getGetImplementation(provider: ContractProvider): Promise<Cell> {
        const result = await provider.get('getImplementation', []);
        return result.stack.readCell();
    }
}

