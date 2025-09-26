// SPDX-License-Identifier: BUSL-1.1
// License-Filename: LICENSE.md

import "@stdlib/deploy";
import "@stdlib/ownable";
import "./AccrediWrapToken.tact";
import "../compliance/ComplianceGate.tact";
import "../core/TokenBook.tact";

// AccrediWrapFactory - One-click deployment factory for AccrediWrap Protocol
// Handles both Path A (wrap existing) and Path B (mint new) scenarios
contract AccrediWrapFactory with Deployable, Ownable {
    
    // === STORAGE ===
    
    // Factory Configuration
    deployment_fee: Int as coins = ton("5");    // 5 TON deployment fee
    fee_recipient: Address;                     // Where deployment fees go
    
    // Template Contracts
    compliance_gate_template: Address?;         // ComplianceGate template
    token_book_registry: Address?;              // TokenBook registry
    
    // Deployment Tracking
    deployment_count: Int = 0;
    deployments: map<Int, DeploymentInfo>;      // deployment_id -> info
    user_deployments: map<Address, Int>;        // user -> deployment_count
    
    // Network Configuration
    supported_networks: map<String, NetworkInfo>; // network_name -> info
    
    // Events
    event TokenDeployed {
        deployment_id: Int;
        deployer: Address;
        token_address: Address;
        symbol: String;
        name: String;
        is_wrapper_mode: Bool;
    }
    
    event DeploymentFeeUpdated {
        old_fee: Int as coins;
        new_fee: Int as coins;
    }
    
    // === INITIALIZATION ===
    
    init(owner: Address, fee_recipient: Address) {
        self.owner = owner;
        self.fee_recipient = fee_recipient;
        
        // Initialize supported networks
        self.init_networks();
    }
    
    // === MAIN DEPLOYMENT FUNCTION ===
    
    // Deploy a new AccrediWrap token (Universal function for both paths)
    receive(msg: DeployAccrediWrapper) {
        require(msg.value >= self.deployment_fee, "Insufficient deployment fee");
        
        let deployer: Address = sender();
        self.deployment_count = self.deployment_count + 1;
        let deployment_id: Int = self.deployment_count;
        
        // Create compliance gate if needed
        let compliance_gate: Address = self.get_or_create_compliance_gate(deployer, msg.compliance_config);
        
        // Create identity registry (simplified for now)
        let identity_registry: Address = myAddress(); // Placeholder
        
        // Create document registry (simplified for now)  
        let document_registry: Address = myAddress(); // Placeholder
        
        // Prepare token content cell
        let content: Cell = self.create_token_content(msg.metadata);
        
        // Deploy the AccrediWrap token
        let token_init: StateInit = initOf AccrediWrapToken(
            deployer,                           // owner
            content,                           // content
            compliance_gate,                   // compliance_gate
            identity_registry,                 // identity_registry
            document_registry,                 // document_registry
            msg.metadata.symbol,               // symbol
            msg.metadata.name,                 // name
            msg.is_wrapper_mode,               // is_wrapper_mode
            msg.base_token_address             // base_token_address
        );
        
        let token_address: Address = contractAddress(token_init);
        
        // Deploy the token contract
        send(SendParameters{
            to: token_address,
            value: ton("0.5"),
            mode: SendIgnoreErrors,
            code: token_init.code,
            data: token_init.data,
            body: "Deploy AccrediWrap Token".asComment()
        });
        
        // If Path B (mint new), mint initial supply
        if (!msg.is_wrapper_mode && msg.initial_supply > 0) {
            send(SendParameters{
                to: token_address,
                value: ton("0.1"),
                mode: SendIgnoreErrors,
                body: MintTokens{
                    to: deployer,
                    amount: msg.initial_supply
                }.toCell()
            });
        }
        
        // Register in Token Book
        if (self.token_book_registry != null) {
            send(SendParameters{
                to: self.token_book_registry!!,
                value: ton("0.1"),
                mode: SendIgnoreErrors,
                body: RegisterToken{
                    token_address: token_address,
                    metadata: msg.metadata,
                    compliance_config: msg.compliance_config,
                    documents: msg.documents,
                    deployer: deployer
                }.toCell()
            });
        }
        
        // Store deployment info
        self.deployments.set(deployment_id, DeploymentInfo{
            id: deployment_id,
            deployer: deployer,
            token_address: token_address,
            symbol: msg.metadata.symbol,
            name: msg.metadata.name,
            is_wrapper_mode: msg.is_wrapper_mode,
            base_token_address: msg.base_token_address,
            timestamp: now(),
            status: "deployed"
        });
        
        // Update user deployment count
        let user_count: Int = self.user_deployments.get(deployer) ?: 0;
        self.user_deployments.set(deployer, user_count + 1);
        
        // Send deployment fee to recipient
        send(SendParameters{
            to: self.fee_recipient,
            value: self.deployment_fee,
            mode: SendIgnoreErrors,
            body: "AccreDeFi deployment fee".asComment()
        });
        
        // Send remaining value back to deployer
        let remaining: Int = msg.value - self.deployment_fee - ton("1"); // Keep 1 TON for operations
        if (remaining > 0) {
            send(SendParameters{
                to: deployer,
                value: remaining,
                mode: SendIgnoreErrors,
                body: "Deployment complete".asComment()
            });
        }
        
        emit(TokenDeployed{
            deployment_id: deployment_id,
            deployer: deployer,
            token_address: token_address,
            symbol: msg.metadata.symbol,
            name: msg.metadata.name,
            is_wrapper_mode: msg.is_wrapper_mode
        });
    }
    
    // === COMPLIANCE GATE MANAGEMENT ===
    
    // Get or create compliance gate for a user
    fun get_or_create_compliance_gate(user: Address, config: ComplianceConfig): Address {
        // For now, use the template compliance gate
        // In production, might create user-specific gates
        if (self.compliance_gate_template != null) {
            return self.compliance_gate_template!!;
        }
        
        // Create new compliance gate
        let gate_init: StateInit = initOf ComplianceGate(user);
        let gate_address: Address = contractAddress(gate_init);
        
        send(SendParameters{
            to: gate_address,
            value: ton("0.3"),
            mode: SendIgnoreErrors,
            code: gate_init.code,
            data: gate_init.data,
            body: "Deploy ComplianceGate".asComment()
        });
        
        return gate_address;
    }
    
    // === CONTENT CREATION ===
    
    // Create token content cell (metadata)
    fun create_token_content(metadata: TokenMetadata): Cell {
        // Create JSON-like content for Jetton standard
        return beginCell()
            .storeUint(0, 8) // off-chain content flag
            .storeStringTail("https://accredefi.io/metadata/" + metadata.symbol + ".json")
            .endCell();
    }
    
    // === NETWORK INITIALIZATION ===
    
    // Initialize supported networks
    fun init_networks() {
        // TON Network
        self.supported_networks.set("TON", NetworkInfo{
            name: "TON",
            chain_id: 0,
            deployment_cost: ton("5"),
            currency_symbol: "TON",
            explorer_url: "https://tonviewer.com/"
        });
        
        // XDC Network (for future cross-chain)
        self.supported_networks.set("XDC", NetworkInfo{
            name: "XDC Network",
            chain_id: 50,
            deployment_cost: 100000000, // 100 XDC
            currency_symbol: "XDC",
            explorer_url: "https://explorer.xdc.org/"
        });
        
        // Sui Network (for future cross-chain)
        self.supported_networks.set("SUI", NetworkInfo{
            name: "Sui",
            chain_id: 101,
            deployment_cost: 10000000, // 10 SUI
            currency_symbol: "SUI",
            explorer_url: "https://suiexplorer.com/"
        });
        
        // Tron Network (for future cross-chain)
        self.supported_networks.set("TRON", NetworkInfo{
            name: "Tron",
            chain_id: 728126428,
            deployment_cost: 1000000000, // 1000 TRX
            currency_symbol: "TRX",
            explorer_url: "https://tronscan.org/"
        });
    }
    
    // === ADMIN FUNCTIONS ===
    
    // Set deployment fee
    receive(msg: SetDeploymentFee) {
        self.requireOwner();
        
        let old_fee: Int = self.deployment_fee;
        self.deployment_fee = msg.fee;
        
        emit(DeploymentFeeUpdated{old_fee: old_fee, new_fee: msg.fee});
    }
    
    // Set compliance gate template
    receive(msg: SetComplianceGateTemplate) {
        self.requireOwner();
        self.compliance_gate_template = msg.compliance_gate;
    }
    
    // Set token book registry
    receive(msg: SetTokenBookRegistry) {
        self.requireOwner();
        self.token_book_registry = msg.token_book;
    }
    
    // Update deployment status (for tracking)
    receive(msg: UpdateDeploymentStatus) {
        // Only allow from deployed contracts or owner
        let deployment: DeploymentInfo? = self.deployments.get(msg.deployment_id);
        require(deployment != null, "Deployment not found");
        
        let updated_deployment: DeploymentInfo = deployment!!;
        updated_deployment.status = msg.status;
        
        if (msg.token_address != null) {
            updated_deployment.token_address = msg.token_address!!;
        }
        
        self.deployments.set(msg.deployment_id, updated_deployment);
    }
    
    // === GETTERS ===
    
    get fun get_deployment_fee(): Int {
        return self.deployment_fee;
    }
    
    get fun get_deployment_count(): Int {
        return self.deployment_count;
    }
    
    get fun get_deployment_info(deployment_id: Int): DeploymentInfo? {
        return self.deployments.get(deployment_id);
    }
    
    get fun get_user_deployment_count(user: Address): Int {
        return self.user_deployments.get(user) ?: 0;
    }
    
    get fun get_network_info(network: String): NetworkInfo? {
        return self.supported_networks.get(network);
    }
    
    get fun get_supported_networks(): map<String, NetworkInfo> {
        return self.supported_networks;
    }
}

// === SUPPORTING STRUCTURES ===

struct TokenMetadata {
    name: String;
    symbol: String;
    decimals: Int;
    description: String;
    category: String;           // "Equity", "Debt", "RWA", etc.
    jurisdiction: String;       // "US", "EU", "SG", etc.
    issuer: String;
    isin: String?;             // International Securities Identification Number
    image_url: String?;
    website_url: String?;
}

struct DeploymentInfo {
    id: Int;
    deployer: Address;
    token_address: Address;
    symbol: String;
    name: String;
    is_wrapper_mode: Bool;
    base_token_address: Address?;
    timestamp: Int;
    status: String;            // "pending", "deployed", "failed"
}

struct NetworkInfo {
    name: String;
    chain_id: Int;
    deployment_cost: Int as coins;
    currency_symbol: String;
    explorer_url: String;
}

struct DocumentData {
    name: String;
    hash: String;
    uri: String;
}

// === FACTORY MESSAGES ===

message DeployAccrediWrapper {
    metadata: TokenMetadata;
    is_wrapper_mode: Bool;      // false = Path B (mint), true = Path A (wrap)
    base_token_address: Address?; // For Path A only
    initial_supply: Int as coins; // For Path B only
    compliance_config: ComplianceConfig;
    documents: map<String, DocumentData>;
    value: Int as coins;        // TON sent with message
}

message SetDeploymentFee {
    fee: Int as coins;
}

message SetComplianceGateTemplate {
    compliance_gate: Address;
}

message SetTokenBookRegistry {
    token_book: Address;
}

message UpdateDeploymentStatus {
    deployment_id: Int;
    status: String;
    token_address: Address?;
}

// Token Book registration message
message RegisterToken {
    token_address: Address;
    metadata: TokenMetadata;
    compliance_config: ComplianceConfig;
    documents: map<String, DocumentData>;
    deployer: Address;
}

