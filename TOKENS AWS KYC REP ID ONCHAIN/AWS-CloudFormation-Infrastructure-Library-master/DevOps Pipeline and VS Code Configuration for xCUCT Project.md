# DevOps Pipeline and VS Code Configuration for xCUCT Project

## Overview

This document provides comprehensive DevOps pipeline configurations and development environment setup for the xCUCT (Fayafi Copper Certificate) token project. The pipeline implements automated testing, security auditing, and deployment processes across multiple environments while ensuring code quality and security standards.

## 1. CI/CD Pipeline Architecture

### 1.1 Pipeline Overview

The DevOps pipeline follows a multi-stage approach with automated quality gates and security checkpoints:

```mermaid
graph TD
    A[Code Push] --> B[Lint & Format Check]
    B --> C[Unit Tests]
    C --> D[Integration Tests]
    D --> E[Security Audit]
    E --> F[Gas Optimization Check]
    F --> G{Branch Check}
    G -->|main| H[Deploy to Apothem Testnet]
    G -->|release| I[Deploy to Mainnet]
    H --> J[Integration Testing]
    I --> K[Production Monitoring]
    J --> L[Notification]
    K --> L
```

### 1.2 GitHub Actions Workflow Configuration

```yaml
# .github/workflows/ci-cd.yml
name: xCUCT CI/CD Pipeline

on:
  push:
    branches: [ main, develop, release/* ]
  pull_request:
    branches: [ main, develop ]

env:
  NODE_VERSION: '18.x'
  PYTHON_VERSION: '3.9'
  SOLIDITY_VERSION: '0.8.20'

jobs:
  lint-and-format:
    name: Lint and Format Check
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run Solidity linter
      run: npm run lint:solidity
      
    - name: Run JavaScript/TypeScript linter
      run: npm run lint:js
      
    - name: Check code formatting
      run: npm run format:check
      
    - name: Run Prettier check
      run: npm run prettier:check

  unit-tests:
    name: Unit Tests
    runs-on: ubuntu-latest
    needs: lint-and-format
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Compile contracts
      run: npm run compile
      
    - name: Run unit tests
      run: npm run test:unit
      
    - name: Generate coverage report
      run: npm run coverage
      
    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info
        flags: unittests
        name: codecov-umbrella

  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    needs: unit-tests
    
    services:
      hardhat-node:
        image: ethereum/client-go:latest
        ports:
          - 8545:8545
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Start local blockchain
      run: npm run node:start &
      
    - name: Wait for blockchain
      run: sleep 10
      
    - name: Deploy contracts to local network
      run: npm run deploy:local
      
    - name: Run integration tests
      run: npm run test:integration
      
    - name: Run end-to-end tests
      run: npm run test:e2e

  security-audit:
    name: Security Audit
    runs-on: ubuntu-latest
    needs: unit-tests
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: 'npm'
        
    - name: Setup Python
      uses: actions/setup-python@v4
      with:
        python-version: ${{ env.PYTHON_VERSION }}
        
    - name: Install dependencies
      run: |
        npm ci
        pip install slither-analyzer mythril
        
    - name: Compile contracts
      run: npm run compile
      
    - name: Run Slither analysis
      run: |
        slither . --json slither-report.json || true
        
    - name: Run Mythril analysis
      run: |
        myth analyze contracts/*.sol --output-dir mythril-reports || true
        
    - name: Run npm audit
      run: npm audit --audit-level moderate
      
    - name: Upload security reports
      uses: actions/upload-artifact@v3
      with:
        name: security-reports
        path: |
          slither-report.json
          mythril-reports/
          
    - name: Comment security findings
      uses: actions/github-script@v6
      if: github.event_name == 'pull_request'
      with:
        script: |
          const fs = require('fs');
          try {
            const slitherReport = JSON.parse(fs.readFileSync('slither-report.json', 'utf8'));
            const findings = slitherReport.results?.detectors || [];
            
            if (findings.length > 0) {
              const comment = `## 🔒 Security Audit Results
              
              Found ${findings.length} potential security issues:
              
              ${findings.slice(0, 5).map(f => `- **${f.impact}**: ${f.description}`).join('\n')}
              
              Please review the full security report in the artifacts.`;
              
              github.rest.issues.createComment({
                issue_number: context.issue.number,
                owner: context.repo.owner,
                repo: context.repo.repo,
                body: comment
              });
            }
          } catch (error) {
            console.log('No security report found or error parsing:', error);
          }

  gas-optimization:
    name: Gas Optimization Check
    runs-on: ubuntu-latest
    needs: unit-tests
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run gas optimization tests
      run: npm run test:gas
      
    - name: Generate gas report
      run: npm run gas-report
      
    - name: Upload gas report
      uses: actions/upload-artifact@v3
      with:
        name: gas-report
        path: gas-report.txt

  deploy-testnet:
    name: Deploy to Apothem Testnet
    runs-on: ubuntu-latest
    needs: [integration-tests, security-audit, gas-optimization]
    if: github.ref == 'refs/heads/main'
    environment: testnet
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Deploy to Apothem testnet
      env:
        PRIVATE_KEY: ${{ secrets.TESTNET_PRIVATE_KEY }}
        APOTHEM_RPC_URL: ${{ secrets.APOTHEM_RPC_URL }}
        ETHERSCAN_API_KEY: ${{ secrets.ETHERSCAN_API_KEY }}
      run: |
        npm run deploy:apothem
        npm run verify:apothem
        
    - name: Run post-deployment tests
      env:
        TESTNET_RPC_URL: ${{ secrets.APOTHEM_RPC_URL }}
      run: npm run test:deployment
      
    - name: Update deployment documentation
      run: |
        npm run docs:update-deployment
        git config --local user.email "action@github.com"
        git config --local user.name "GitHub Action"
        git add docs/deployments/
        git commit -m "Update testnet deployment documentation" || exit 0
        git push

  deploy-mainnet:
    name: Deploy to Mainnet
    runs-on: ubuntu-latest
    needs: [integration-tests, security-audit, gas-optimization]
    if: startsWith(github.ref, 'refs/heads/release/')
    environment: production
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Manual approval required
      uses: trstringer/manual-approval@v1
      with:
        secret: ${{ github.TOKEN }}
        approvers: core-team
        minimum-approvals: 2
        issue-title: "Mainnet Deployment Approval Required"
        
    - name: Deploy to mainnet
      env:
        PRIVATE_KEY: ${{ secrets.MAINNET_PRIVATE_KEY }}
        MAINNET_RPC_URL: ${{ secrets.MAINNET_RPC_URL }}
        ETHERSCAN_API_KEY: ${{ secrets.ETHERSCAN_API_KEY }}
      run: |
        npm run deploy:mainnet
        npm run verify:mainnet
        
    - name: Run post-deployment verification
      env:
        MAINNET_RPC_URL: ${{ secrets.MAINNET_RPC_URL }}
      run: npm run test:mainnet-verification
      
    - name: Create release
      uses: actions/create-release@v1
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      with:
        tag_name: ${{ github.ref }}
        release_name: Release ${{ github.ref }}
        draft: false
        prerelease: false

  notify:
    name: Notification
    runs-on: ubuntu-latest
    needs: [deploy-testnet, deploy-mainnet]
    if: always()
    
    steps:
    - name: Notify Slack
      uses: 8398a7/action-slack@v3
      with:
        status: ${{ job.status }}
        channel: '#xCUCT-deployments'
        webhook_url: ${{ secrets.SLACK_WEBHOOK }}
      env:
        SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

## 2. Testing Framework Configuration

### 2.1 Hardhat Configuration

```javascript
// hardhat.config.js
require("@nomicfoundation/hardhat-toolbox");
require("@nomiclabs/hardhat-etherscan");
require("hardhat-gas-reporter");
require("solidity-coverage");
require("hardhat-deploy");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x" + "0".repeat(64);
const APOTHEM_RPC_URL = process.env.APOTHEM_RPC_URL || "";
const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  
  networks: {
    hardhat: {
      chainId: 31337,
      gas: 12000000,
      blockGasLimit: 12000000,
      allowUnlimitedContractSize: true,
    },
    
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    
    apothem: {
      url: APOTHEM_RPC_URL,
      accounts: [PRIVATE_KEY],
      chainId: 51,
      gas: 8000000,
      gasPrice: 20000000000, // 20 gwei
    },
    
    xdc: {
      url: MAINNET_RPC_URL,
      accounts: [PRIVATE_KEY],
      chainId: 50,
      gas: 8000000,
      gasPrice: 20000000000, // 20 gwei
    },
  },
  
  etherscan: {
    apiKey: {
      apothem: ETHERSCAN_API_KEY,
      xdc: ETHERSCAN_API_KEY,
    },
    customChains: [
      {
        network: "apothem",
        chainId: 51,
        urls: {
          apiURL: "https://explorer.apothem.network/api",
          browserURL: "https://explorer.apothem.network"
        }
      },
      {
        network: "xdc",
        chainId: 50,
        urls: {
          apiURL: "https://explorer.xinfin.network/api",
          browserURL: "https://explorer.xinfin.network"
        }
      }
    ]
  },
  
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
    outputFile: "gas-report.txt",
    noColors: true,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },
  
  namedAccounts: {
    deployer: {
      default: 0,
    },
    admin: {
      default: 1,
    },
  },
  
  mocha: {
    timeout: 200000, // 200 seconds
  },
  
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
    deploy: "./deploy",
  },
};
```

### 2.2 Package.json Scripts

```json
{
  "name": "xcuct-token-system",
  "version": "1.0.0",
  "description": "xCUCT Token System with Chainlink Integration",
  "scripts": {
    "compile": "hardhat compile",
    "clean": "hardhat clean",
    "test": "hardhat test",
    "test:unit": "hardhat test test/unit/**/*.js",
    "test:integration": "hardhat test test/integration/**/*.js",
    "test:e2e": "hardhat test test/e2e/**/*.js",
    "test:gas": "REPORT_GAS=true hardhat test",
    "test:deployment": "hardhat test test/deployment/**/*.js",
    "test:mainnet-verification": "hardhat test test/mainnet/**/*.js",
    "coverage": "hardhat coverage",
    "gas-report": "hardhat test --reporter gas-reporter",
    
    "lint": "npm run lint:solidity && npm run lint:js",
    "lint:solidity": "solhint 'contracts/**/*.sol'",
    "lint:js": "eslint . --ext .js,.ts",
    "lint:fix": "npm run lint:solidity:fix && npm run lint:js:fix",
    "lint:solidity:fix": "solhint 'contracts/**/*.sol' --fix",
    "lint:js:fix": "eslint . --ext .js,.ts --fix",
    
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "prettier:check": "prettier --check '**/*.{js,ts,json,md,sol}'",
    
    "node:start": "hardhat node",
    "deploy:local": "hardhat deploy --network localhost",
    "deploy:apothem": "hardhat deploy --network apothem",
    "deploy:mainnet": "hardhat deploy --network xdc",
    
    "verify:apothem": "hardhat verify --network apothem",
    "verify:mainnet": "hardhat verify --network xdc",
    
    "docs:generate": "hardhat docgen",
    "docs:update-deployment": "node scripts/update-deployment-docs.js",
    
    "security:slither": "slither .",
    "security:mythril": "myth analyze contracts/*.sol",
    "security:audit": "npm run security:slither && npm run security:mythril"
  },
  "devDependencies": {
    "@nomicfoundation/hardhat-toolbox": "^3.0.0",
    "@nomiclabs/hardhat-etherscan": "^3.1.7",
    "hardhat": "^2.17.0",
    "hardhat-deploy": "^0.11.34",
    "hardhat-gas-reporter": "^1.0.9",
    "solidity-coverage": "^0.8.4",
    "solhint": "^3.6.2",
    "eslint": "^8.44.0",
    "prettier": "^2.8.8",
    "prettier-plugin-solidity": "^1.1.3",
    "dotenv": "^16.3.1"
  },
  "dependencies": {
    "@openzeppelin/contracts": "^4.9.3",
    "@chainlink/contracts": "^0.6.1"
  }
}
```

### 2.3 Testing Configuration Files

```javascript
// test/helpers/setup.js
const { ethers } = require("hardhat");
const { expect } = require("chai");

// Common test setup and utilities
async function deployFixture() {
  const [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
  
  // Deploy mock contracts
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockToken = await MockERC20.deploy("Mock Token", "MOCK", 18);
  
  const MockChainlinkAggregator = await ethers.getContractFactory("MockChainlinkAggregator");
  const mockAggregator = await MockChainlinkAggregator.deploy(8, "COPPER/USD");
  
  // Deploy main contracts
  const XCUCTToken = await ethers.getContractFactory("XCUCTToken");
  const xcuctToken = await XCUCTToken.deploy();
  
  const XCUCTKYCRegistry = await ethers.getContractFactory("XCUCTKYCRegistry");
  const kycRegistry = await XCUCTKYCRegistry.deploy();
  
  const XCUCTMultisigWallet = await ethers.getContractFactory("XCUCTMultisigWallet");
  const multisigWallet = await XCUCTMultisigWallet.deploy([
    owner.address,
    addr1.address,
    addr2.address,
    addrs[0].address,
    addrs[1].address
  ]);
  
  return {
    owner,
    addr1,
    addr2,
    addrs,
    mockToken,
    mockAggregator,
    xcuctToken,
    kycRegistry,
    multisigWallet
  };
}

// Test utilities
const timeTravel = async (seconds) => {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine");
};

const getBlockTimestamp = async () => {
  const block = await ethers.provider.getBlock("latest");
  return block.timestamp;
};

const expectRevert = async (promise, expectedError) => {
  try {
    await promise;
    expect.fail("Expected transaction to revert");
  } catch (error) {
    expect(error.message).to.include(expectedError);
  }
};

module.exports = {
  deployFixture,
  timeTravel,
  getBlockTimestamp,
  expectRevert
};
```

```javascript
// test/unit/XCUCTToken.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployFixture } = require("../helpers/setup");

describe("XCUCTToken", function () {
  describe("Deployment", function () {
    it("Should set the right name and symbol", async function () {
      const { xcuctToken } = await loadFixture(deployFixture);
      
      expect(await xcuctToken.name()).to.equal("Fayafi Copper Certificate");
      expect(await xcuctToken.symbol()).to.equal("xCUCT");
    });
    
    it("Should set the right decimals", async function () {
      const { xcuctToken } = await loadFixture(deployFixture);
      
      expect(await xcuctToken.decimals()).to.equal(18);
    });
  });
  
  describe("Minting", function () {
    it("Should allow authorized minter to mint tokens", async function () {
      const { xcuctToken, owner, addr1 } = await loadFixture(deployFixture);
      
      const mintAmount = ethers.utils.parseEther("1000");
      await xcuctToken.mint(addr1.address, mintAmount);
      
      expect(await xcuctToken.balanceOf(addr1.address)).to.equal(mintAmount);
    });
    
    it("Should not allow unauthorized user to mint tokens", async function () {
      const { xcuctToken, addr1, addr2 } = await loadFixture(deployFixture);
      
      const mintAmount = ethers.utils.parseEther("1000");
      
      await expect(
        xcuctToken.connect(addr1).mint(addr2.address, mintAmount)
      ).to.be.revertedWith("AccessControl: account");
    });
  });
  
  describe("Burning", function () {
    it("Should allow token holder to burn their tokens", async function () {
      const { xcuctToken, owner, addr1 } = await loadFixture(deployFixture);
      
      const mintAmount = ethers.utils.parseEther("1000");
      const burnAmount = ethers.utils.parseEther("500");
      
      await xcuctToken.mint(addr1.address, mintAmount);
      await xcuctToken.connect(addr1).burn(burnAmount);
      
      expect(await xcuctToken.balanceOf(addr1.address)).to.equal(
        mintAmount.sub(burnAmount)
      );
    });
  });
});
```

## 3. Deployment Configurations

### 3.1 Deployment Scripts

```javascript
// deploy/01_deploy_xcuct_system.js
const { network } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  
  log("Deploying xCUCT Token System...");
  
  // Deploy KYC Registry first
  const kycRegistry = await deploy("XCUCTKYCRegistry", {
    from: deployer,
    args: [],
    log: true,
    waitConfirmations: network.config.blockConfirmations || 1,
  });
  
  // Deploy xCUCT Token
  const xcuctToken = await deploy("XCUCTToken", {
    from: deployer,
    args: [],
    log: true,
    waitConfirmations: network.config.blockConfirmations || 1,
  });
  
  // Deploy Multisig Wallet
  const signers = [
    deployer, // Replace with actual signer addresses
    "0x742d35Cc6634C0532925a3b8D0C9e3e0C8b4c4e5",
    "0x8ba1f109551bD432803012645Hac136c22C177e9",
    "0x4B0897b0513fdC7C541B6d9D7E929C4e5364D2dB",
    "0x583031D1113aD414F02576BD6afaBfb302140225"
  ];
  
  const multisigWallet = await deploy("XCUCTMultisigWallet", {
    from: deployer,
    args: [signers],
    log: true,
    waitConfirmations: network.config.blockConfirmations || 1,
  });
  
  // Deploy Collateral Manager
  const collateralManager = await deploy("XCUCTCollateralManager", {
    from: deployer,
    args: [kycRegistry.address, xcuctToken.address],
    log: true,
    waitConfirmations: network.config.blockConfirmations || 1,
  });
  
  // Deploy Price Feed (if on testnet, deploy mock)
  let priceFeed;
  if (network.name === "hardhat" || network.name === "localhost") {
    priceFeed = await deploy("MockChainlinkAggregator", {
      from: deployer,
      args: [8, "COPPER/USD"],
      log: true,
    });
  } else {
    // Use actual Chainlink price feed address
    const chainlinkFeeds = {
      apothem: "0x...", // Testnet Chainlink feed
      xdc: "0x..."     // Mainnet Chainlink feed
    };
    
    priceFeed = { address: chainlinkFeeds[network.name] };
  }
  
  log("Deployment completed!");
  log(`KYC Registry: ${kycRegistry.address}`);
  log(`xCUCT Token: ${xcuctToken.address}`);
  log(`Multisig Wallet: ${multisigWallet.address}`);
  log(`Collateral Manager: ${collateralManager.address}`);
  log(`Price Feed: ${priceFeed.address}`);
  
  // Save deployment info
  const deploymentInfo = {
    network: network.name,
    chainId: network.config.chainId,
    timestamp: new Date().toISOString(),
    contracts: {
      kycRegistry: kycRegistry.address,
      xcuctToken: xcuctToken.address,
      multisigWallet: multisigWallet.address,
      collateralManager: collateralManager.address,
      priceFeed: priceFeed.address
    }
  };
  
  require("fs").writeFileSync(
    `deployments/${network.name}/deployment-info.json`,
    JSON.stringify(deploymentInfo, null, 2)
  );
};

module.exports.tags = ["XCUCTSystem"];
```

### 3.2 Environment Configuration

```bash
# .env.example
# Copy this file to .env and fill in your values

# Network Configuration
APOTHEM_RPC_URL=https://rpc.apothem.network
MAINNET_RPC_URL=https://rpc.xinfin.network

# Private Keys (DO NOT COMMIT THESE)
PRIVATE_KEY=your_private_key_here
TESTNET_PRIVATE_KEY=your_testnet_private_key_here
MAINNET_PRIVATE_KEY=your_mainnet_private_key_here

# API Keys
ETHERSCAN_API_KEY=your_etherscan_api_key
COINMARKETCAP_API_KEY=your_coinmarketcap_api_key

# KYC Provider Configuration
JUMIO_API_KEY=your_jumio_api_key
JUMIO_API_SECRET=your_jumio_api_secret
ONFIDO_API_KEY=your_onfido_api_key

# SIX Group API
SIX_API_KEY=your_six_api_key
SIX_BASE_URL=https://api.six-group.com

# Monitoring and Alerts
SLACK_WEBHOOK=your_slack_webhook_url
ALERT_WEBHOOK=your_alert_webhook_url

# Database (for KYC service)
DATABASE_URL=postgresql://user:password@localhost:5432/xcuct_kyc

# Security
JWT_SECRET=your_jwt_secret_key
ENCRYPTION_KEY=your_encryption_key
```

## 4. VS Code Configuration

### 4.1 VS Code Settings

```json
// .vscode/settings.json
{
  "solidity.defaultCompiler": "remote",
  "solidity.compileUsingRemoteVersion": "v0.8.20+commit.a1b79de6",
  "solidity.packageDefaultDependenciesContractsDirectory": "contracts",
  "solidity.packageDefaultDependenciesDirectory": "node_modules",
  "solidity.formatter": "prettier",
  "solidity.linter": "solhint",
  
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  
  "files.associations": {
    "*.sol": "solidity"
  },
  
  "search.exclude": {
    "**/node_modules": true,
    "**/artifacts": true,
    "**/cache": true,
    "**/coverage": true
  },
  
  "files.exclude": {
    "**/artifacts": true,
    "**/cache": true,
    "**/coverage": true
  },
  
  "typescript.preferences.importModuleSpecifier": "relative",
  "javascript.preferences.importModuleSpecifier": "relative",
  
  "eslint.workingDirectories": ["."],
  "eslint.validate": [
    "javascript",
    "typescript"
  ],
  
  "prettier.configPath": "./.prettierrc",
  "prettier.ignorePath": "./.prettierignore"
}
```

### 4.2 Launch Configurations

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Hardhat Tests",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/hardhat",
      "args": ["test"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "skipFiles": ["<node_internals>/**"]
    },
    {
      "name": "Run Specific Test File",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/hardhat",
      "args": ["test", "${file}"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "skipFiles": ["<node_internals>/**"]
    },
    {
      "name": "Deploy to Local Network",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/hardhat",
      "args": ["deploy", "--network", "localhost"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "skipFiles": ["<node_internals>/**"]
    },
    {
      "name": "Deploy to Apothem Testnet",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/hardhat",
      "args": ["deploy", "--network", "apothem"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "skipFiles": ["<node_internals>/**"],
      "env": {
        "NODE_ENV": "testnet"
      }
    },
    {
      "name": "Start Local Blockchain",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/hardhat",
      "args": ["node"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "skipFiles": ["<node_internals>/**"]
    },
    {
      "name": "Run Security Audit",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/npm",
      "args": ["run", "security:audit"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "skipFiles": ["<node_internals>/**"]
    },
    {
      "name": "Debug KYC Service",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/backend/app.py",
      "console": "integratedTerminal",
      "env": {
        "FLASK_ENV": "development",
        "FLASK_DEBUG": "1"
      }
    }
  ]
}
```

### 4.3 Tasks Configuration

```json
// .vscode/tasks.json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Compile Contracts",
      "type": "shell",
      "command": "npm",
      "args": ["run", "compile"],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      },
      "problemMatcher": []
    },
    {
      "label": "Run Tests",
      "type": "shell",
      "command": "npm",
      "args": ["test"],
      "group": "test",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      },
      "problemMatcher": []
    },
    {
      "label": "Lint Code",
      "type": "shell",
      "command": "npm",
      "args": ["run", "lint"],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      },
      "problemMatcher": []
    },
    {
      "label": "Format Code",
      "type": "shell",
      "command": "npm",
      "args": ["run", "format"],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      },
      "problemMatcher": []
    },
    {
      "label": "Security Audit",
      "type": "shell",
      "command": "npm",
      "args": ["run", "security:audit"],
      "group": "test",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      },
      "problemMatcher": []
    },
    {
      "label": "Start Local Node",
      "type": "shell",
      "command": "npm",
      "args": ["run", "node:start"],
      "isBackground": true,
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "dedicated"
      },
      "problemMatcher": []
    },
    {
      "label": "Deploy Local",
      "type": "shell",
      "command": "npm",
      "args": ["run", "deploy:local"],
      "dependsOn": "Start Local Node",
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      },
      "problemMatcher": []
    }
  ]
}
```

### 4.4 Extensions Recommendations

```json
// .vscode/extensions.json
{
  "recommendations": [
    "juanblanco.solidity",
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ms-vscode.vscode-json",
    "redhat.vscode-yaml",
    "ms-python.python",
    "ms-python.flake8",
    "ms-python.black-formatter",
    "github.vscode-pull-request-github",
    "eamodio.gitlens",
    "ms-vscode.vscode-typescript-next",
    "bradlc.vscode-tailwindcss",
    "formulahendry.auto-rename-tag",
    "christian-kohler.path-intellisense",
    "visualstudioexptteam.vscodeintellicode"
  ]
}
```

## 5. Code Quality Configuration

### 5.1 ESLint Configuration

```json
// .eslintrc.json
{
  "env": {
    "browser": true,
    "es2021": true,
    "node": true,
    "mocha": true
  },
  "extends": [
    "eslint:recommended",
    "@typescript-eslint/recommended"
  ],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 12,
    "sourceType": "module"
  },
  "plugins": [
    "@typescript-eslint"
  ],
  "rules": {
    "indent": ["error", 2],
    "linebreak-style": ["error", "unix"],
    "quotes": ["error", "double"],
    "semi": ["error", "always"],
    "no-unused-vars": "warn",
    "no-console": "warn",
    "prefer-const": "error",
    "no-var": "error"
  },
  "ignorePatterns": [
    "node_modules/",
    "artifacts/",
    "cache/",
    "coverage/"
  ]
}
```

### 5.2 Solhint Configuration

```json
// .solhint.json
{
  "extends": "solhint:recommended",
  "rules": {
    "compiler-version": ["error", "^0.8.0"],
    "func-visibility": ["warn", {"ignoreConstructors": true}],
    "max-line-length": ["error", 120],
    "not-rely-on-time": "off",
    "avoid-suicide": "error",
    "avoid-sha3": "warn",
    "bracket-align": "error",
    "code-complexity": ["error", 8],
    "const-name-snakecase": "error",
    "contract-name-camelcase": "error",
    "event-name-camelcase": "error",
    "func-name-mixedcase": "error",
    "func-param-name-mixedcase": "error",
    "modifier-name-mixedcase": "error",
    "private-vars-leading-underscore": "error",
    "use-forbidden-name": "error",
    "var-name-mixedcase": "error",
    "imports-on-top": "error",
    "ordering": "error",
    "visibility-modifier-order": "error"
  }
}
```

### 5.3 Prettier Configuration

```json
// .prettierrc
{
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": false,
  "quoteProps": "as-needed",
  "trailingComma": "es5",
  "bracketSpacing": true,
  "bracketSameLine": false,
  "arrowParens": "always",
  "endOfLine": "lf",
  "overrides": [
    {
      "files": "*.sol",
      "options": {
        "printWidth": 120,
        "tabWidth": 4,
        "useTabs": false,
        "singleQuote": false,
        "bracketSpacing": false
      }
    }
  ]
}
```

## 6. Monitoring and Alerting

### 6.1 Deployment Monitoring Script

```javascript
// scripts/monitor-deployment.js
const { ethers } = require("ethers");
const axios = require("axios");

class DeploymentMonitor {
  constructor(config) {
    this.provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    this.contracts = config.contracts;
    this.slackWebhook = config.slackWebhook;
    this.checkInterval = config.checkInterval || 300000; // 5 minutes
  }
  
  async checkContractHealth() {
    const results = [];
    
    for (const [name, address] of Object.entries(this.contracts)) {
      try {
        const code = await this.provider.getCode(address);
        const isDeployed = code !== "0x";
        
        results.push({
          name,
          address,
          status: isDeployed ? "healthy" : "missing",
          timestamp: new Date().toISOString()
        });
        
        if (!isDeployed) {
          await this.sendAlert(`Contract ${name} at ${address} is missing!`);
        }
      } catch (error) {
        results.push({
          name,
          address,
          status: "error",
          error: error.message,
          timestamp: new Date().toISOString()
        });
        
        await this.sendAlert(`Error checking contract ${name}: ${error.message}`);
      }
    }
    
    return results;
  }
  
  async sendAlert(message) {
    if (!this.slackWebhook) {
      console.log(`Alert: ${message}`);
      return;
    }
    
    try {
      await axios.post(this.slackWebhook, {
        text: `🚨 xCUCT Deployment Alert: ${message}`,
        channel: "#xCUCT-alerts"
      });
    } catch (error) {
      console.error("Failed to send Slack alert:", error.message);
    }
  }
  
  start() {
    console.log("Starting deployment monitoring...");
    
    setInterval(async () => {
      try {
        const results = await this.checkContractHealth();
        console.log("Health check results:", results);
      } catch (error) {
        console.error("Health check failed:", error);
      }
    }, this.checkInterval);
  }
}

// Usage
const config = {
  rpcUrl: process.env.MAINNET_RPC_URL,
  contracts: {
    XCUCTToken: "0x...",
    KYCRegistry: "0x...",
    MultisigWallet: "0x...",
    CollateralManager: "0x..."
  },
  slackWebhook: process.env.SLACK_WEBHOOK,
  checkInterval: 300000
};

const monitor = new DeploymentMonitor(config);
monitor.start();
```

This comprehensive DevOps pipeline provides automated testing, security auditing, and deployment processes while ensuring code quality and operational reliability for the xCUCT token system.

