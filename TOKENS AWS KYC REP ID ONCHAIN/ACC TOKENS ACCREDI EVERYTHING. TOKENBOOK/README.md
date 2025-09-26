AccrediCoin and AccrediWrap Systems:

## 🏗️ Architecture

### Core Components

1. **UniversalWrapper.tact** - Main wrapper contract supporting both paths:
   - **Path A**: Wrap existing tokens (USDT, LP tokens, etc.) and add compliance
   - **Path B**: Mint brand-new tokens from scratch with built-in compliance

2. **ComplianceGate.tact** - Single compliance checking module with:
   - 256-bit KYC verification system
   - Modular plug-ins (FATF Travel-Rule, MiCA compliance, Reg D lock-ups)
   - Fast verification using hash-based identity checks

3. **TokenFactory.tact** - One-click deployment automation:
   - CoinFactory-style UX for rapid deployment
   - Handles both wrapping and minting scenarios
   - Automated compliance setup and Token Book registration

4. **TokenBook.tact** - Public token registry:
   - On-chain "stock tracker" for all wrapped tokens
   - Symbol, chain, ISIN, NAV oracle, document hash storage
   - Public API for wallets and explorers

5. **Token Factory UI** - React-based frontend:
 Intuitive, no-code user experience
   - Toggle between Path A (wrap) and Path B (mint)
   - Compliance module selection
   - Multi-chain deployment support

## 🚀 Key Features

### Universal Compliance
- **Path A**: Wrap existing tokens (USDT → wUSDT-Compliant)
- **Path B**: Create new compliant tokens from scratch
- **Single Infrastructure**: Same compliance system for both scenarios

### Lightning Fast Deployment
- **3-minute deployment** from idea to compliant token
- **Sub-$10k cost** vs $50k+ traditional compliance
- **One-click factory** with automated setup

### Regulatory Ready
- **KYC/AML compliance** with 256-bit verification
- **FATF Travel Rule** support
- **MiCA compliance** modules
- **Reg D lock-ups** and accredited investor restrictions

### Multi-Chain Support
- **TON** (primary)
- **XDC Network**
- **Sui**
- **Tron**

## 📋 Contract Specifications

### UniversalWrapper Contract

```tact
// Core functionality
deposit(baseToken, amount)     // Path A: Lock existing tokens
mintInitial(supply, meta)      // Path B: Create new tokens
withdraw(amount)               // Burn wrapped, release base
transfer(to, amt)              // Runs ComplianceGate.check()
controllerMove(from, to, amt)  // Regulator override
setDocument(hash, URI)         // Document registry
```

### ComplianceGate Module

```tact
// KYC Management
updateKYCHash(user, hash, provider, expiry)
setKYCProvider(provider, authorized)
setTrustedIssuer(issuer, trusted)

// Compliance Rules
setComplianceRule(ruleId, ruleType, active, parameters)
performComplianceCheck(from, to, amount, tokenAddress)

// Rule Types
RULE_KYC_REQUIRED
RULE_MAX_HOLDERS
RULE_FATF_TRAVEL_RULE
RULE_MICA_COMPLIANCE
RULE_REG_D_LOCKUP
```

### TokenFactory Contract

```tact
// Deployment
deployWrapper(metadata, baseToken?, controller?, complianceConfig, initialSupply, documents)
updateDeploymentStatus(deploymentId, status, wrapperAddress?)

// Configuration
setDeploymentFee(fee)
setComplianceGateTemplate(complianceGate)
setTokenBookRegistry(tokenBook)
```

### TokenBook Registry

```tact
// Registration
registerToken(wrapperAddress, metadata, complianceConfig, documents)
updateTokenMetadata(wrapperAddress, metadata)
setTokenNAVOracle(wrapperAddress, oracleAddress, oracleType)

// Search & Discovery
getToken(wrapperAddress)
getTokenBySymbol(symbol)
getTokenByISIN(isin)
searchTokens(query)
```

## 🎨 Token Factory UI

### Features
- **Dual Path Selection**: Toggle between wrap existing vs mint new
- **Chain Selection**: Visual cards for TON, XDC, Sui, Tron
- **Metadata Configuration**: Name, symbol, category, jurisdiction, ISIN
- **Compliance Setup**: KYC requirements, holder limits, lockup periods
- **Document Management**: Hash-based document registry
- **Real-time Deployment**: Progress tracking and result display

### User Flow
1. **Choose Path**: Wrap existing token or mint new
2. **Select Chain**: Pick deployment network
3. **Configure Token**: Set metadata and compliance rules
4. **Deploy**: One-click deployment with progress tracking
5. **Success**: Get wrapper address and explorer links

## 🔧 Development Setup

### Prerequisites
- Node.js 20+
- TON development environment
- React development tools

### Installation
```bash
# Clone the repository
git clone <repository-url>
cd jump_id

# Install UI dependencies
cd token-factory-ui
npm install

# Start development server
npm run dev --host
```

### Contract Compilation
```bash
# Compile Tact contracts (when Blueprint is set up)
blueprint build

# Deploy to testnet
blueprint deploy
```

## 🌐 Deployment

### Local Development
```bash
cd token-factory-ui
npm run dev --host
# Access at http://localhost:5173
```

### Production Deployment
```bash
# Build for production
npm run build

# Deploy to hosting platform
# (DigitalOcean, Vercel, Netlify, etc.)
```

## 📊 Token Book Registry

The Token Book serves as a public registry for all Universal Wrappers:

### Metadata Stored
- **Basic Info**: Name, symbol, decimals, description
- **Regulatory**: ISIN, jurisdiction, issuer, category
- **Compliance**: KYC requirements, holder limits, restrictions
- **Technical**: Wrapper address, base token, oracle info
- **Documents**: Hash-based document storage

### Public API
- Search by symbol, ISIN, or category
- Filter by chain, compliance requirements
- Get real-time token information
- Track holder counts and supply

## 🔐 Security Features

### Compliance Verification
- **256-bit KYC hashes** for fast verification
- **Trusted issuer** whitelist system
- **Time-based restrictions** and lockup periods
- **Country-based** filtering

### Access Control
- **Owner-only** administrative functions
- **Agent system** for delegated management
- **Factory authorization** for automated deployment
- **Emergency controls** for regulatory compliance

## 🎯 Use Cases

### Path A: Wrapping Existing Tokens
- **USDT → wUSDT-Compliant**: Add KYC to stablecoin transfers
- **LP Tokens → wLP-Compliant**: Compliant DeFi participation
- **Wrapped Assets**: Add regulatory compliance to any token

### Path B: New Token Creation
- **Real World Assets (RWA)**: Tokenized real estate, commodities
- **Securities**: Compliant stock tokens, bonds
- **Fund Tokens**: Investment fund shares with built-in compliance

## 📈 Benefits

### For Issuers
- **Rapid Deployment**: 3 minutes vs months of legal work
- **Cost Effective**: Sub-$10k vs $50k+ traditional compliance
- **Regulatory Ready**: Built-in KYC/AML and regulatory frameworks
- **Multi-Chain**: Deploy across multiple blockchains

### For Investors
- **Compliant Trading**: KYC-verified transfers
- **Regulatory Protection**: Built-in investor protections
- **Transparency**: Public registry of all compliant tokens
- **Interoperability**: Works across multiple chains

### For Regulators
- **Visibility**: Public registry of all compliant tokens
- **Control**: Emergency controls and override capabilities
- **Compliance**: Built-in regulatory frameworks
- **Auditability**: Complete transaction and compliance history

## 🔮 Future Roadmap

### Phase 1: Core Infrastructure ✅
- Universal Wrapper contracts
- ComplianceGate module
- Token Factory UI
- Token Book registry

### Phase 2: Advanced Features
- **Cross-chain bridges** for wrapper interoperability
- **Advanced oracles** for NAV and compliance data
- **Governance modules** for decentralized management
- **Mobile app** for investor access

### Phase 3: Ecosystem Expansion
- **Institutional integrations** with banks and brokers
- **Regulatory partnerships** with financial authorities
- **DeFi protocols** supporting compliant tokens
- **Global expansion** to additional jurisdictions

## 📞 Support

For technical support, integration questions, or regulatory guidance:

- **Documentation**: [Link to full docs]
- **GitHub Issues**: [Repository issues]
- **Discord**: [Community channel]
- **Email**: [Support email]

---

**Universal Token Factory - Making any token compliant-ready in 3 minutes**

*Powered by Universal Permissioned Wrapper (UP-Wrapper) Protocol*

