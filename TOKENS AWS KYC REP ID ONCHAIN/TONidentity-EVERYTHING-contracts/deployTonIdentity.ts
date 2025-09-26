import { toNano } from '@ton/core';
import { TonIdentity } from '../wrappers/TonIdentity';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const tonIdentity = provider.open(await TonIdentity.fromInit(provider.sender().address!));

    await tonIdentity.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        }
    );

    await provider.waitForDeploy(tonIdentity.address);

    console.log('TonIdentity deployed at:', tonIdentity.address);
    
    // Add initial management key for the owner
    await tonIdentity.send(
        provider.sender(),
        {
            value: toNano('0.01'),
        },
        {
            $$type: 'AddKey',
            key: BigInt('0x' + provider.sender().address!.hash.toString('hex')),
            purpose: 1n, // KEY_PURPOSE_MANAGEMENT
            keyType: 1n, // KEY_TYPE_ECDSA
        }
    );

    console.log('Initial management key added for owner');
}

