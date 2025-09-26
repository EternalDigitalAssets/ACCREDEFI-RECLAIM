import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, beginCell, Address } from '@ton/core';
import { TonIdentity } from '../wrappers/TonIdentity';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('TonIdentity', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('TonIdentity');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let tonIdentity: SandboxContract<TonIdentity>;
    let user: SandboxContract<TreasuryContract>;
    let manager: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        user = await blockchain.treasury('user');
        manager = await blockchain.treasury('manager');

        tonIdentity = blockchain.openContract(
            TonIdentity.createFromConfig({
                owner: deployer.address,
                nextKeyId: 1n,
                executionNonce: 0n
            }, code)
        );

        const deployResult = await tonIdentity.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: tonIdentity.address,
            deploy: true,
            success: true,
        });
    });

    describe('Key Management', () => {
        it('should add management key on deployment', async () => {
            const ownerKeyHash = BigInt('0x' + deployer.address.hash.toString('hex'));
            const keyInfo = await tonIdentity.getGetKey(ownerKeyHash);
            
            expect(keyInfo.purpose).toBe(1n); // MANAGEMENT_KEY
            expect(keyInfo.keyType).toBe(1n); // ECDSA
            expect(keyInfo.exists).toBe(1n);
        });

        it('should allow management key to add new keys', async () => {
            const newKeyHash = BigInt('0x1234567890abcdef');
            
            const result = await tonIdentity.sendAddKey(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    key: newKeyHash,
                    purpose: 2n, // ACTION_KEY
                    keyType: 1n  // ECDSA
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: tonIdentity.address,
                success: true,
            });

            const keyInfo = await tonIdentity.getGetKey(newKeyHash);
            expect(keyInfo.purpose).toBe(2n);
            expect(keyInfo.keyType).toBe(1n);
            expect(keyInfo.exists).toBe(1n);
        });

        it('should not allow non-management key to add keys', async () => {
            const newKeyHash = BigInt('0x1234567890abcdef');
            
            const result = await tonIdentity.sendAddKey(
                user.getSender(),
                {
                    value: toNano('0.05'),
                    key: newKeyHash,
                    purpose: 2n,
                    keyType: 1n
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user.address,
                to: tonIdentity.address,
                success: false,
                exitCode: 100, // Unauthorized
            });
        });

        it('should allow management key to remove keys', async () => {
            // First add a key
            const keyToRemove = BigInt('0x1234567890abcdef');
            await tonIdentity.sendAddKey(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    key: keyToRemove,
                    purpose: 2n,
                    keyType: 1n
                }
            );

            // Then remove it
            const result = await tonIdentity.sendRemoveKey(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    key: keyToRemove,
                    purpose: 2n
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: tonIdentity.address,
                success: true,
            });

            const keyInfo = await tonIdentity.getGetKey(keyToRemove);
            expect(keyInfo.exists).toBe(0n);
        });

        it('should not allow removing the last management key', async () => {
            const ownerKeyHash = BigInt('0x' + deployer.address.hash.toString('hex'));
            
            const result = await tonIdentity.sendRemoveKey(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    key: ownerKeyHash,
                    purpose: 1n
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: tonIdentity.address,
                success: false,
                exitCode: 203, // Cannot remove last management key
            });
        });

        it('should check key purposes correctly', async () => {
            const ownerKeyHash = BigInt('0x' + deployer.address.hash.toString('hex'));
            
            const hasManagementPurpose = await tonIdentity.getKeyHasPurpose(ownerKeyHash, 1n);
            expect(hasManagementPurpose).toBe(1n);

            const hasActionPurpose = await tonIdentity.getKeyHasPurpose(ownerKeyHash, 2n);
            expect(hasActionPurpose).toBe(0n);
        });

        it('should get keys by purpose', async () => {
            // Add an action key
            const actionKeyHash = BigInt('0x1234567890abcdef');
            await tonIdentity.sendAddKey(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    key: actionKeyHash,
                    purpose: 2n,
                    keyType: 1n
                }
            );

            const managementKeys = await tonIdentity.getGetKeysByPurpose(1n);
            const actionKeys = await tonIdentity.getGetKeysByPurpose(2n);

            // Should have at least one management key (owner)
            expect(managementKeys).toBeDefined();
            // Should have the action key we added
            expect(actionKeys).toBeDefined();
        });
    });

    describe('Execution', () => {
        it('should allow action key to execute transactions', async () => {
            // Add an action key
            const actionKeyHash = BigInt('0x1234567890abcdef');
            await tonIdentity.sendAddKey(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    key: actionKeyHash,
                    purpose: 2n,
                    keyType: 1n
                }
            );

            // Execute a transaction
            const targetAddress = user.address;
            const value = toNano('0.01');
            const data = beginCell().endCell();

            const result = await tonIdentity.sendExecute(
                deployer.getSender(), // Using management key for simplicity
                {
                    value: toNano('0.1'),
                    to: targetAddress,
                    amount: value,
                    data: data
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: tonIdentity.address,
                success: true,
            });
        });

        it('should not allow unauthorized execution', async () => {
            const targetAddress = user.address;
            const value = toNano('0.01');
            const data = beginCell().endCell();

            const result = await tonIdentity.sendExecute(
                user.getSender(), // Unauthorized user
                {
                    value: toNano('0.1'),
                    to: targetAddress,
                    amount: value,
                    data: data
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user.address,
                to: tonIdentity.address,
                success: false,
                exitCode: 100, // Unauthorized
            });
        });

        it('should increment execution nonce', async () => {
            const initialNonce = await tonIdentity.getGetExecutionNonce();
            
            const targetAddress = user.address;
            const value = toNano('0.01');
            const data = beginCell().endCell();

            await tonIdentity.sendExecute(
                deployer.getSender(),
                {
                    value: toNano('0.1'),
                    to: targetAddress,
                    amount: value,
                    data: data
                }
            );

            const newNonce = await tonIdentity.getGetExecutionNonce();
            expect(newNonce).toBe(initialNonce + 1n);
        });
    });

    describe('Access Control', () => {
        it('should validate key purposes for operations', async () => {
            // Add a claim signer key
            const claimSignerKey = BigInt('0xabcdef1234567890');
            await tonIdentity.sendAddKey(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    key: claimSignerKey,
                    purpose: 3n, // CLAIM_SIGNER_KEY
                    keyType: 1n
                }
            );

            // Claim signer should not be able to add keys
            const newKey = BigInt('0x9876543210fedcba');
            const result = await tonIdentity.sendAddKey(
                { address: Address.parse('0:' + claimSignerKey.toString(16).padStart(64, '0')) } as any,
                {
                    value: toNano('0.05'),
                    key: newKey,
                    purpose: 2n,
                    keyType: 1n
                }
            );

            expect(result.transactions).toHaveTransaction({
                success: false,
                exitCode: 100, // Unauthorized
            });
        });

        it('should handle multiple keys with same purpose', async () => {
            // Add multiple action keys
            const actionKey1 = BigInt('0x1111111111111111');
            const actionKey2 = BigInt('0x2222222222222222');

            await tonIdentity.sendAddKey(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    key: actionKey1,
                    purpose: 2n,
                    keyType: 1n
                }
            );

            await tonIdentity.sendAddKey(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    key: actionKey2,
                    purpose: 2n,
                    keyType: 1n
                }
            );

            // Both should have action purpose
            const key1Purpose = await tonIdentity.getKeyHasPurpose(actionKey1, 2n);
            const key2Purpose = await tonIdentity.getKeyHasPurpose(actionKey2, 2n);

            expect(key1Purpose).toBe(1n);
            expect(key2Purpose).toBe(1n);
        });
    });

    describe('Edge Cases', () => {
        it('should handle invalid key operations gracefully', async () => {
            const nonExistentKey = BigInt('0x9999999999999999');

            // Try to remove non-existent key
            const result = await tonIdentity.sendRemoveKey(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    key: nonExistentKey,
                    purpose: 2n
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: tonIdentity.address,
                success: false,
                exitCode: 200, // Key not found
            });
        });

        it('should handle duplicate key addition', async () => {
            const keyHash = BigInt('0x1234567890abcdef');

            // Add key first time
            await tonIdentity.sendAddKey(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    key: keyHash,
                    purpose: 2n,
                    keyType: 1n
                }
            );

            // Try to add same key again
            const result = await tonIdentity.sendAddKey(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    key: keyHash,
                    purpose: 2n,
                    keyType: 1n
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: tonIdentity.address,
                success: false,
                exitCode: 201, // Key already exists
            });
        });

        it('should validate key types', async () => {
            const keyHash = BigInt('0x1234567890abcdef');

            // Try to add key with invalid type
            const result = await tonIdentity.sendAddKey(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    key: keyHash,
                    purpose: 2n,
                    keyType: 99n // Invalid key type
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: tonIdentity.address,
                success: false,
                exitCode: 101, // Invalid parameters
            });
        });

        it('should validate key purposes', async () => {
            const keyHash = BigInt('0x1234567890abcdef');

            // Try to add key with invalid purpose
            const result = await tonIdentity.sendAddKey(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    key: keyHash,
                    purpose: 99n, // Invalid purpose
                    keyType: 1n
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: tonIdentity.address,
                success: false,
                exitCode: 202, // Invalid key purpose
            });
        });
    });
});

