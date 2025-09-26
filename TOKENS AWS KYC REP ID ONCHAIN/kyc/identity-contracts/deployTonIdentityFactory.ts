import { toNano, Address } from '@ton/core';
import { TonIdentityFactory } from '../wrappers/TonIdentityFactory';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    // For now, we'll use a placeholder implementation address
    // In a real deployment, this would be the address of the deployed TonIdentity implementation
    const implementationAddress = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
    
    const tonIdentityFactory = provider.open(
        await TonIdentityFactory.fromInit(provider.sender().address!, implementationAddress)
    );

    await tonIdentityFactory.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        }
    );

    await provider.waitForDeploy(tonIdentityFactory.address);

    console.log('TonIdentityFactory deployed at:', tonIdentityFactory.address);
    console.log('Implementation address set to:', implementationAddress);
    
    // Get initial factory stats
    const stats = await tonIdentityFactory.getFactoryStats();
    console.log('Factory stats:', {
        totalIdentities: stats.totalIdentities,
        currentVersion: stats.currentVersion,
        implementation: stats.implementation
    });
}

