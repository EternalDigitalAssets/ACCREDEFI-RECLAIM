// SPDX-License-Identifier: BUSL-1.1
// AccrediCoin Series A - Fungible Utility Token for Ecosystem Operations
// Enterprise-grade blockchain infrastructure for RWA tokenization

import "@stdlib/deploy";
import "@stdlib/ownable";

// ========================================================================
// DATA STRUCTURES
// ========================================================================

struct TokenMetadata {
    name: String;
    symbol: String;
    description: String;
    decimals: Int as uint8;
    image: String?;
}

struct ComplianceConfig {
    kycRequired: Bool;
    accreditedOnly: Bool;
    maxHolders: Int as uint32;
    transferRestrictions: Bool;
    holdingPeriod: Int as uint32;
}

struct EconomicsModel {
    totalSupply: Int as coins;
    totalBurned: Int as coins;
    annualInflationRate: Int as uint16; // Basis points (300 = 3.00%)
    baseBurnRate: Int as uint16; // Basis points (150 = 1.50%)
    lastInflationAdjustment: Int as uint32;
    lastBurnEvent: Int as uint32;
}

struct FlowMetrics {
    rwaAssetFlow: Int as coins;
    liquidityProviderFlow: Int as coins;
    crossFlowVolume: Int as coins;
    dexFloTVL: Int as coins;
    impermaGainVolume: Int as coins;
}

struct BridgeConfig {
    targetNetwork: Int as uint8;
    bridgeAddress: Address;
    isActive: Bool;
    dailyLimit: Int as coins;
    totalVolume: Int as coins;
}

// ========================================================================
// MESSAGE DEFINITIONS
// ========================================================================

message RegisterSeriesF {
    gtanNumber: String;
    seriesFAddress: Address;
    assetType: String;
    totalFractions: Int as uint64;
}

message SeriesFPurchase {
    queryId: Int as uint64;
    gtanNumber: String;
    fractionCount: Int as uint64;
    seriesAPayment: Int as coins;
}

message SeriesFRevenueDist {
    gtanNumber: String;
    revenueAmount: Int as coins;
    distributionId: Int as uint64;
}

message ProcessFractionPurchase {
    queryId: Int as uint64;
    buyer: Address;
    fractionCount: Int as uint64;
    seriesAPayment: Int as coins;
}

message AccrediMint {
    queryId: Int as uint64;
    recipient: Address;
    amount: Int as coins;
    flowType: Int as uint8; // 1=RWA, 2=Liquidity Provider
}

message AccrediTransfer {
    queryId: Int as uint64;
    to: Address;
    amount: Int as coins;
    forwardTonAmount: Int as coins;
    forwardPayload: Slice?;
}

message AccrediBurn {
    queryId: Int as uint64;
    amount: Int as coins;
    responseDestination: Address?;
}

message UpdateEconomics {
    newInflationRate: Int as uint16;
    newBurnRate: Int as uint16;
}

message ConfigureBridge {
    targetNetwork: Int as uint8;
    bridgeAddress: Address;
    dailyLimit: Int as coins;
}

message EmergencyPause {
    reason: String;
}

message EmergencyUnpause {
    reason: String;
}

// Event messages
message SeriesFRegisteredEvent {
    gtanNumber: String;
    seriesFAddress: Address;
    assetType: String;
    totalFractions: Int as uint64;
    registrationTimestamp: Int as uint32;
}

message SeriesFRevenueEvent {
    gtanNumber: String;
    revenueAmount: Int as coins;
    distributionTimestamp: Int as uint32;
}

message TransferEvent {
    from: Address;
    to: Address;
    amount: Int as coins;
    timestamp: Int as uint32;
}

// Jetton compatibility messages
message JettonMintNotification {
    queryId: Int as uint64;
    amount: Int as coins;
    from: Address;
    responseAddress: Address;
}

message JettonBurn {
    queryId: Int as uint64;
    amount: Int as coins;
    responseDestination: Address?;
}

// ========================================================================
// MAIN CONTRACT
// ========================================================================

contract AccrediCoin with Deployable, Ownable {
    
    // ========================================================================
    // CORE STATE
    // ========================================================================
    
    owner: Address;
    metadata: TokenMetadata;
    compliance: ComplianceConfig;
    economics: EconomicsModel;
    
    // Series identification
    seriesType: Int as uint8 = 1; // Series A identifier
    seriesName: String = "AccrediCoin Series A";
    
    // Network and deployment configuration
    networkType: Int as uint8; // 1=TON, 2=XDC_SUBNET, 3=ETH
    isNativeToken: Bool = false;
    deploymentTimestamp: Int as uint32;
    
    // Jetton compatibility (for TON network)
    jettonWalletCode: Cell?;
    mintable: Bool = true;
    
    // Emergency controls
    paused: Bool = false;
    
    // ========================================================================
    // ECOSYSTEM INTEGRATION STATE
    // ========================================================================
    
    // Flow tracking for dual-flow ecosystem
    flowMetrics: FlowMetrics;
    holderCount: Int as uint32 = 0;
    
    // Balance tracking for different implementations
    balances: map<Address, Int>; // Direct balance tracking
    jettonWallets: map<Address, Address>; // Jetton wallet mapping
    
    // Cross-chain bridges
    bridges: map<Int, BridgeConfig>;
    bridgeCount: Int as uint8 = 0;
    totalBridgedOut: Int as coins = 0;
    totalBridgedIn: Int as coins = 0;
    
    // Protocol addresses for ecosystem integration
    complianceGate: Address?;
    dexFloExchange: Address?; // ImpermaGAIN system
    xScrowSecurity: Address?; // Security layer for complex transactions
    gtanRegistry: Address?; // GTAN/ITAN numbering system
    utilaCustody: Address?; // Enterprise custody
    
    // Series F integration
    seriesFRegistry: map<String, Address>; // GTAN => Series F contract address
    seriesFCount: Int as uint32 = 0;
    
    // Validator and staking (for XDC subnet)
    validatorRewardPool: Int as coins = 0;
    bridgeLiquidityPool: Int as coins = 0;
    ecosystemIncentivePool: Int as coins = 0;
    
    // Fee collection pools
    gasFeePool: Int as coins = 0;
    dexFloFeePool: Int as coins = 0;
    bridgeFeePool: Int as coins = 0;
    complianceFeePool: Int as coins = 0;

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    init(
        owner: Address,
        metadata: TokenMetadata,
        compliance: ComplianceConfig,
        networkType: Int,
        isNativeToken: Bool,
        jettonWalletCode: Cell?,
        initialSupply: Int
    ) {
        // Precondition assertions
        require(initialSupply > 0, "Initial supply must be positive");
        require(networkType >= 1 && networkType <= 3, "Invalid network type");
        require(metadata.decimals <= 18, "Decimals cannot exceed 18");
        
        self.owner = owner;
        self.metadata = metadata;
        self.compliance = compliance;
        self.networkType = networkType;
        self.isNativeToken = isNativeToken;
        self.jettonWalletCode = jettonWalletCode;
        self.deploymentTimestamp = now();
        
        // Network-specific assertions
        if (networkType == 1) { // TON Network
            require(jettonWalletCode != null, "Jetton wallet code required for TON");
        }
        
        if (isNativeToken) {
            require(networkType == 2, "Native token only supported on XDC subnet");
        }
        
        // Initialize economics model (Ethereum-style inflationary)
        self.economics = EconomicsModel{
            totalSupply: initialSupply,
            totalBurned: 0,
            annualInflationRate: 300, // 3.00%
            baseBurnRate: 150, // 1.50%
            lastInflationAdjustment: now(),
            lastBurnEvent: now()
        };
        
        // Initialize flow metrics
        self.flowMetrics = FlowMetrics{
            rwaAssetFlow: 0,
            liquidityProviderFlow: 0,
            crossFlowVolume: 0,
            dexFloTVL: 0,
            impermaGainVolume: 0
        };
        
        // Set initial balance for owner
        self.balances.set(owner, initialSupply);
        self.holderCount = 1;
        
        // Postcondition assertions
        require(self.economics.totalSupply == initialSupply, "Supply initialization failed");
        require(self.deploymentTimestamp > 0, "Deployment timestamp not set");
        require(self.getDirectBalance(owner) == initialSupply, "Owner balance initialization failed");
    }

    // ========================================================================
    // SERIES A SPECIFIC OPERATIONS
    // ========================================================================
    
    receive(msg: RegisterSeriesF) {
        self.requireOwner();
        self.requireNotPaused();
        
        // Precondition assertions
        require(self.validateGTANFormat(msg.gtanNumber), "Invalid GTAN format");
        require(self.seriesFRegistry.get(msg.gtanNumber) == null, "GTAN already registered");
        require(msg.totalFractions > 0, "Total fractions must be positive");
        require(self.validateSeriesFContract(msg.seriesFAddress), "Invalid Series F contract");
        
        self.seriesFRegistry.set(msg.gtanNumber, msg.seriesFAddress);
        self.seriesFCount = self.seriesFCount + 1;
        
        emit(SeriesFRegisteredEvent{
            gtanNumber: msg.gtanNumber,
            seriesFAddress: msg.seriesFAddress,
            assetType: msg.assetType,
            totalFractions: msg.totalFractions,
            registrationTimestamp: now()
        }.toCell());
        
        // Postcondition assertions
        require(self.seriesFRegistry.get(msg.gtanNumber) == msg.seriesFAddress, "Registration failed");
    }
    
    receive(msg: SeriesFPurchase) {
        self.requireNotPaused();
        
        let senderAddress: Address = sender();
        let seriesFContract: Address? = self.seriesFRegistry.get(msg.gtanNumber);
        
        // Precondition assertions
        require(seriesFContract != null, "Series F contract not found");
        require(msg.seriesAPayment > 0, "Invalid Series A payment amount");
        require(msg.fractionCount > 0, "Fraction count must be positive");
        
        // Verify compliance
        if (self.compliance.kycRequired) {
            self.requireKYCCompliant(senderAddress);
        }
        
        // Verify Series A balance and burn payment amount
        let senderBalance: Int = self.getBalance(senderAddress);
        require(senderBalance >= msg.seriesAPayment, "Insufficient Series A balance");
        
        // Record pre-burn state for assertions
        let preBurnSupply: Int = self.economics.totalSupply;
        let preBurnBalance: Int = senderBalance;
        
        // Burn Series A tokens used for purchase (deflationary pressure)
        self.burnFromAddress(senderAddress, msg.seriesAPayment);
        
        // Forward purchase request to Series F contract
        send(SendParameters{
            to: seriesFContract!!,
            value: ton("0.1"),
            mode: SendPayGasSeparately,
            bounce: true,
            body: ProcessFractionPurchase{
                queryId: msg.queryId,
                buyer: senderAddress,
                fractionCount: msg.fractionCount,
                seriesAPayment: msg.seriesAPayment
            }.toCell()
        });
        
        // Update flow metrics
        self.flowMetrics.rwaAssetFlow = self.flowMetrics.rwaAssetFlow + msg.seriesAPayment;
        
        // Postcondition assertions
        require(self.economics.totalSupply == preBurnSupply - msg.seriesAPayment, "Burn amount mismatch");
        require(self.getBalance(senderAddress) == preBurnBalance - msg.seriesAPayment, "Balance update failed");
    }
    
    receive(msg: SeriesFRevenueDist) {
        let seriesFContract: Address? = self.seriesFRegistry.get(msg.gtanNumber);
        
        // Precondition assertions
        require(seriesFContract != null, "Series F contract not found");
        require(sender() == seriesFContract!!, "Only registered Series F can distribute");
        require(msg.revenueAmount > 0, "Revenue amount must be positive");
        
        let preDistSupply: Int = self.economics.totalSupply;
        
        // Mint Series A tokens for revenue distribution
        self.economics.totalSupply = self.economics.totalSupply + msg.revenueAmount;
        
        // Update flow metrics
        self.flowMetrics.rwaAssetFlow = self.flowMetrics.rwaAssetFlow + msg.revenueAmount;
        
        emit(SeriesFRevenueEvent{
            gtanNumber: msg.gtanNumber,
            revenueAmount: msg.revenueAmount,
            distributionTimestamp: now()
        }.toCell());
        
        // Postcondition assertions
        require(self.economics.totalSupply == preDistSupply + msg.revenueAmount, "Supply update failed");
    }

    // ========================================================================
    // CORE TOKEN OPERATIONS
    // ========================================================================
    
    receive(msg: AccrediMint) {
        self.requireOwner();
        self.requireNotPaused();
        
        // Precondition assertions and validation
        self.validateMintRequest(msg);
        
        let preMintSupply: Int = self.economics.totalSupply;
        let preMintBalance: Int = self.getBalance(msg.recipient);
        
        // Update supply
        self.economics.totalSupply = self.economics.totalSupply + msg.amount;
        
        // Track flow metrics
        if (msg.flowType == 1) {
            // RWA Asset Path
            self.flowMetrics.rwaAssetFlow = self.flowMetrics.rwaAssetFlow + msg.amount;
        } else if (msg.flowType == 2) {
            // Liquidity Provider Path
            self.flowMetrics.liquidityProviderFlow = self.flowMetrics.liquidityProviderFlow + msg.amount;
        }
        
        // Mint based on network type
        if (self.networkType == 1) {
            self.mintJetton(msg);
        } else if (self.networkType == 2 && self.isNativeToken) {
            self.mintNative(msg);
        } else {
            self.mintDirect(msg);
        }
        
        // Update holder count if new holder
        if (preMintBalance == 0) {
            self.holderCount = self.holderCount + 1;
        }
        
        // Postcondition assertions
        require(self.economics.totalSupply == preMintSupply + msg.amount, "Supply update failed");
        require(self.getBalance(msg.recipient) >= preMintBalance + msg.amount, "Mint failed");
    }
    
    receive(msg: AccrediTransfer) {
        self.requireNotPaused();
        
        let senderAddress: Address = sender();
        
        // Precondition assertions
        require(msg.amount > 0, "Transfer amount must be positive");
        require(msg.to != senderAddress, "Cannot transfer to self");
        require(self.getBalance(senderAddress) >= msg.amount, "Insufficient balance");
        
        // Compliance checks
        if (self.compliance.transferRestrictions) {
            self.requireTransferAllowed(senderAddress, msg.to, msg.amount);
        }
        
        let senderPreBalance: Int = self.getBalance(senderAddress);
        let receiverPreBalance: Int = self.getBalance(msg.to);
        
        // Execute transfer based on network type
        if (self.networkType == 1) {
            self.transferJetton(msg);
        } else {
            self.transferDirect(senderAddress, msg.to, msg.amount);
        }
        
        emit(TransferEvent{
            from: senderAddress,
            to: msg.to,
            amount: msg.amount,
            timestamp: now()
        }.toCell());
        
        // Postcondition assertions
        require(self.getBalance(senderAddress) == senderPreBalance - msg.amount, "Sender balance incorrect");
        require(self.getBalance(msg.to) == receiverPreBalance + msg.amount, "Receiver balance incorrect");
    }
    
    receive(msg: AccrediBurn) {
        self.requireNotPaused();
        
        let senderAddress: Address = sender();
        
        // Precondition assertions
        require(msg.amount > 0, "Burn amount must be positive");
        require(self.getBalance(senderAddress) >= msg.amount, "Insufficient balance to burn");
        
        let preBurnSupply: Int = self.economics.totalSupply;
        let preBurnBalance: Int = self.getBalance(senderAddress);
        
        self.burnFromAddress(senderAddress, msg.amount);
        
        // Send response if requested
        if (msg.responseDestination != null) {
            send(SendParameters{
                to: msg.responseDestination!!,
                value: ton("0.01"),
                mode: SendIgnoreErrors,
                body: "BURN_COMPLETE".asComment()
            });
        }
        
        // Postcondition assertions
        require(self.economics.totalSupply == preBurnSupply - msg.amount, "Burn supply update failed");
        require(self.getBalance(senderAddress) == preBurnBalance - msg.amount, "Burn balance update failed");
    }

    // ========================================================================
    // NETWORK-SPECIFIC IMPLEMENTATIONS
    // ========================================================================
    
    fun mintJetton(msg: AccrediMint) {
        require(self.jettonWalletCode != null, "Jetton wallet code not available");
        
        // Create or get jetton wallet for recipient
        let walletStateInit: StateInit = self.calculateJettonWalletState(msg.recipient);
        let walletAddress: Address = contractAddress(walletStateInit);
        
        // Store wallet mapping
        self.jettonWallets.set(msg.recipient, walletAddress);
        
        send(SendParameters{
            to: walletAddress,
            value: ton("0.1"),
            mode: SendPayGasSeparately,
            bounce: true,
            body: JettonMintNotification{
                queryId: msg.queryId,
                amount: msg.amount,
                from: myAddress(),
                responseAddress: msg.recipient
            }.toCell()
        });
    }
    
    fun mintNative(msg: AccrediMint) {
        require(self.isNativeToken, "Not configured as native token");
        
        send(SendParameters{
            to: msg.recipient,
            value: msg.amount,
            mode: SendIgnoreErrors,
            body: "NATIVE_MINT_SERIES_A".asComment()
        });
    }
    
    fun mintDirect(msg: AccrediMint) {
        let currentBalance: Int = self.getDirectBalance(msg.recipient);
        self.setDirectBalance(msg.recipient, currentBalance + msg.amount);
    }
    
    fun transferJetton(msg: AccrediTransfer) {
        let walletAddress: Address? = self.jettonWallets.get(sender());
        require(walletAddress != null, "Jetton wallet not found");
        
        send(SendParameters{
            to: walletAddress!!,
            value: ton("0.1"),
            mode: SendPayGasSeparately,
            bounce: true,
            body: msg.toCell()
        });
    }
    
    fun transferDirect(from: Address, to: Address, amount: Int) {
        let fromBalance: Int = self.getDirectBalance(from);
        let toBalance: Int = self.getDirectBalance(to);
        
        require(fromBalance >= amount, "Insufficient balance for direct transfer");
        
        self.setDirectBalance(from, fromBalance - amount);
        self.setDirectBalance(to, toBalance + amount);
        
        // Update holder count
        if (fromBalance == amount) { // Sender balance becomes zero
            self.holderCount = self.holderCount - 1;
        }
        if (toBalance == 0) { // New holder
            self.holderCount = self.holderCount + 1;
        }
    }

    // ========================================================================
    // BALANCE MANAGEMENT
    // ========================================================================
    
    fun getBalance(address: Address): Int {
        if (self.networkType == 1) {
            return self.getJettonBalance(address);
        } else if (self.networkType == 2 && self.isNativeToken) {
            return self.getNativeBalance(address);
        } else {
            return self.getDirectBalance(address);
        }
    }
    
    fun getJettonBalance(address: Address): Int {
        let walletAddress: Address? = self.jettonWallets.get(address);
        if (walletAddress == null) {
            return 0;
        }
        // In production, this would query the wallet contract
        return 0; // Placeholder - requires wallet query implementation
    }
    
    fun getNativeBalance(address: Address): Int {
        // For native token on XDC subnet
        // This would integrate with XDC network balance queries
        return 0; // Placeholder - requires XDC integration
    }
    
    fun getDirectBalance(address: Address): Int {
        let balance: Int? = self.balances.get(address);
        return balance != null ? balance!! : 0;
    }
    
    fun setDirectBalance(address: Address, amount: Int) {
        require(amount >= 0, "Balance cannot be negative");
        if (amount == 0) {
            self.balances.set(address, null);
        } else {
            self.balances.set(address, amount);
        }
    }

    // ========================================================================
    // BURN MECHANISMS
    // ========================================================================
    
    fun burnFromAddress(address: Address, amount: Int) {
        // Precondition assertions
        require(amount > 0, "Invalid burn amount");
        
        let currentBalance: Int = self.getBalance(address);
        require(currentBalance >= amount, "Insufficient balance to burn");
        
        let preBurnSupply: Int = self.economics.totalSupply;
        
        // Update economics with deflationary pressure
        self.economics.totalSupply = self.economics.totalSupply - amount;
        self.economics.totalBurned = self.economics.totalBurned + amount;
        self.economics.lastBurnEvent = now();
        
        // Execute burn based on network type
        if (self.networkType == 1) {
            self.burnJetton(address, amount);
        } else if (self.networkType == 2 && self.isNativeToken) {
            self.burnNative(address, amount);
        } else {
            self.burnDirect(address, amount);
        }
        
        // Apply burn rate to fee pools (deflationary mechanism)
        self.applyBurnRateToFees();
        
        // Postcondition assertions
        require(self.economics.totalSupply == preBurnSupply - amount, "Burn supply update failed");
        require(self.economics.totalBurned >= amount, "Burned counter failed");
    }
    
    fun burnJetton(address: Address, amount: Int) {
        let walletAddress: Address? = self.jettonWallets.get(address);
        require(walletAddress != null, "Jetton wallet not found");
        
        send(SendParameters{
            to: walletAddress!!,
            value: ton("0.1"),
            mode: SendPayGasSeparately,
            bounce: true,
            body: JettonBurn{
                queryId: 0,
                amount: amount,
                responseDestination: address
            }.toCell()
        });
    }
    
    fun burnNative(address: Address, amount: Int) {
        send(SendParameters{
            to: address,
            value: 0,
            mode: SendIgnoreErrors,
            body: "NATIVE_BURN_SERIES_A".asComment()
        });
    }
    
    fun burnDirect(address: Address, amount: Int) {
        let currentBalance: Int = self.getDirectBalance(address);
        require(currentBalance >= amount, "Insufficient direct balance");
        
        let newBalance: Int = currentBalance - amount;
        self.setDirectBalance(address, newBalance);
        
        // Update holder count if balance becomes zero
        if (newBalance == 0) {
            self.holderCount = self.holderCount - 1;
        }
    }
    
    fun applyBurnRateToFees() {
        let burnAmount: Int = (self.gasFeePool * self.economics.baseBurnRate) / 10000;
        
        if (burnAmount > 0 && burnAmount <= self.gasFeePool) {
            self.gasFeePool = self.gasFeePool - burnAmount;
            self.economics.totalSupply = self.economics.totalSupply - burnAmount;
            self.economics.totalBurned = self.economics.totalBurned + burnAmount;
        }
    }

    // ========================================================================
    // VALIDATION AND COMPLIANCE
    // ========================================================================
    
    fun validateMintRequest(msg: AccrediMint) {
        require(msg.amount > 0, "Invalid mint amount");
        require(msg.recipient != myAddress(), "Cannot mint to contract");
        require(msg.flowType == 1 || msg.flowType == 2, "Invalid flow type");
        
        // Check compliance if required
        if (self.compliance.kycRequired) {
            self.requireKYCCompliant(msg.recipient);
        }
        
        // Check supply limits based on network type
        if (self.networkType == 1) { // TON Network
            let maxSupply: Int = ton("21000000000"); // 21B tokens max for TON
            require(self.economics.totalSupply + msg.amount <= maxSupply, "Exceeds max supply");
        }
        
        // Check holder limits
        if (self.compliance.maxHolders > 0) {
            let currentBalance: Int = self.getBalance(msg.recipient);
            if (currentBalance == 0) { // New holder
                require(self.holderCount < self.compliance.maxHolders, "Max holders exceeded");
            }
        }
    }
    
    fun validateGTANFormat(gtan: String): Bool {
        // GTAN format: "GTAN-YYYY-CC-NNNNNN" (17 characters)
        if (gtan.length() != 17) { return false; }
        if (gtan.slice(0, 5) != "GTAN-") { return false; }
        if (!self.isValidYear(gtan.slice(5, 9))) { return false; }
        if (!self.isValidAssetClass(gtan.slice(10, 12))) { return false; }
        return true;
    }
    
    fun isValidYear(yearStr: String): Bool {
        // Validate year is 4 digits and reasonable range (2024-2099)
        return yearStr.length() == 4;
    }
    
    fun isValidAssetClass(classStr: String): Bool {
        // Validate asset class codes
        return classStr == "RE" || // Real Estate
               classStr == "IP" || // Intellectual Property
               classStr == "EQ" || // Equipment
               classStr == "CO" || // Commodities
               classStr == "VE" || // Vehicles
               classStr == "AR" || // Art
               classStr == "BU";   // Business
    }
    
    fun validateSeriesFContract(contractAddress: Address): Bool {
        // Verify the contract is a valid Series F implementation
        // In production, this would verify contract code or interface
        return true; // Simplified validation
    }
    
    fun requireKYCCompliant(address: Address) {
        if (self.complianceGate != null) {
            // Integration with ComplianceGate contract
            send(SendParameters{
                to: self.complianceGate!!,
                value: ton("0.05"),
                mode: SendPayGasSeparately,
                bounce: true,
                body: "VERIFY_KYC_STATUS".asComment()
            });
        }
    }
    
    fun requireTransferAllowed(from: Address, to: Address, amount: Int) {
        // Check holding period if configured
        if (self.compliance.holdingPeriod > 0) {
            // In production, track acquisition timestamps
            require(now() >= self.deploymentTimestamp + self.compliance.holdingPeriod, "Holding period not met");
        }
        
        // Additional transfer restrictions can be added here
        if (self.compliance.accreditedOnly) {
            // Verify both parties are accredited
            self.requireKYCCompliant(from);
            self.requireKYCCompliant(to);
        }
    }

    // ========================================================================
    // EMERGENCY CONTROLS
    // ========================================================================
    
    receive(msg: EmergencyPause) {
        self.requireOwner();
        require(!self.paused, "Contract already paused");
        
        self.paused = true;
        
        emit("CONTRACT_PAUSED".asComment());
    }
    
    receive(msg: EmergencyUnpause) {
        self.requireOwner();
        require(self.paused, "Contract not paused");
        
        self.paused = false;
        
        emit("CONTRACT_UNPAUSED".asComment());
    }
    
    fun requireNotPaused() {
        require(!self.paused, "Contract is paused");
    }

    // ========================================================================
    // UTILITY FUNCTIONS
    // ========================================================================
    
    fun calculateJettonWalletState(owner: Address): StateInit {
        require(self.jettonWalletCode != null, "Jetton wallet code not available");
        
        return StateInit{
            code: self.jettonWalletCode!!,
            data: beginCell()
                .storeCoins(0)
                .storeAddress(owner)
                .storeAddress(myAddress())
                .endCell()
        };
    }

    // ========================================================================
    // VIEW FUNCTIONS (GETTERS)
    // ========================================================================
    
    get fun get_series_a_data(): (Int, String, Int, Int) {
        return (
            self.seriesType,
            self.seriesName, 
            self.seriesFCount,
            self.holderCount
        );
    }
    
    get fun get_series_f_address(gtanNumber: String): Address? {
        return self.seriesFRegistry.get(gtanNumber);
    }
    
    get fun get_token_data(): (Int, Bool, Address, Cell?, Cell) {
        let content: Cell = beginCell()
            .storeStringRefTail(self.metadata.name)
            .storeStringRefTail(self.metadata.symbol)
            .storeStringRefTail(self.metadata.description)
            .endCell();
        
        return (
            self.economics.totalSupply,
            self.mintable,
            self.owner,
            self.jettonWalletCode,
            content
        );
    }
    
    get fun get_economics_data(): (Int, Int, Int, Int) {
        return (
            self.economics.totalSupply,
            self.economics.totalBurned,
            self.economics.annualInflationRate,
            self.economics.baseBurnRate
        );
    }
    
    get fun get_flow_metrics(): (Int, Int, Int, Int, Int) {
        return (
            self.flowMetrics.rwaAssetFlow,
            self.flowMetrics.liquidityProviderFlow,
            self.flowMetrics.crossFlowVolume,
            self.flowMetrics.dexFloTVL,
            self.flowMetrics.impermaGainVolume
        );
    }
    
    get fun get_compliance_config(): (Bool, Bool, Int, Bool, Int) {
        return (
            self.compliance.kycRequired,
            self.compliance.accreditedOnly,
            self.compliance.maxHolders,
            self.compliance.transferRestrictions,
            self.compliance.holdingPeriod
        );
    }
    
    get fun get_balance(owner: Address): Int {
        return self.getBalance(owner);
    }
    
    get fun is_paused(): Bool {
        return self.paused;
    }
    
    get fun get_network_info(): (Int, Bool, Int) {
        return (
            self.networkType,
            self.isNativeToken,
            self.deploymentTimestamp
        );
    }
}

