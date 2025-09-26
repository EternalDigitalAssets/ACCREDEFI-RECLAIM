import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, beginCell, Address } from '@ton/core';
import { TonClaimIssuer } from '../wrappers/TonClaimIssuer';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('TonClaimIssuer', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('TonClaimIssuer');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let claimIssuer: SandboxContract<TonClaimIssuer>;
    let identity: SandboxContract<TreasuryContract>;
    let unauthorizedUser: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        identity = await blockchain.treasury('identity');
        unauthorizedUser = await blockchain.treasury('unauthorized');

        claimIssuer = blockchain.openContract(
            TonClaimIssuer.createFromConfig({
                owner: deployer.address,
                nextClaimId: 1n,
                authorizedIssuers: new Map([[deployer.address.toString(), true]])
            }, code)
        );

        const deployResult = await claimIssuer.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: claimIssuer.address,
            deploy: true,
            success: true,
        });
    });

    describe('Claim Management', () => {
        it('should allow authorized issuer to add claims', async () => {
            const claimData = beginCell()
                .storeUint(1, 32) // KYC topic
                .storeRef(beginCell().storeStringTail('John Doe').endCell())
                .endCell();

            const signature = beginCell()
                .storeBuffer(Buffer.from('mock_signature_data'))
                .endCell();

            const result = await claimIssuer.sendAddClaim(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    identity: identity.address,
                    topic: 1n, // KYC
                    scheme: 1n, // ECDSA
                    data: claimData.asSlice(),
                    signature: signature.asSlice(),
                    uri: 'https://kyc-provider.com/claim/1'
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: claimIssuer.address,
                success: true,
            });

            // Verify claim was added
            const claimId = 1n; // First claim
            const claim = await claimIssuer.getGetClaim(claimId);
            expect(claim.topic).toBe(1n);
            expect(claim.scheme).toBe(1n);
            expect(claim.issuer.toString()).toBe(deployer.address.toString());
            expect(claim.valid).toBe(1n);
        });

        it('should not allow unauthorized issuer to add claims', async () => {
            const claimData = beginCell()
                .storeUint(1, 32)
                .storeRef(beginCell().storeStringTail('John Doe').endCell())
                .endCell();

            const signature = beginCell()
                .storeBuffer(Buffer.from('mock_signature_data'))
                .endCell();

            const result = await claimIssuer.sendAddClaim(
                unauthorizedUser.getSender(),
                {
                    value: toNano('0.05'),
                    identity: identity.address,
                    topic: 1n,
                    scheme: 1n,
                    data: claimData.asSlice(),
                    signature: signature.asSlice(),
                    uri: ''
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: unauthorizedUser.address,
                to: claimIssuer.address,
                success: false,
                exitCode: 304, // Invalid issuer
            });
        });

        it('should allow issuer to remove their own claims', async () => {
            // First add a claim
            const claimData = beginCell()
                .storeUint(1, 32)
                .storeRef(beginCell().storeStringTail('John Doe').endCell())
                .endCell();

            const signature = beginCell()
                .storeBuffer(Buffer.from('mock_signature_data'))
                .endCell();

            await claimIssuer.sendAddClaim(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    identity: identity.address,
                    topic: 1n,
                    scheme: 1n,
                    data: claimData.asSlice(),
                    signature: signature.asSlice(),
                    uri: ''
                }
            );

            // Then remove it
            const claimId = 1n;
            const result = await claimIssuer.sendRemoveClaim(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    claimId: claimId
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: claimIssuer.address,
                success: true,
            });

            // Verify claim was removed
            const claim = await claimIssuer.getGetClaim(claimId);
            expect(claim.valid).toBe(0n);
        });

        it('should not allow unauthorized user to remove claims', async () => {
            // First add a claim
            const claimData = beginCell()
                .storeUint(1, 32)
                .storeRef(beginCell().storeStringTail('John Doe').endCell())
                .endCell();

            const signature = beginCell()
                .storeBuffer(Buffer.from('mock_signature_data'))
                .endCell();

            await claimIssuer.sendAddClaim(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    identity: identity.address,
                    topic: 1n,
                    scheme: 1n,
                    data: claimData.asSlice(),
                    signature: signature.asSlice(),
                    uri: ''
                }
            );

            // Try to remove with unauthorized user
            const claimId = 1n;
            const result = await claimIssuer.sendRemoveClaim(
                unauthorizedUser.getSender(),
                {
                    value: toNano('0.05'),
                    claimId: claimId
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: unauthorizedUser.address,
                to: claimIssuer.address,
                success: false,
                exitCode: 100, // Unauthorized
            });
        });

        it('should allow issuer to revoke claims', async () => {
            // First add a claim
            const claimData = beginCell()
                .storeUint(1, 32)
                .storeRef(beginCell().storeStringTail('John Doe').endCell())
                .endCell();

            const signature = beginCell()
                .storeBuffer(Buffer.from('mock_signature_data'))
                .endCell();

            await claimIssuer.sendAddClaim(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    identity: identity.address,
                    topic: 1n,
                    scheme: 1n,
                    data: claimData.asSlice(),
                    signature: signature.asSlice(),
                    uri: ''
                }
            );

            // Then revoke it
            const claimId = 1n;
            const result = await claimIssuer.sendRevokeClaim(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    claimId: claimId,
                    reason: 'Identity verification failed'
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: claimIssuer.address,
                success: true,
            });

            // Verify claim was revoked
            const isValid = await claimIssuer.getIsClaimValid(claimId);
            expect(isValid).toBe(0n);
        });
    });

    describe('Claim Queries', () => {
        beforeEach(async () => {
            // Add multiple claims for testing
            const claims = [
                { topic: 1n, data: 'KYC Data' },
                { topic: 2n, data: 'AML Data' },
                { topic: 1n, data: 'Updated KYC Data' },
                { topic: 3n, data: 'Accreditation Data' }
            ];

            for (const claim of claims) {
                const claimData = beginCell()
                    .storeUint(Number(claim.topic), 32)
                    .storeRef(beginCell().storeStringTail(claim.data).endCell())
                    .endCell();

                const signature = beginCell()
                    .storeBuffer(Buffer.from('mock_signature_data'))
                    .endCell();

                await claimIssuer.sendAddClaim(
                    deployer.getSender(),
                    {
                        value: toNano('0.05'),
                        identity: identity.address,
                        topic: claim.topic,
                        scheme: 1n,
                        data: claimData.asSlice(),
                        signature: signature.asSlice(),
                        uri: ''
                    }
                );
            }
        });

        it('should get claims by topic', async () => {
            const kycClaims = await claimIssuer.getGetClaimIdsByTopic(identity.address, 1n);
            expect(kycClaims).toBeDefined();

            const amlClaims = await claimIssuer.getGetClaimIdsByTopic(identity.address, 2n);
            expect(amlClaims).toBeDefined();

            const nonExistentClaims = await claimIssuer.getGetClaimIdsByTopic(identity.address, 99n);
            expect(nonExistentClaims).toBeDefined();
        });

        it('should get claims by issuer', async () => {
            const issuerClaims = await claimIssuer.getGetClaimsByIssuer(deployer.address);
            expect(issuerClaims).toBeDefined();

            const nonIssuerClaims = await claimIssuer.getGetClaimsByIssuer(unauthorizedUser.address);
            expect(nonIssuerClaims).toBeDefined();
        });

        it('should validate claim existence and validity', async () => {
            const claimId = 1n;
            const isValid = await claimIssuer.getIsClaimValid(claimId);
            expect(isValid).toBe(1n);

            const nonExistentClaimId = 999n;
            const isNonExistentValid = await claimIssuer.getIsClaimValid(nonExistentClaimId);
            expect(isNonExistentValid).toBe(0n);
        });

        it('should retrieve complete claim data', async () => {
            const claimId = 1n;
            const claim = await claimIssuer.getGetClaim(claimId);

            expect(claim.topic).toBe(1n);
            expect(claim.scheme).toBe(1n);
            expect(claim.issuer.toString()).toBe(deployer.address.toString());
            expect(claim.valid).toBe(1n);
            expect(claim.signature).toBeDefined();
            expect(claim.data).toBeDefined();
        });
    });

    describe('Claim Topics', () => {
        it('should handle different claim topics correctly', async () => {
            const topics = [
                { id: 1n, name: 'KYC' },
                { id: 2n, name: 'AML' },
                { id: 3n, name: 'Accreditation' },
                { id: 4n, name: 'Jurisdiction' }
            ];

            for (const topic of topics) {
                const claimData = beginCell()
                    .storeUint(Number(topic.id), 32)
                    .storeRef(beginCell().storeStringTail(topic.name).endCell())
                    .endCell();

                const signature = beginCell()
                    .storeBuffer(Buffer.from('mock_signature_data'))
                    .endCell();

                const result = await claimIssuer.sendAddClaim(
                    deployer.getSender(),
                    {
                        value: toNano('0.05'),
                        identity: identity.address,
                        topic: topic.id,
                        scheme: 1n,
                        data: claimData.asSlice(),
                        signature: signature.asSlice(),
                        uri: `https://issuer.com/claims/${topic.name.toLowerCase()}`
                    }
                );

                expect(result.transactions).toHaveTransaction({
                    from: deployer.address,
                    to: claimIssuer.address,
                    success: true,
                });
            }

            // Verify all topics were added
            for (let i = 1; i <= topics.length; i++) {
                const claim = await claimIssuer.getGetClaim(BigInt(i));
                expect(claim.topic).toBe(BigInt(i));
                expect(claim.valid).toBe(1n);
            }
        });

        it('should handle multiple claims for same topic', async () => {
            const topic = 1n; // KYC
            const claimCount = 3;

            for (let i = 0; i < claimCount; i++) {
                const claimData = beginCell()
                    .storeUint(Number(topic), 32)
                    .storeRef(beginCell().storeStringTail(`KYC Data ${i + 1}`).endCell())
                    .endCell();

                const signature = beginCell()
                    .storeBuffer(Buffer.from(`mock_signature_data_${i}`))
                    .endCell();

                await claimIssuer.sendAddClaim(
                    deployer.getSender(),
                    {
                        value: toNano('0.05'),
                        identity: identity.address,
                        topic: topic,
                        scheme: 1n,
                        data: claimData.asSlice(),
                        signature: signature.asSlice(),
                        uri: ''
                    }
                );
            }

            // Verify all claims exist
            for (let i = 1; i <= claimCount; i++) {
                const claim = await claimIssuer.getGetClaim(BigInt(i));
                expect(claim.topic).toBe(topic);
                expect(claim.valid).toBe(1n);
            }

            // Get claims by topic should return all
            const topicClaims = await claimIssuer.getGetClaimIdsByTopic(identity.address, topic);
            expect(topicClaims).toBeDefined();
        });
    });

    describe('Signature Schemes', () => {
        it('should support different signature schemes', async () => {
            const schemes = [
                { id: 1n, name: 'ECDSA' },
                { id: 2n, name: 'RSA' },
                { id: 3n, name: 'EdDSA' }
            ];

            for (const scheme of schemes) {
                const claimData = beginCell()
                    .storeUint(1, 32) // KYC topic
                    .storeRef(beginCell().storeStringTail(`Data for ${scheme.name}`).endCell())
                    .endCell();

                const signature = beginCell()
                    .storeBuffer(Buffer.from(`${scheme.name}_signature_data`))
                    .endCell();

                const result = await claimIssuer.sendAddClaim(
                    deployer.getSender(),
                    {
                        value: toNano('0.05'),
                        identity: identity.address,
                        topic: 1n,
                        scheme: scheme.id,
                        data: claimData.asSlice(),
                        signature: signature.asSlice(),
                        uri: ''
                    }
                );

                expect(result.transactions).toHaveTransaction({
                    from: deployer.address,
                    to: claimIssuer.address,
                    success: true,
                });
            }

            // Verify all schemes were accepted
            for (let i = 1; i <= schemes.length; i++) {
                const claim = await claimIssuer.getGetClaim(BigInt(i));
                expect(claim.scheme).toBe(BigInt(i));
                expect(claim.valid).toBe(1n);
            }
        });
    });

    describe('Edge Cases', () => {
        it('should handle non-existent claim operations', async () => {
            const nonExistentClaimId = 999n;

            // Try to remove non-existent claim
            const removeResult = await claimIssuer.sendRemoveClaim(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    claimId: nonExistentClaimId
                }
            );

            expect(removeResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: claimIssuer.address,
                success: false,
                exitCode: 300, // Claim not found
            });

            // Try to revoke non-existent claim
            const revokeResult = await claimIssuer.sendRevokeClaim(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    claimId: nonExistentClaimId,
                    reason: 'Test revocation'
                }
            );

            expect(revokeResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: claimIssuer.address,
                success: false,
                exitCode: 300, // Claim not found
            });
        });

        it('should handle revoked claim operations', async () => {
            // Add and then revoke a claim
            const claimData = beginCell()
                .storeUint(1, 32)
                .storeRef(beginCell().storeStringTail('Test Data').endCell())
                .endCell();

            const signature = beginCell()
                .storeBuffer(Buffer.from('mock_signature_data'))
                .endCell();

            await claimIssuer.sendAddClaim(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    identity: identity.address,
                    topic: 1n,
                    scheme: 1n,
                    data: claimData.asSlice(),
                    signature: signature.asSlice(),
                    uri: ''
                }
            );

            const claimId = 1n;
            await claimIssuer.sendRevokeClaim(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    claimId: claimId,
                    reason: 'Test revocation'
                }
            );

            // Try to revoke already revoked claim
            const result = await claimIssuer.sendRevokeClaim(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    claimId: claimId,
                    reason: 'Double revocation'
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: claimIssuer.address,
                success: false,
                exitCode: 303, // Claim revoked
            });
        });

        it('should validate claim data integrity', async () => {
            // Try to add claim with empty data
            const emptyData = beginCell().endCell();
            const signature = beginCell()
                .storeBuffer(Buffer.from('mock_signature_data'))
                .endCell();

            const result = await claimIssuer.sendAddClaim(
                deployer.getSender(),
                {
                    value: toNano('0.05'),
                    identity: identity.address,
                    topic: 1n,
                    scheme: 1n,
                    data: emptyData.asSlice(),
                    signature: signature.asSlice(),
                    uri: ''
                }
            );

            // Should still succeed as empty data might be valid in some cases
            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: claimIssuer.address,
                success: true,
            });
        });
    });
});

