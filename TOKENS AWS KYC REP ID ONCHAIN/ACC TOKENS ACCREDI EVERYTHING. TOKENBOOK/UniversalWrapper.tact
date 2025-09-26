// SPDX-License-Identifier: BUSL-1.1
// License-Filename: LICENSE.md

import "@stdlib/deploy";
import "@stdlib/ownable";

// Universal Permissioned Wrapper (UP-Wrapper)
// A single smart contract "sheath" that can either:
// Path A: Wrap existing tokens and add compliance
// Path B: Mint brand-new tokens from scratch with built-in compliance

// ============ MESSAGES ============

// Path A: Wrapping existing tokens
message Deposit {
    baseToken: Address;
    amount: Int as coins;
}

// Path B: Minting new tokens (used once during deployment)
message MintInitial {
    supply: Int as coins;
    metadata: TokenMetadata;
}

// Core transfer functions
message Transfer {
    to: Address;
    amount: Int as coins;
}

message Withdraw {
    amount: Int as coins;
}

// Compliance and control
message ControllerMove {
    from: Address;
    to: Address;
    amount: Int as coins;
}

message SetDocument {
    hash: String;
    uri: String;
}

message SetKYCStatus {
    user: Address;
    kycHash: Int; // 256-bit hash for KYC verification
}

message SetComplianceGate {
    complianceGate: Address;
}

// Configuration
message SetController {
    controller: Address;
}

message SetAgent {
    agent: Address;
    authorized: Bool;
}

// ============ EVENTS ============

message DepositEvent {
    user: Address;
    baseToken: Address;
    amount: Int as coins;
    wrappedAmount: Int as coins;
}

message WithdrawEvent {
    user: Address;
    baseToken: Address;
    amount: Int as coins;
    wrappedAmount: Int as coins;
}

message TransferEvent {
    from: Address;
    to: Address;
    amount: Int as coins;
}

message ControllerMoveEvent {
    controller: Address;
    from: Address;
    to: Address;
    amount: Int as coins;
}

message DocumentSetEvent {
    hash: String;
    uri: String;
}

message KYCStatusSetEvent {
    user: Address;
    kycHash: Int;
}

// ============ STRUCTS ============

struct TokenMetadata {
    name: String;
    symbol: String;
    decimals: Int;
    description: String;
    isin: String?; // Optional ISIN for securities
}

struct DocumentRecord {
    hash: String;
    uri: String;
    timestamp: Int;
}

// ============ CONTRACT ============

contract UniversalWrapper with Deployable, Ownable {
    
    // Core state
    owner: Address;
    controller: Address?; // Regulator override authority
    complianceGate: Address?; // External compliance checking
    
    // Token configuration
    metadata: TokenMetadata;
    baseToken: Address?; // For Path A (wrapping existing tokens)
    totalSupply: Int as coins;
    
    // Path determination
    isWrappingMode: Bool; // true = Path A, false = Path B
    initialized: Bool;
    
    // Balances and compliance
    balances: map<Address, Int as coins>;
    kycStatus: map<Address, Int>; // 256-bit KYC hash per wallet
    agents: map<Address, Bool>;
    
    // Document registry (optional module)
    documents: map<String, DocumentRecord>;
    documentCount: Int;
    
    // Escrow for wrapped tokens (Path A only)
    escrowBalance: Int as coins;
    
    init(
        owner: Address,
        metadata: TokenMetadata,
        baseToken: Address?, // null for Path B (new token)
        controller: Address?
    ) {
        self.owner = owner;
        self.controller = controller;
        self.metadata = metadata;
        self.baseToken = baseToken;
        self.totalSupply = 0;
        self.initialized = false;
        self.escrowBalance = 0;
        self.documentCount = 0;
        
        // Determine path based on baseToken
        self.isWrappingMode = (baseToken != null);
        
        // Initialize maps
        self.balances = emptyMap();
        self.kycStatus = emptyMap();
        self.agents = emptyMap();
        self.documents = emptyMap();
        
        // Owner is automatically an agent
        self.agents.set(owner, true);
    }
    
    // ============ MODIFIERS ============
    
    fun requireAgent(sender: Address) {
        require(sender == self.owner || self.agents.get(sender) == true, "Not authorized agent");
    }
    
    fun requireController(sender: Address) {
        require(self.controller != null && sender == self.controller!!, "Not authorized controller");
    }
    
    fun requireKYC(user: Address) {
        require(self.kycStatus.get(user) != null && self.kycStatus.get(user)!! > 0, "KYC verification required");
    }
    
    fun requireInitialized() {
        require(self.initialized, "Contract not initialized");
    }
    
    // ============ INITIALIZATION ============
    
    // Path B: Mint initial supply for new tokens
    receive(msg: MintInitial) {
        self.requireOwner();
        require(!self.initialized, "Already initialized");
        require(!self.isWrappingMode, "Cannot mint initial supply in wrapping mode");
        
        self.totalSupply = msg.supply;
        self.balances.set(self.owner, msg.supply);
        self.initialized = true;
        
        emit(TransferEvent{
            from: newAddress(0, 0), // Zero address for minting
            to: self.owner,
            amount: msg.supply
        }.toCell());
    }
    
    // ============ PATH A: WRAPPING EXISTING TOKENS ============
    
    receive(msg: Deposit) {
        require(self.isWrappingMode, "Not in wrapping mode");
        require(msg.baseToken == self.baseToken!!, "Invalid base token");
        self.requireKYC(sender());
        
        let user: Address = sender();
        
        // TODO: In production, verify baseToken transfer to this contract
        // For now, assume the transfer happened successfully
        
        // Update escrow balance
        self.escrowBalance = self.escrowBalance + msg.amount;
        
        // Mint wrapped tokens 1:1
        let currentBalance: Int = self.balances.get(user) ?: 0;
        self.balances.set(user, currentBalance + msg.amount);
        self.totalSupply = self.totalSupply + msg.amount;
        
        // Mark as initialized on first deposit
        if (!self.initialized) {
            self.initialized = true;
        }
        
        emit(DepositEvent{
            user: user,
            baseToken: msg.baseToken,
            amount: msg.amount,
            wrappedAmount: msg.amount
        }.toCell());
    }
    
    receive(msg: Withdraw) {
        require(self.isWrappingMode, "Not in wrapping mode");
        self.requireInitialized();
        
        let user: Address = sender();
        let userBalance: Int = self.balances.get(user) ?: 0;
        
        require(userBalance >= msg.amount, "Insufficient wrapped token balance");
        require(self.escrowBalance >= msg.amount, "Insufficient escrow balance");
        
        // Burn wrapped tokens
        self.balances.set(user, userBalance - msg.amount);
        self.totalSupply = self.totalSupply - msg.amount;
        self.escrowBalance = self.escrowBalance - msg.amount;
        
        // TODO: In production, transfer base tokens back to user
        // For now, just emit the event
        
        emit(WithdrawEvent{
            user: user,
            baseToken: self.baseToken!!,
            amount: msg.amount,
            wrappedAmount: msg.amount
        }.toCell());
    }
    
    // ============ CORE TRANSFER LOGIC ============
    
    receive(msg: Transfer) {
        self.requireInitialized();
        
        let sender: Address = sender();
        let senderBalance: Int = self.balances.get(sender) ?: 0;
        
        require(senderBalance >= msg.amount, "Insufficient balance");
        self.requireKYC(sender);
        self.requireKYC(msg.to);
        
        // TODO: Add ComplianceGate check
        // if (self.complianceGate != null) {
        //     require(self.checkCompliance(sender, msg.to, msg.amount), "Compliance check failed");
        // }
        
        // Execute transfer
        self.balances.set(sender, senderBalance - msg.amount);
        let recipientBalance: Int = self.balances.get(msg.to) ?: 0;
        self.balances.set(msg.to, recipientBalance + msg.amount);
        
        emit(TransferEvent{
            from: sender,
            to: msg.to,
            amount: msg.amount
        }.toCell());
    }
    
    // ============ CONTROLLER FUNCTIONS ============
    
    receive(msg: ControllerMove) {
        self.requireController(sender());
        self.requireInitialized();
        
        let fromBalance: Int = self.balances.get(msg.from) ?: 0;
        require(fromBalance >= msg.amount, "Insufficient balance for controller move");
        
        // Execute forced transfer (bypasses compliance)
        self.balances.set(msg.from, fromBalance - msg.amount);
        let toBalance: Int = self.balances.get(msg.to) ?: 0;
        self.balances.set(msg.to, toBalance + msg.amount);
        
        emit(ControllerMoveEvent{
            controller: sender(),
            from: msg.from,
            to: msg.to,
            amount: msg.amount
        }.toCell());
    }
    
    // ============ COMPLIANCE MANAGEMENT ============
    
    receive(msg: SetKYCStatus) {
        self.requireAgent(sender());
        self.kycStatus.set(msg.user, msg.kycHash);
        
        emit(KYCStatusSetEvent{
            user: msg.user,
            kycHash: msg.kycHash
        }.toCell());
    }
    
    receive(msg: SetComplianceGate) {
        self.requireOwner();
        self.complianceGate = msg.complianceGate;
    }
    
    // ============ DOCUMENT REGISTRY ============
    
    receive(msg: SetDocument) {
        self.requireAgent(sender());
        
        let document: DocumentRecord = DocumentRecord{
            hash: msg.hash,
            uri: msg.uri,
            timestamp: now()
        };
        
        self.documents.set(msg.hash, document);
        self.documentCount = self.documentCount + 1;
        
        emit(DocumentSetEvent{
            hash: msg.hash,
            uri: msg.uri
        }.toCell());
    }
    
    // ============ AGENT MANAGEMENT ============
    
    receive(msg: SetAgent) {
        self.requireOwner();
        self.agents.set(msg.agent, msg.authorized);
    }
    
    receive(msg: SetController) {
        self.requireOwner();
        self.controller = msg.controller;
    }
    
    // ============ GETTERS ============
    
    get fun name(): String {
        return self.metadata.name;
    }
    
    get fun symbol(): String {
        return self.metadata.symbol;
    }
    
    get fun decimals(): Int {
        return self.metadata.decimals;
    }
    
    get fun totalSupply(): Int {
        return self.totalSupply;
    }
    
    get fun balanceOf(user: Address): Int {
        return self.balances.get(user) ?: 0;
    }
    
    get fun kycStatusOf(user: Address): Int {
        return self.kycStatus.get(user) ?: 0;
    }
    
    get fun isAgent(user: Address): Bool {
        return self.agents.get(user) ?: false;
    }
    
    get fun baseToken(): Address? {
        return self.baseToken;
    }
    
    get fun isWrappingMode(): Bool {
        return self.isWrappingMode;
    }
    
    get fun isInitialized(): Bool {
        return self.initialized;
    }
    
    get fun controller(): Address? {
        return self.controller;
    }
    
    get fun complianceGate(): Address? {
        return self.complianceGate;
    }
    
    get fun escrowBalance(): Int {
        return self.escrowBalance;
    }
    
    get fun getDocument(hash: String): DocumentRecord? {
        return self.documents.get(hash);
    }
    
    get fun documentCount(): Int {
        return self.documentCount;
    }
    
    get fun metadata(): TokenMetadata {
        return self.metadata;
    }
}

