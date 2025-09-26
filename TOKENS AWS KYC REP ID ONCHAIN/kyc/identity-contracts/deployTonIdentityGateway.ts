import { toNano, Address } from '@ton/core';
import { TonIdentityGateway } from '../wrappers/TonIdentityGateway';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    // These would be the addresses of previously deployed contracts
    // For now, using placeholder addresses
    const claimIssuerAddress = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
    const identityFactoryAddress = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
    
    const tonIdentityGateway = provider.open(
        await TonIdentityGateway.fromInit(
            provider.sender().address!,
            claimIssuerAddress,
            identityFactoryAddress
        )
    );

    await tonIdentityGateway.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        }
    );

    await provider.waitForDeploy(tonIdentityGateway.address);

    console.log('TonIdentityGateway deployed at:', tonIdentityGateway.address);
    
    // Get gateway configuration
    const config = await tonIdentityGateway.getGatewayConfig();
    console.log('Gateway configuration:', {
        claimIssuer: config.claimIssuer,
        identityFactory: config.identityFactory,
        identityRegistry: config.identityRegistry,
        cacheExpiry: config.cacheExpiry
    });
    
    // Get required topics
    const requiredTopics = await tonIdentityGateway.getRequiredTopics();
    console.log('Required compliance topics configured');
}

