import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, beginCell, Address } from '@ton/core';
import { TonIdentityFactory } from '../wrappers/TonIdentityFactory';
import { TonIdentity } from '../wrappers/TonIdentity';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('TonIdentityFactory', () => {
    let factoryCode: Cell;
    let identityCode: Cell;

    beforeAll(async () => {
        factoryCode = await compile('TonIdentityFactory');
        identityCode = await compile('TonIdentity');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let factory: SandboxContract<TonIdentityFactory>;
    let user1: SandboxContract<TreasuryContract>;
    let user2: SandboxContract<TreasuryContract>;
    let admin: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        user1 = await blockchain.treasury('user1');
        user2 = await blockchain.treasury('user2');
        admin = await blockchain.treasury('admin');

        factory = blockchain.openContract(
            TonIdentityFactory.createFromConfig({
                admin: deployer.address,
                identityCode: identityCode,
                deploymentCount: 0n
            }, factoryCode)
        );

        const deployResult = await factory.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: factory.address,
            deploy: true,
            success: true,
        });
    });

    describe('Identity Deployment', () => {
        it('should deploy new identity contract', async () => {
            const salt = 12345n;
            
            const result = await factory.sendDeployIdentity(
                user1.getSender(),
                {
                    value: toNano('0.1'),
                    owner: user1.address,
                    salt: salt
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: factory.address,
                success: true,
            });

            // Check if identity was deployed
            const identityAddress = await factory.getGetIdentityAddress(user1.address, salt);
            expect(identityAddress).toBeDefined();

            // Verify the identity contract exists and is functional
            const identity = blockchain.openContract(
                TonIdentity.createFromAddress(identityAddress)
            );

            // The identity should have the owner's key as management key
            const ownerKeyHash = BigInt('0x' + user1.address.hash.toString('hex'));
            const keyInfo = await identity.getGetKey(ownerKeyHash);
            expect(keyInfo.purpose).toBe(1n); // MANAGEMENT_KEY
            expect(keyInfo.exists).toBe(1n);
        });

        it('should calculate identity address correctly', async () => {
            const salt = 54321n;
            
            // Get address before deployment
            const predictedAddress = await factory.getGetIdentityAddress(user1.address, salt);
            
            // Deploy identity
            await factory.sendDeployIdentity(
                user1.getSender(),
                {
                    value: toNano('0.1'),
                    owner: user1.address,
                    salt: salt
                }
            );

            // Get address after deployment
            const actualAddress = await factory.getGetIdentityAddress(user1.address, salt);
            
            expect(predictedAddress.toString()).toBe(actualAddress.toString());
        });

        it('should validate deployed identity', async () => {
            const salt = 98765n;
            
            await factory.sendDeployIdentity(
                user1.getSender(),
                {
                    value: toNano('0.1'),
                    owner: user1.address,
                    salt: salt
                }
            );

            const identityAddress = await factory.getGetIdentityAddress(user1.address, salt);
            const isValid = await factory.getIsValidIdentity(identityAddress);
            
            expect(isValid).toBe(1n);
        });

        it('should not validate non-deployed identity', async () => {
            const salt = 11111n;
            const identityAddress = await factory.getGetIdentityAddress(user1.address, salt);
            const isValid = await factory.getIsValidIdentity(identityAddress);
            
            expect(isValid).toBe(0n);
        });

        it('should deploy multiple identities for same owner with different salts', async () => {
            const salts = [1n, 2n, 3n];
            const deployedAddresses: Address[] = [];

            for (const salt of salts) {
                await factory.sendDeployIdentity(
                    user1.getSender(),
                    {
                        value: toNano('0.1'),
                        owner: user1.address,
                        salt: salt
                    }
                );

                const identityAddress = await factory.getGetIdentityAddress(user1.address, salt);
                deployedAddresses.push(identityAddress);
            }

            // All addresses should be different
            const uniqueAddresses = new Set(deployedAddresses.map(addr => addr.toString()));
            expect(uniqueAddresses.size).toBe(salts.length);

            // All should be valid
            for (const address of deployedAddresses) {
                const isValid = await factory.getIsValidIdentity(address);
                expect(isValid).toBe(1n);
            }
        });

        it('should deploy identities for different owners', async () => {
            const salt = 99999n;
            const owners = [user1, user2];
            const deployedAddresses: Address[] = [];

            for (const owner of owners) {
                await factory.sendDeployIdentity(
                    owner.getSender(),
                    {
                        value: toNano('0.1'),
                        owner: owner.address,
                        salt: salt
                    }
                );

                const identityAddress = await factory.getGetIdentityAddress(owner.address, salt);
                deployedAddresses.push(identityAddress);
            }

            // Addresses should be different for different owners
            expect(deployedAddresses[0].toString()).not.toBe(deployedAddresses[1].toString());

            // Both should be valid
            for (const address of deployedAddresses) {
                const isValid = await factory.getIsValidIdentity(address);
                expect(isValid).toBe(1n);
            }
        });

        it('should prevent duplicate deployments with same owner and salt', async () => {
            const salt = 77777n;
            
            // First deployment should succeed
            const firstResult = await factory.sendDeployIdentity(
                user1.getSender(),
                {
                    value: toNano('0.1'),
                    owner: user1.address,
                    salt: salt
                }
            );

            expect(firstResult.transactions).toHaveTransaction({
                from: user1.address,
                to: factory.address,
                success: true,
            });

            // Second deployment with same parameters should fail
            const secondResult = await factory.sendDeployIdentity(
                user1.getSender(),
                {
                    value: toNano('0.1'),
                    owner: user1.address,
                    salt: salt
                }
            );

            expect(secondResult.transactions).toHaveTransaction({
                from: user1.address,
                to: factory.address,
                success: false,
                // Contract already exists error
            });
        });
    });

    describe('Implementation Management', () => {
        it('should allow admin to update implementation', async () => {
            // Compile a new version (in practice, this would be different code)
            const newImplementation = identityCode; // Using same code for test
            
            const result = await factory.sendUpdateImplementation(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    newImplementation: newImplementation
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: factory.address,
                success: true,
            });

            const currentImplementation = await factory.getGetImplementation();
            expect(currentImplementation).toBeDefined();
        });

        it('should not allow non-admin to update implementation', async () => {
            const newImplementation = identityCode;
            
            const result = await factory.sendUpdateImplementation(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                    newImplementation: newImplementation
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: factory.address,
                success: false,
                exitCode: 100, // Unauthorized
            });
        });

        it('should get current implementation', async () => {
            const implementation = await factory.getGetImplementation();
            expect(implementation).toBeDefined();
            // Should be the identity code we set during deployment
        });
    });

    describe('Batch Operations', () => {
        it('should handle multiple deployments in sequence', async () => {
            const deploymentCount = 5;
            const deployedAddresses: Address[] = [];

            for (let i = 0; i < deploymentCount; i++) {
                const salt = BigInt(i + 1000);
                
                await factory.sendDeployIdentity(
                    user1.getSender(),
                    {
                        value: toNano('0.1'),
                        owner: user1.address,
                        salt: salt
                    }
                );

                const identityAddress = await factory.getGetIdentityAddress(user1.address, salt);
                deployedAddresses.push(identityAddress);
            }

            // All deployments should be successful and unique
            const uniqueAddresses = new Set(deployedAddresses.map(addr => addr.toString()));
            expect(uniqueAddresses.size).toBe(deploymentCount);

            // All should be valid identities
            for (const address of deployedAddresses) {
                const isValid = await factory.getIsValidIdentity(address);
                expect(isValid).toBe(1n);
            }
        });

        it('should handle concurrent deployments for different users', async () => {
            const users = [user1, user2];
            const salt = 2000n;
            const results: any[] = [];

            // Deploy for both users with same salt (should work since different owners)
            for (const user of users) {
                const result = await factory.sendDeployIdentity(
                    user.getSender(),
                    {
                        value: toNano('0.1'),
                        owner: user.address,
                        salt: salt
                    }
                );
                results.push(result);
            }

            // Both deployments should succeed
            for (const result of results) {
                expect(result.transactions).toHaveTransaction({
                    success: true,
                });
            }

            // Verify both identities exist and are different
            const address1 = await factory.getGetIdentityAddress(user1.address, salt);
            const address2 = await factory.getGetIdentityAddress(user2.address, salt);
            
            expect(address1.toString()).not.toBe(address2.toString());
            
            const isValid1 = await factory.getIsValidIdentity(address1);
            const isValid2 = await factory.getIsValidIdentity(address2);
            
            expect(isValid1).toBe(1n);
            expect(isValid2).toBe(1n);
        });
    });

    describe('Gas Optimization', () => {
        it('should deploy identity with reasonable gas consumption', async () => {
            const salt = 3000n;
            
            const result = await factory.sendDeployIdentity(
                user1.getSender(),
                {
                    value: toNano('0.1'),
                    owner: user1.address,
                    salt: salt
                }
            );

            // Check that deployment didn't consume excessive gas
            const deployTx = result.transactions.find(tx => 
                tx.inMessage?.info.type === 'internal' && 
                tx.inMessage.info.dest?.equals(factory.address)
            );
            
            expect(deployTx).toBeDefined();
            expect(deployTx!.totalFees.coins).toBeLessThan(toNano('0.05'));
        });

        it('should calculate addresses efficiently', async () => {
            const salt = 4000n;
            
            // Multiple address calculations should be consistent and fast
            const addresses = [];
            for (let i = 0; i < 10; i++) {
                const address = await factory.getGetIdentityAddress(user1.address, salt);
                addresses.push(address.toString());
            }

            // All calculations should return the same result
            const uniqueAddresses = new Set(addresses);
            expect(uniqueAddresses.size).toBe(1);
        });
    });

    describe('Edge Cases', () => {
        it('should handle zero salt', async () => {
            const salt = 0n;
            
            const result = await factory.sendDeployIdentity(
                user1.getSender(),
                {
                    value: toNano('0.1'),
                    owner: user1.address,
                    salt: salt
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: factory.address,
                success: true,
            });

            const identityAddress = await factory.getGetIdentityAddress(user1.address, salt);
            const isValid = await factory.getIsValidIdentity(identityAddress);
            expect(isValid).toBe(1n);
        });

        it('should handle maximum salt value', async () => {
            const salt = 2n ** 256n - 1n; // Maximum uint256
            
            const result = await factory.sendDeployIdentity(
                user1.getSender(),
                {
                    value: toNano('0.1'),
                    owner: user1.address,
                    salt: salt
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: factory.address,
                success: true,
            });
        });

        it('should handle invalid identity address validation', async () => {
            // Create a random address that wasn't deployed by this factory
            const randomAddress = Address.parse('0:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');
            
            const isValid = await factory.getIsValidIdentity(randomAddress);
            expect(isValid).toBe(0n);
        });

        it('should handle insufficient deployment funds', async () => {
            const salt = 5000n;
            
            const result = await factory.sendDeployIdentity(
                user1.getSender(),
                {
                    value: toNano('0.001'), // Very small amount
                    owner: user1.address,
                    salt: salt
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: factory.address,
                success: false,
                exitCode: 102, // Insufficient balance
            });
        });
    });

    describe('State Management', () => {
        it('should track deployment count', async () => {
            const initialCount = 0n; // Starting count
            
            // Deploy a few identities
            const deployments = 3;
            for (let i = 0; i < deployments; i++) {
                await factory.sendDeployIdentity(
                    user1.getSender(),
                    {
                        value: toNano('0.1'),
                        owner: user1.address,
                        salt: BigInt(6000 + i)
                    }
                );
            }

            // Note: In a real implementation, you'd have a getter for deployment count
            // For this test, we're just verifying the deployments succeeded
            for (let i = 0; i < deployments; i++) {
                const identityAddress = await factory.getGetIdentityAddress(user1.address, BigInt(6000 + i));
                const isValid = await factory.getIsValidIdentity(identityAddress);
                expect(isValid).toBe(1n);
            }
        });

        it('should maintain consistent state across operations', async () => {
            const salt = 7000n;
            
            // Deploy identity
            await factory.sendDeployIdentity(
                user1.getSender(),
                {
                    value: toNano('0.1'),
                    owner: user1.address,
                    salt: salt
                }
            );

            // Multiple queries should return consistent results
            const address1 = await factory.getGetIdentityAddress(user1.address, salt);
            const address2 = await factory.getGetIdentityAddress(user1.address, salt);
            const isValid1 = await factory.getIsValidIdentity(address1);
            const isValid2 = await factory.getIsValidIdentity(address2);

            expect(address1.toString()).toBe(address2.toString());
            expect(isValid1).toBe(isValid2);
            expect(isValid1).toBe(1n);
        });
    });
});

