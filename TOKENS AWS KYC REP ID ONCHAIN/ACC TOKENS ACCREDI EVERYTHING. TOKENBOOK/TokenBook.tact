// SPDX-License-Identifier: BUSL-1.1
// License-Filename: LICENSE.md

import "@stdlib/deploy";
import "@stdlib/ownable";

// Token Book Registry
// Public "stock tracker" for all Universal Permissioned Wrappers
// Key-value registry (on-chain + REST cache) for wallets and explorers

// ============ MESSAGES ============

message RegisterToken {
    wrapperAddress: Address;
    metadata: TokenRegistryMetadata;
    complianceConfig: TokenComplianceInfo;
    documents: map<String, String>; // hash -> URI mapping
}

message UpdateTokenMetadata {
    wrapperAddress: Address;
    metadata: TokenRegistryMetadata;
}

message UpdateTokenStatus {
    wrapperAddress: Address;
    status: Int; // 1=active, 2=paused, 3=deprecated
}

message SetTokenNAVOracle {
    wrapperAddress: Address;
    oracleAddress: Address;
    oracleType: Int; // 1=chainlink, 2=custom, 3=manual
}

message UpdateTokenDocuments {
    wrapperAddress: Address;
    documents: map<String, String>;
}

message SetTokenFactory {
    factoryAddress: Address;
    authorized: Bool;
}

message SetRegistrationFee {
    fee: Int as coins;
}

// ============ EVENTS ============

message TokenRegisteredEvent {
    wrapperAddress: Address;
    symbol: String;
    chain: String;
    isin: String?;
    registrar: Address;
    timestamp: Int;
}

message TokenMetadataUpdatedEvent {
    wrapperAddress: Address;
    symbol: String;
    updatedBy: Address;
    timestamp: Int;
}

message TokenStatusUpdatedEvent {
    wrapperAddress: Address;
    oldStatus: Int;
    newStatus: Int;
    updatedBy: Address;
    timestamp: Int;
}

message NAVOracleSetEvent {
    wrapperAddress: Address;
    oracleAddress: Address;
    oracleType: Int;
    setBy: Address;
    timestamp: Int;
}

// ============ STRUCTS ============

struct TokenRegistryMetadata {
    name: String;
    symbol: String;
    decimals: Int;
    description: String;
    isin: String?; // International Securities Identification Number
    chain: String; // "TON", "XDC", "SUI", "TRON", etc.
    category: String; // "equity", "bond", "reit", "commodity", "crypto", etc.
    issuer: String; // Company or entity name
    jurisdiction: String; // "US", "UAE", "EU", etc.
    website: String?;
    logoUri: String?;
}

struct TokenComplianceInfo {
    requiresKYC: Bool;
    accreditedOnly: Bool;
    maxHolders: Int;
    minimumInvestment: Int as coins;
    lockupPeriod: Int; // in seconds
    transferRestrictions: Bool;
    regulatoryFramework: String; // "RegD", "RegS", "MiFID", "ADGM", etc.
}

struct TokenRecord {
    wrapperAddress: Address;
    metadata: TokenRegistryMetadata;
    complianceInfo: TokenComplianceInfo;
    status: Int; // 1=active, 2=paused, 3=deprecated
    registrationTime: Int;
    lastUpdated: Int;
    registrar: Address;
    navOracle: Address?;
    oracleType: Int;
    documents: map<String, String>;
    totalSupply: Int as coins;
    holderCount: Int;
    version: String; // Wrapper version
}

struct TokenSearchResult {
    wrapperAddress: Address;
    symbol: String;
    name: String;
    category: String;
    status: Int;
    requiresKYC: Bool;
}

// ============ STATUS CONSTANTS ============

const STATUS_ACTIVE: Int = 1;
const STATUS_PAUSED: Int = 2;
const STATUS_DEPRECATED: Int = 3;

// ============ ORACLE TYPES ============

const ORACLE_CHAINLINK: Int = 1;
const ORACLE_CUSTOM: Int = 2;
const ORACLE_MANUAL: Int = 3;

contract TokenBook with Deployable, Ownable {
    
    owner: Address;
    
    // Configuration
    registrationFee: Int as coins;
    
    // Token registry
    tokens: map<Address, TokenRecord>;
    tokensBySymbol: map<String, Address>; // symbol -> wrapper address
    tokensByISIN: map<String, Address>; // ISIN -> wrapper address
    tokenCount: Int;
    
    // Authorized factories
    authorizedFactories: map<Address, Bool>;
    
    // Fee collection
    collectedFees: Int as coins;
    
    // Agents management
    agents: map<Address, Bool>;
    
    // Search indices (simplified for MVP)
    tokensByCategory: map<String, Int>; // category -> count
    tokensByChain: map<String, Int>; // chain -> count
    
    init(owner: Address, registrationFee: Int as coins) {
        self.owner = owner;
        self.registrationFee = registrationFee;
        self.tokenCount = 0;
        self.collectedFees = 0;
        
        // Initialize maps
        self.tokens = emptyMap();
        self.tokensBySymbol = emptyMap();
        self.tokensByISIN = emptyMap();
        self.authorizedFactories = emptyMap();
        self.agents = emptyMap();
        self.tokensByCategory = emptyMap();
        self.tokensByChain = emptyMap();
        
        // Owner is automatically an agent
        self.agents.set(owner, true);
    }
    
    // ============ MODIFIERS ============
    
    fun requireAgent(sender: Address) {
        require(sender == self.owner || self.agents.get(sender) == true, "Not authorized agent");
    }
    
    fun requireAuthorizedFactory(sender: Address) {
        require(self.authorizedFactories.get(sender) == true, "Not authorized factory");
    }
    
    fun requireRegistrationFee(value: Int) {
        require(value >= self.registrationFee, "Insufficient registration fee");
    }
    
    fun requireTokenExists(wrapperAddress: Address) {
        require(self.tokens.get(wrapperAddress) != null, "Token not registered");
    }
    
    fun requireUniqueSymbol(symbol: String, wrapperAddress: Address) {
        let existingAddress: Address? = self.tokensBySymbol.get(symbol);
        require(existingAddress == null || existingAddress!! == wrapperAddress, "Symbol already registered");
    }
    
    fun requireUniqueISIN(isin: String, wrapperAddress: Address) {
        let existingAddress: Address? = self.tokensByISIN.get(isin);
        require(existingAddress == null || existingAddress!! == wrapperAddress, "ISIN already registered");
    }
    
    // ============ TOKEN REGISTRATION ============
    
    receive(msg: RegisterToken) {
        let registrar: Address = sender();
        let value: Int = context().value;
        
        // Check authorization (either factory or agent with fee)
        if (!self.authorizedFactories.get(registrar)) {
            self.requireAgent(registrar);
            self.requireRegistrationFee(value);
            self.collectedFees = self.collectedFees + self.registrationFee;
        }
        
        // Validate uniqueness
        self.requireUniqueSymbol(msg.metadata.symbol, msg.wrapperAddress);
        if (msg.metadata.isin != null) {
            self.requireUniqueISIN(msg.metadata.isin!!, msg.wrapperAddress);
        }
        
        // Create token record
        let tokenRecord: TokenRecord = TokenRecord{
            wrapperAddress: msg.wrapperAddress,
            metadata: msg.metadata,
            complianceInfo: msg.complianceConfig,
            status: STATUS_ACTIVE,
            registrationTime: now(),
            lastUpdated: now(),
            registrar: registrar,
            navOracle: null,
            oracleType: 0,
            documents: msg.documents,
            totalSupply: 0, // Will be updated by wrapper contract
            holderCount: 0, // Will be updated by wrapper contract
            version: "1.0.0" // Default version
        };
        
        // Store token record
        self.tokens.set(msg.wrapperAddress, tokenRecord);
        self.tokensBySymbol.set(msg.metadata.symbol, msg.wrapperAddress);
        if (msg.metadata.isin != null) {
            self.tokensByISIN.set(msg.metadata.isin!!, msg.wrapperAddress);
        }
        
        // Update counters
        self.tokenCount = self.tokenCount + 1;
        self.updateCategoryCount(msg.metadata.category, 1);
        self.updateChainCount(msg.metadata.chain, 1);
        
        emit(TokenRegisteredEvent{
            wrapperAddress: msg.wrapperAddress,
            symbol: msg.metadata.symbol,
            chain: msg.metadata.chain,
            isin: msg.metadata.isin,
            registrar: registrar,
            timestamp: now()
        }.toCell());
    }
    
    // ============ TOKEN UPDATES ============
    
    receive(msg: UpdateTokenMetadata) {
        let updater: Address = sender();
        self.requireTokenExists(msg.wrapperAddress);
        
        let tokenRecord: TokenRecord = self.tokens.get(msg.wrapperAddress)!!;
        
        // Only registrar or agents can update
        require(updater == tokenRecord.registrar || self.agents.get(updater) == true, 
                "Not authorized to update token");
        
        // Check symbol uniqueness if changed
        if (msg.metadata.symbol != tokenRecord.metadata.symbol) {
            self.requireUniqueSymbol(msg.metadata.symbol, msg.wrapperAddress);
            // Remove old symbol mapping
            self.tokensBySymbol.set(tokenRecord.metadata.symbol, null);
            // Add new symbol mapping
            self.tokensBySymbol.set(msg.metadata.symbol, msg.wrapperAddress);
        }
        
        // Check ISIN uniqueness if changed
        if (msg.metadata.isin != tokenRecord.metadata.isin) {
            if (msg.metadata.isin != null) {
                self.requireUniqueISIN(msg.metadata.isin!!, msg.wrapperAddress);
            }
            // Remove old ISIN mapping if exists
            if (tokenRecord.metadata.isin != null) {
                self.tokensByISIN.set(tokenRecord.metadata.isin!!, null);
            }
            // Add new ISIN mapping if provided
            if (msg.metadata.isin != null) {
                self.tokensByISIN.set(msg.metadata.isin!!, msg.wrapperAddress);
            }
        }
        
        // Update category counts if changed
        if (msg.metadata.category != tokenRecord.metadata.category) {
            self.updateCategoryCount(tokenRecord.metadata.category, -1);
            self.updateCategoryCount(msg.metadata.category, 1);
        }
        
        // Update chain counts if changed
        if (msg.metadata.chain != tokenRecord.metadata.chain) {
            self.updateChainCount(tokenRecord.metadata.chain, -1);
            self.updateChainCount(msg.metadata.chain, 1);
        }
        
        // Update token record
        let updatedRecord: TokenRecord = TokenRecord{
            wrapperAddress: tokenRecord.wrapperAddress,
            metadata: msg.metadata,
            complianceInfo: tokenRecord.complianceInfo,
            status: tokenRecord.status,
            registrationTime: tokenRecord.registrationTime,
            lastUpdated: now(),
            registrar: tokenRecord.registrar,
            navOracle: tokenRecord.navOracle,
            oracleType: tokenRecord.oracleType,
            documents: tokenRecord.documents,
            totalSupply: tokenRecord.totalSupply,
            holderCount: tokenRecord.holderCount,
            version: tokenRecord.version
        };
        
        self.tokens.set(msg.wrapperAddress, updatedRecord);
        
        emit(TokenMetadataUpdatedEvent{
            wrapperAddress: msg.wrapperAddress,
            symbol: msg.metadata.symbol,
            updatedBy: updater,
            timestamp: now()
        }.toCell());
    }
    
    receive(msg: UpdateTokenStatus) {
        let updater: Address = sender();
        self.requireTokenExists(msg.wrapperAddress);
        
        let tokenRecord: TokenRecord = self.tokens.get(msg.wrapperAddress)!!;
        
        // Only registrar or agents can update status
        require(updater == tokenRecord.registrar || self.agents.get(updater) == true, 
                "Not authorized to update token status");
        
        let oldStatus: Int = tokenRecord.status;
        
        // Update token record
        let updatedRecord: TokenRecord = TokenRecord{
            wrapperAddress: tokenRecord.wrapperAddress,
            metadata: tokenRecord.metadata,
            complianceInfo: tokenRecord.complianceInfo,
            status: msg.status,
            registrationTime: tokenRecord.registrationTime,
            lastUpdated: now(),
            registrar: tokenRecord.registrar,
            navOracle: tokenRecord.navOracle,
            oracleType: tokenRecord.oracleType,
            documents: tokenRecord.documents,
            totalSupply: tokenRecord.totalSupply,
            holderCount: tokenRecord.holderCount,
            version: tokenRecord.version
        };
        
        self.tokens.set(msg.wrapperAddress, updatedRecord);
        
        emit(TokenStatusUpdatedEvent{
            wrapperAddress: msg.wrapperAddress,
            oldStatus: oldStatus,
            newStatus: msg.status,
            updatedBy: updater,
            timestamp: now()
        }.toCell());
    }
    
    receive(msg: SetTokenNAVOracle) {
        let setter: Address = sender();
        self.requireTokenExists(msg.wrapperAddress);
        
        let tokenRecord: TokenRecord = self.tokens.get(msg.wrapperAddress)!!;
        
        // Only registrar or agents can set oracle
        require(setter == tokenRecord.registrar || self.agents.get(setter) == true, 
                "Not authorized to set NAV oracle");
        
        // Update token record
        let updatedRecord: TokenRecord = TokenRecord{
            wrapperAddress: tokenRecord.wrapperAddress,
            metadata: tokenRecord.metadata,
            complianceInfo: tokenRecord.complianceInfo,
            status: tokenRecord.status,
            registrationTime: tokenRecord.registrationTime,
            lastUpdated: now(),
            registrar: tokenRecord.registrar,
            navOracle: msg.oracleAddress,
            oracleType: msg.oracleType,
            documents: tokenRecord.documents,
            totalSupply: tokenRecord.totalSupply,
            holderCount: tokenRecord.holderCount,
            version: tokenRecord.version
        };
        
        self.tokens.set(msg.wrapperAddress, updatedRecord);
        
        emit(NAVOracleSetEvent{
            wrapperAddress: msg.wrapperAddress,
            oracleAddress: msg.oracleAddress,
            oracleType: msg.oracleType,
            setBy: setter,
            timestamp: now()
        }.toCell());
    }
    
    receive(msg: UpdateTokenDocuments) {
        let updater: Address = sender();
        self.requireTokenExists(msg.wrapperAddress);
        
        let tokenRecord: TokenRecord = self.tokens.get(msg.wrapperAddress)!!;
        
        // Only registrar or agents can update documents
        require(updater == tokenRecord.registrar || self.agents.get(updater) == true, 
                "Not authorized to update documents");
        
        // Update token record
        let updatedRecord: TokenRecord = TokenRecord{
            wrapperAddress: tokenRecord.wrapperAddress,
            metadata: tokenRecord.metadata,
            complianceInfo: tokenRecord.complianceInfo,
            status: tokenRecord.status,
            registrationTime: tokenRecord.registrationTime,
            lastUpdated: now(),
            registrar: tokenRecord.registrar,
            navOracle: tokenRecord.navOracle,
            oracleType: tokenRecord.oracleType,
            documents: msg.documents,
            totalSupply: tokenRecord.totalSupply,
            holderCount: tokenRecord.holderCount,
            version: tokenRecord.version
        };
        
        self.tokens.set(msg.wrapperAddress, updatedRecord);
    }
    
    // ============ CONFIGURATION ============
    
    receive(msg: SetTokenFactory) {
        self.requireOwner();
        self.authorizedFactories.set(msg.factoryAddress, msg.authorized);
    }
    
    receive(msg: SetRegistrationFee) {
        self.requireOwner();
        self.registrationFee = msg.fee;
    }
    
    // ============ HELPER FUNCTIONS ============
    
    fun updateCategoryCount(category: String, delta: Int) {
        let currentCount: Int = self.tokensByCategory.get(category) ?: 0;
        let newCount: Int = currentCount + delta;
        if (newCount <= 0) {
            self.tokensByCategory.set(category, null);
        } else {
            self.tokensByCategory.set(category, newCount);
        }
    }
    
    fun updateChainCount(chain: String, delta: Int) {
        let currentCount: Int = self.tokensByChain.get(chain) ?: 0;
        let newCount: Int = currentCount + delta;
        if (newCount <= 0) {
            self.tokensByChain.set(chain, null);
        } else {
            self.tokensByChain.set(chain, newCount);
        }
    }
    
    // ============ AGENT MANAGEMENT ============
    
    receive(msg: SetAgent) {
        self.requireOwner();
        self.agents.set(msg.agent, msg.authorized);
    }
    
    // ============ GETTERS ============
    
    get fun getToken(wrapperAddress: Address): TokenRecord? {
        return self.tokens.get(wrapperAddress);
    }
    
    get fun getTokenBySymbol(symbol: String): TokenRecord? {
        let wrapperAddress: Address? = self.tokensBySymbol.get(symbol);
        if (wrapperAddress == null) {
            return null;
        }
        return self.tokens.get(wrapperAddress!!);
    }
    
    get fun getTokenByISIN(isin: String): TokenRecord? {
        let wrapperAddress: Address? = self.tokensByISIN.get(isin);
        if (wrapperAddress == null) {
            return null;
        }
        return self.tokens.get(wrapperAddress!!);
    }
    
    get fun tokenCount(): Int {
        return self.tokenCount;
    }
    
    get fun registrationFee(): Int {
        return self.registrationFee;
    }
    
    get fun collectedFees(): Int {
        return self.collectedFees;
    }
    
    get fun isAuthorizedFactory(factory: Address): Bool {
        return self.authorizedFactories.get(factory) ?: false;
    }
    
    get fun isAgent(user: Address): Bool {
        return self.agents.get(user) ?: false;
    }
    
    get fun getCategoryCount(category: String): Int {
        return self.tokensByCategory.get(category) ?: 0;
    }
    
    get fun getChainCount(chain: String): Int {
        return self.tokensByChain.get(chain) ?: 0;
    }
    
    // ============ SEARCH FUNCTIONS ============
    
    get fun searchTokens(query: String): map<Int, TokenSearchResult> {
        // TODO: Implement search functionality
        // For MVP, return empty map as this requires complex iteration
        return emptyMap();
    }
    
    get fun getTokensByCategory(category: String): map<Int, Address> {
        // TODO: Implement category filtering
        // For MVP, return empty map as this requires complex iteration
        return emptyMap();
    }
    
    get fun getTokensByChain(chain: String): map<Int, Address> {
        // TODO: Implement chain filtering
        // For MVP, return empty map as this requires complex iteration
        return emptyMap();
    }
    
    get fun getActiveTokens(): map<Int, Address> {
        // TODO: Implement status filtering
        // For MVP, return empty map as this requires complex iteration
        return emptyMap();
    }
    
    // ============ STATISTICS ============
    
    get fun getRegistryStats(): RegistryStats {
        return RegistryStats{
            totalTokens: self.tokenCount,
            collectedFees: self.collectedFees,
            registrationFee: self.registrationFee
        };
    }
}

// Additional message types
message SetAgent {
    agent: Address;
    authorized: Bool;
}

struct RegistryStats {
    totalTokens: Int;
    collectedFees: Int as coins;
    registrationFee: Int as coins;
}

