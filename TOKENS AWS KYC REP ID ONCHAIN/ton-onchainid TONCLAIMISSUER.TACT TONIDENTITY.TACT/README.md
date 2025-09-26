# TON OnchainID - Decentralized Identity for TON Blockchain

![TON OnchainID](https://img.shields.io/badge/TON-OnchainID-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Version](https://img.shields.io/badge/version-1.0.0-orange)

## Overview

TON OnchainID is a complete implementation of the ERC734 (Key Holder) and ERC735 (Claim Holder) standards for the TON Blockchain, written in Tact. This system provides decentralized identity management with full compliance capabilities for TRC3643 permissioned tokens.

## Features

### 🔑 ERC734 Key Management
- **Multi-purpose keys**: Management, Action, Claim Signer, and Encryption keys
- **Key lifecycle management**: Add, remove, and update keys with proper authorization
- **Execution framework**: Secure execution of actions with multi-signature support
- **Event logging**: Complete audit trail of all key operations

### 📋 ERC735 Claim Management
- **Claim issuance**: Issue KYC, AML, accreditation, and jurisdiction claims
- **Claim validation**: Cryptographic verification of claim authenticity
- **Claim revocation**: Revoke compromised or invalid claims
- **Flexible schemas**: Support for multiple claim types and data formats

### 🏭 Identity Factory
- **Deterministic deployment**: Calculate identity addresses before deployment
- **Version management**: Upgrade identity implementations while maintaining compatibility
- **Registry system**: Track all deployed identities and their owners
- **Access control**: Authorized deployer system for enterprise use

### 🌉 TRC3643 Integration
- **Compliance gateway**: Seamless integration with TRC3643 permissioned tokens
- **Transfer validation**: Real-time compliance checking for token transfers
- **Rule engine**: Flexible compliance rules based on claims and jurisdictions
- **Automated enforcement**: Automatic rejection of non-compliant transfers

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   TonIdentity   │    │ TonClaimIssuer  │    │TonIdentityFactory│
│                 │    │                 │    │                 │
│ • Key Mgmt      │    │ • Issue Claims  │    │ • Deploy IDs    │
│ • Claim Storage │◄───┤ • Validate      │    │ • Registry      │
│ • Execution     │    │ • Revoke        │    │ • Versioning    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │TonIdentityGateway│
                    │                 │
                    │ • TRC3643 Link  │
                    │ • Compliance    │
                    │ • Validation    │
                    └─────────────────┘
```

## Smart Contracts

### 1. TonIdentity.tact
Core identity contract implementing ERC734/ERC735 standards:
- **Key Management**: Add/remove keys with different purposes
- **Claim Management**: Store and manage identity claims
- **Execution Framework**: Secure action execution with approvals
- **Event System**: Complete audit trail

### 2. TonClaimIssuer.tact
Trusted claim issuer for KYC/AML compliance:
- **Claim Issuance**: Issue verified claims to identities
- **Validation**: Cryptographic claim verification
- **Revocation**: Revoke invalid or compromised claims
- **Issuer Management**: Trusted signer system

### 3. TonIdentityFactory.tact
Factory for deploying and managing identities:
- **Deployment**: Deploy new identity contracts
- **Registry**: Track all deployed identities
- **Versioning**: Manage implementation upgrades
- **Access Control**: Authorized deployer system

### 4. TonIdentityGateway.tact
Integration layer for TRC3643 compliance:
- **Transfer Validation**: Check compliance before token transfers
- **Rule Engine**: Flexible compliance rules
- **Jurisdiction Support**: Geographic compliance checking
- **Real-time Verification**: Instant compliance validation

## Key Features

### 🔐 Security
- **Multi-signature support**: Require multiple keys for sensitive operations
- **Key rotation**: Update keys without losing identity
- **Claim verification**: Cryptographic proof of claim authenticity
- **Access control**: Role-based permissions for all operations

### 🌍 Compliance
- **KYC/AML support**: Standard compliance claim types
- **Jurisdiction checking**: Geographic compliance rules
- **Accreditation verification**: Investor accreditation claims
- **Sanctions screening**: Automated sanctions list checking

### ⚡ Performance
- **Gas optimized**: Efficient Tact implementation
- **Batch operations**: Process multiple claims/keys in single transaction
- **Lazy loading**: Load data only when needed
- **Caching**: Cache frequently accessed data

### 🔄 Interoperability
- **ERC734/735 compatible**: Full compatibility with Ethereum standards
- **TRC3643 integration**: Native support for permissioned tokens
- **Cross-chain ready**: Designed for future bridge implementations
- **Standard interfaces**: Common interfaces for wallet integration

## Usage Examples

### Deploy an Identity
```typescript
// Deploy new identity through factory
const factory = TonIdentityFactory.fromAddress(factoryAddress);
await factory.send(provider, via(wallet), {
    value: toNano("1"),
    body: {
        $$type: "DeployIdentity",
        managementKey: wallet.address,
        salt: 12345
    }
});
```

### Issue a KYC Claim
```typescript
// Issue KYC claim to identity
const issuer = TonClaimIssuer.fromAddress(issuerAddress);
await issuer.send(provider, via(wallet), {
    value: toNano("0.5"),
    body: {
        $$type: "IssueClaim",
        identity: identityAddress,
        topic: 1, // KYC_CLAIM
        scheme: 1, // ECDSA_SIGNATURE
        data: kycData,
        uri: "https://kyc-provider.com/claim/123",
        expiresAt: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60 // 1 year
    }
});
```

### Validate Transfer Compliance
```typescript
// Check if transfer is compliant
const gateway = TonIdentityGateway.fromAddress(gatewayAddress);
await gateway.send(provider, via(wallet), {
    value: toNano("0.1"),
    body: {
        $$type: "ValidateTransfer",
        from: senderAddress,
        to: receiverAddress,
        amount: transferAmount,
        token: tokenAddress
    }
});
```

## Integration with TRC3643

TON OnchainID seamlessly integrates with TRC3643 permissioned tokens:

1. **Identity Verification**: Users must have valid identity contracts
2. **Claim Requirements**: Tokens can require specific claims (KYC, AML, etc.)
3. **Transfer Validation**: All transfers are validated against compliance rules
4. **Automatic Enforcement**: Non-compliant transfers are automatically rejected

### TRC3643 Integration Flow
```
User Transfer Request
        ↓
TRC3643 Token Contract
        ↓
TonIdentityGateway.validateTransfer()
        ↓
Check Sender Identity & Claims
        ↓
Check Receiver Identity & Claims
        ↓
Apply Compliance Rules
        ↓
Return Validation Result
        ↓
Allow/Reject Transfer
```

## Claim Types

### Standard Claim Topics
- **1**: KYC (Know Your Customer)
- **2**: AML (Anti-Money Laundering)
- **3**: Accredited Investor
- **4**: Jurisdiction/Residency
- **5**: Sanctions Screening

### Custom Claim Topics
The system supports custom claim topics for specific use cases:
- **100+**: Custom business claims
- **1000+**: Industry-specific claims
- **10000+**: Organization-specific claims

## Deployment

### Prerequisites
- TON development environment
- Tact compiler
- Blueprint framework

### Deploy Contracts
```bash
# Deploy identity implementation
npx blueprint run deployIdentity

# Deploy claim issuer
npx blueprint run deployClaimIssuer

# Deploy identity factory
npx blueprint run deployFactory

# Deploy identity gateway
npx blueprint run deployGateway
```

### Configuration
```typescript
// Configure gateway with trusted issuers
await gateway.send(provider, via(wallet), {
    value: toNano("0.1"),
    body: "add_trusted_issuer"
});

// Set compliance rules
await gateway.send(provider, via(wallet), {
    value: toNano("0.1"),
    body: {
        $$type: "AddComplianceRule",
        name: "Basic KYC/AML",
        description: "Requires KYC and AML claims",
        requiredClaims: new Map([[1, true], [2, true]]),
        jurisdictions: new Map([["US", true], ["EU", true]]),
        minAmount: 0,
        maxAmount: 1000000
    }
});
```

## Security Considerations

### Key Management
- Use hardware wallets for management keys
- Implement key rotation policies
- Monitor key usage and access patterns
- Use multi-signature for high-value operations

### Claim Verification
- Verify claim issuer reputation
- Check claim expiration dates
- Validate cryptographic signatures
- Monitor for claim revocations

### Access Control
- Implement role-based access control
- Use principle of least privilege
- Regular security audits
- Monitor for suspicious activities

## Roadmap

### Phase 1: Core Implementation ✅
- [x] ERC734/735 implementation
- [x] Basic claim issuance
- [x] Identity factory
- [x] TRC3643 integration

### Phase 2: Advanced Features 🚧
- [ ] Cross-chain bridges
- [ ] Advanced compliance rules
- [ ] Batch operations
- [ ] Mobile SDK

### Phase 3: Enterprise Features 📋
- [ ] Enterprise dashboard
- [ ] Compliance reporting
- [ ] API gateway
- [ ] White-label solutions

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup
```bash
git clone https://github.com/your-org/ton-onchainid
cd ton-onchainid
npm install
npm run build
npm test
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- **Documentation**: [docs.ton-onchainid.com](https://docs.ton-onchainid.com)
- **Discord**: [Join our community](https://discord.gg/ton-onchainid)
- **Email**: support@ton-onchainid.com
- **Issues**: [GitHub Issues](https://github.com/your-org/ton-onchainid/issues)

## Acknowledgments

- TON Foundation for the blockchain infrastructure
- OnchainID team for the original ERC734/735 standards
- Tact language developers
- TRC3643 community

---

**Built with ❤️ for the TON ecosystem**

