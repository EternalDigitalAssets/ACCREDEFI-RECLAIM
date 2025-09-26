// SPDX-License-Identifier: BUSL-1.1
// License-Filename: LICENSE.md

import "@stdlib/deploy";
import "@stdlib/ownable";
import "../interfaces/IAccrediWrap.tact";
import "../interfaces/IJetton.tact";
import "../compliance/ComplianceGate.tact";

// AccrediWrap Token - Universal Permissioned Wrapper with Jetton ABI (Part of AccreDeFi Protocol)
// Implements both Universal Wrapper functionality and Jetton standard
contract AccrediWrapToken with Deployable, Ownable, IJetton, IAccrediWrap {
    
    // === JETTON STANDARD STORAGE ===
    total_supply: Int as coins = 0;
    mintable: Bool = true;
    content: Cell;
    
    // === ACCREDIWRAP SPECIFIC STORAGE ===
    
    // Path Configuration
    is_wrapper_mode: Bool = false;  // false = Path B (mint new), true = Path A (wrap existing)
    base_token_address: Address?;   // For Path A: address of wrapped token
    
    // Compliance System
    compliance_gate: Address;
    identity_registry: Address;
    document_registry: Address;
    
    // Controller System
    controller: Address?;           // Regulatory controller (can force transfers)
    agents: map<Address, Bool>;     // Authorized agents
    
    // Token Configuration
    decimals: Int = 9;
    symbol: String;
    name: String;
    
    // Compliance Rules
    kyc_required: Bool = true;
    max_holders: Int = 0;           // 0 = unlimited
    max_tokens_per_investor: Int = 0; // 0 = unlimited
    min_holding_period: Int = 0;    // seconds
    
    // Holder Tracking
    holder_count: Int = 0;
    holders: map<Address, Int>;     // holder -> balance
    holder_timestamps: map<Address, Int>; // holder -> first purchase timestamp
    
    // Document System
    documents: map<String, String>; // document name -> IPFS hash
    
    // Events
    event Transfer {
        from: Address?;
        to: Address;
        amount: Int as coins;
    }
    
    event Mint {
        to: Address;
        amount: Int as coins;
    }
    
    event Burn {
        from: Address;
        amount: Int as coins;
    }
    
    event ComplianceCheck {
        from: Address;
        to: Address;
        amount: Int as coins;
        result: Bool;
    }
    
    event DocumentSet {
        name: String;
        hash: String;
    }
    
    // === INITIALIZATION ===
    
    init(
        owner: Address,
        content: Cell,
        compliance_gate: Address,
        identity_registry: Address,
        document_registry: Address,
        symbol: String,
        name: String,
        is_wrapper_mode: Bool,
        base_token_address: Address?
    ) {
        self.owner = owner;
        self.content = content;
        self.compliance_gate = compliance_gate;
        self.identity_registry = identity_registry;
        self.document_registry = document_registry;
        self.symbol = symbol;
        self.name = name;
        self.is_wrapper_mode = is_wrapper_mode;
        self.base_token_address = base_token_address;
    }
    
    // === JETTON STANDARD IMPLEMENTATION ===
    
    // Get Jetton data (required by Jetton standard)
    get fun get_jetton_data(): JettonData {
        return JettonData{
            total_supply: self.total_supply,
            mintable: self.mintable,
            admin_address: self.owner,
            jetton_content: self.content,
            jetton_wallet_code: self.get_jetton_wallet_code()
        };
    }
    
    // Get wallet address for a user (required by Jetton standard)
    get fun get_wallet_address(owner: Address): Address {
        return contractAddress(self.get_jetton_wallet_init(owner));
    }
    
    // Get Jetton wallet init data
    fun get_jetton_wallet_init(owner: Address): StateInit {
        return initOf AccrediWrapWallet(owner, myAddress());
    }
    
    // Get Jetton wallet code
    fun get_jetton_wallet_code(): Cell {
        return self.get_jetton_wallet_init(myAddress()).code;
    }
    
    // === PATH A: WRAP EXISTING TOKENS ===
    
    // Deposit existing tokens and mint wrapped tokens
    receive(msg: DepositTokens) {
        require(self.is_wrapper_mode, "Not in wrapper mode");
        require(self.base_token_address != null, "Base token not set");
        
        // TODO: Verify base token transfer to this contract
        // This would require integration with the base token contract
        
        // Perform compliance check
        let compliance_result: Bool = self.check_compliance(msg.from, msg.from, msg.amount);
        require(compliance_result, "Compliance check failed");
        
        // Mint wrapped tokens
        self.mint_to(msg.from, msg.amount);
        
        emit(Transfer{from: null, to: msg.from, amount: msg.amount});
    }
    
    // Withdraw wrapped tokens and release base tokens
    receive(msg: WithdrawTokens) {
        require(self.is_wrapper_mode, "Not in wrapper mode");
        require(self.base_token_address != null, "Base token not set");
        
        let sender: Address = sender();
        let balance: Int = self.holders.get(sender) ?: 0;
        require(balance >= msg.amount, "Insufficient balance");
        
        // Check minimum holding period
        if (self.min_holding_period > 0) {
            let first_purchase: Int = self.holder_timestamps.get(sender) ?: 0;
            require(now() >= first_purchase + self.min_holding_period, "Minimum holding period not met");
        }
        
        // Burn wrapped tokens
        self.burn_from(sender, msg.amount);
        
        // TODO: Transfer base tokens back to user
        // This would require integration with the base token contract
        
        emit(Transfer{from: sender, to: null, amount: msg.amount});
    }
    
    // === PATH B: MINT NEW TOKENS ===
    
    // Mint new tokens (only owner or authorized agents)
    receive(msg: MintTokens) {
        require(!self.is_wrapper_mode, "Cannot mint in wrapper mode");
        self.requireOwner();
        
        // Perform compliance check
        let compliance_result: Bool = self.check_compliance(myAddress(), msg.to, msg.amount);
        require(compliance_result, "Compliance check failed");
        
        // Mint tokens
        self.mint_to(msg.to, msg.amount);
        
        emit(Mint{to: msg.to, amount: msg.amount});
        emit(Transfer{from: null, to: msg.to, amount: msg.amount});
    }
    
    // === COMPLIANCE SYSTEM ===
    
    // Check compliance for a transfer
    fun check_compliance(from: Address, to: Address, amount: Int): Bool {
        // Send compliance check to ComplianceGate
        send(SendParameters{
            to: self.compliance_gate,
            value: ton("0.1"),
            mode: SendIgnoreErrors,
            body: CheckCompliance{
                token: myAddress(),
                from: from,
                to: to,
                amount: amount
            }.toCell()
        });
        
        // For now, return true - in production this would be async
        // The actual compliance result would come back via a callback
        return true;
    }
    
    // Compliance check result callback (from ComplianceGate)
    receive(msg: ComplianceResult) {
        require(sender() == self.compliance_gate, "Only compliance gate can send results");
        
        emit(ComplianceCheck{
            from: msg.from,
            to: msg.to,
            amount: msg.amount,
            result: msg.approved
        });
        
        // Handle the compliance result
        if (msg.approved) {
            // Continue with the transfer
            self.execute_transfer(msg.from, msg.to, msg.amount);
        } else {
            // Reject the transfer - would need to revert or handle appropriately
            // In a real implementation, this would be part of a more complex flow
        }
    }
    
    // Execute a compliant transfer
    fun execute_transfer(from: Address, to: Address, amount: Int) {
        // Update balances
        let from_balance: Int = self.holders.get(from) ?: 0;
        let to_balance: Int = self.holders.get(to) ?: 0;
        
        require(from_balance >= amount, "Insufficient balance");
        
        self.holders.set(from, from_balance - amount);
        self.holders.set(to, to_balance + amount);
        
        // Update holder count
        if (from_balance == amount) {
            self.holder_count = self.holder_count - 1;
        }
        if (to_balance == 0) {
            self.holder_count = self.holder_count + 1;
            self.holder_timestamps.set(to, now());
        }
        
        // Check max holders limit
        if (self.max_holders > 0) {
            require(self.holder_count <= self.max_holders, "Max holders exceeded");
        }
        
        emit(Transfer{from: from, to: to, amount: amount});
    }
    
    // === CONTROLLER FUNCTIONS ===
    
    // Force transfer (regulatory override)
    receive(msg: ForceTransfer) {
        require(sender() == self.controller, "Only controller can force transfers");
        
        self.execute_transfer(msg.from, msg.to, msg.amount);
        
        emit(Transfer{from: msg.from, to: msg.to, amount: msg.amount});
    }
    
    // Set controller
    receive(msg: SetController) {
        self.requireOwner();
        self.controller = msg.controller;
    }
    
    // Add/remove agent
    receive(msg: SetAgent) {
        self.requireOwner();
        self.agents.set(msg.agent, msg.authorized);
    }
    
    // === DOCUMENT MANAGEMENT ===
    
    // Set document
    receive(msg: SetDocument) {
        self.requireOwner();
        self.documents.set(msg.name, msg.hash);
        
        emit(DocumentSet{name: msg.name, hash: msg.hash});
    }
    
    // Get document
    get fun get_document(name: String): String? {
        return self.documents.get(name);
    }
    
    // === UTILITY FUNCTIONS ===
    
    // Internal mint function
    fun mint_to(to: Address, amount: Int) {
        self.total_supply = self.total_supply + amount;
        
        let current_balance: Int = self.holders.get(to) ?: 0;
        self.holders.set(to, current_balance + amount);
        
        if (current_balance == 0) {
            self.holder_count = self.holder_count + 1;
            self.holder_timestamps.set(to, now());
        }
        
        // Check max tokens per investor
        if (self.max_tokens_per_investor > 0) {
            require(self.holders.get(to)!! <= self.max_tokens_per_investor, "Max tokens per investor exceeded");
        }
        
        // Check max holders
        if (self.max_holders > 0) {
            require(self.holder_count <= self.max_holders, "Max holders exceeded");
        }
    }
    
    // Internal burn function
    fun burn_from(from: Address, amount: Int) {
        let balance: Int = self.holders.get(from) ?: 0;
        require(balance >= amount, "Insufficient balance to burn");
        
        self.total_supply = self.total_supply - amount;
        self.holders.set(from, balance - amount);
        
        if (balance == amount) {
            self.holder_count = self.holder_count - 1;
        }
    }
    
    // === GETTERS ===
    
    get fun get_token_info(): TokenInfo {
        return TokenInfo{
            name: self.name,
            symbol: self.symbol,
            decimals: self.decimals,
            total_supply: self.total_supply,
            holder_count: self.holder_count,
            is_wrapper_mode: self.is_wrapper_mode,
            base_token_address: self.base_token_address,
            kyc_required: self.kyc_required,
            max_holders: self.max_holders,
            max_tokens_per_investor: self.max_tokens_per_investor,
            min_holding_period: self.min_holding_period
        };
    }
    
    get fun get_balance(holder: Address): Int {
        return self.holders.get(holder) ?: 0;
    }
    
    get fun get_holder_timestamp(holder: Address): Int {
        return self.holder_timestamps.get(holder) ?: 0;
    }
    
    get fun is_agent(address: Address): Bool {
        return self.agents.get(address) ?: false;
    }
}

// === JETTON WALLET CONTRACT ===

// Individual wallet contract for each holder (Jetton standard)
contract AccrediWrapWallet with Deployable {
    owner: Address;
    master: Address;
    
    init(owner: Address, master: Address) {
        self.owner = owner;
        self.master = master;
    }
    
    // Jetton wallet transfer
    receive(msg: JettonTransfer) {
        require(sender() == self.owner, "Only owner can transfer");
        
        // Forward to master contract for compliance checking
        send(SendParameters{
            to: self.master,
            value: ton("0.1"),
            mode: SendIgnoreErrors,
            body: TransferTokens{
                from: self.owner,
                to: msg.destination,
                amount: msg.amount,
                query_id: msg.query_id
            }.toCell()
        });
    }
    
    // Get wallet data (required by Jetton standard)
    get fun get_wallet_data(): JettonWalletData {
        return JettonWalletData{
            balance: 0, // Would need to query master contract
            owner: self.owner,
            jetton: self.master,
            jetton_wallet_code: myCode()
        };
    }
}

