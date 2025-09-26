import { toNano } from '@ton/core';
import { TonClaimIssuer } from '../wrappers/TonClaimIssuer';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const tonClaimIssuer = provider.open(await TonClaimIssuer.fromInit(provider.sender().address!));

    await tonClaimIssuer.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        }
    );

    await provider.waitForDeploy(tonClaimIssuer.address);

    console.log('TonClaimIssuer deployed at:', tonClaimIssuer.address);
    
    // The deployer is automatically added as a trusted issuer in the constructor
    console.log('Deployer automatically set as trusted issuer');
}

