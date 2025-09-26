// TON OnchainID - Identity Factory Contract
// TonIdentityFactory.tact - Deploys and manages TON Identity contracts

import "@stdlib/deploy";
import "@stdlib/ownable";

// Identity deployment configuration
struct IdentityConfig {
    managementKey: Address;
    salt: Int;
    implementationCode: Cell;
}

// Identity registry entry
struct IdentityEntry {
    owner: Address;
    identity: Address;
    deployedAt: Int;
    version: String;
}

// Messages
message DeployIdentity {
    managementKey: Address;
    salt: Int;
}

message UpdateImplementation {
    newImplementation: Cell;
    version: String;
}

message RegisterIdentity {
    owner: Address;
    identity: Address;
}

// Events
message IdentityDeployed {
    owner: Address;
    identity: Address;
    managementKey: Address;
    salt: Int;
}

message ImplementationUpdated {
    oldVersion: String;
    newVersion: String;
    implementation: Cell;
}

contract TonIdentityFactory with Deployable, Ownable {
    // Storage
    identityImplementation: Cell;
    implementationVersion: String;
    deployedIdentities: map<Address, IdentityEntry>;  // owner -> identity info
    identityByAddress: map<Address, Address>;         // identity -> owner
    totalDeployed: Int = 0;
    
    // Factory configuration
    owner: Address;
    deploymentFee: Int;
    
    // Authorized deployers (can deploy identities for others)
    authorizedDeployers: map<Address, Bool>;

    init(identityImplementation: Cell, version: String, deploymentFee: Int) {
        self.owner = sender();
        self.identityImplementation = identityImplementation;
        self.implementationVersion = version;
        self.deploymentFee = deploymentFee;
        
        // Owner is automatically authorized deployer
        self.authorizedDeployers.set(sender(), true);
    }

    // ============ Identity Deployment ============

    receive(msg: DeployIdentity) {
        // Check deployment fee
        require(context().value >= self.deploymentFee, "Insufficient deployment fee");
        
        let deployer: Address = sender();
        let owner: Address = msg.managementKey;  // Management key becomes the owner
        
        // Check if identity already exists for this owner
        require(
            self.deployedIdentities.get(owner) == null,
            "Identity already exists for this owner"
        );
        
        // Calculate identity address
        let identityAddress: Address = self.calculateIdentityAddress(
            owner,
            msg.salt
        );
        
        // Deploy identity contract
        let initData: StateInit = self.buildIdentityStateInit(
            owner,
            msg.salt
        );
        
        send(SendParameters{
            to: identityAddress,
            value: ton("0.5"),  // Deployment gas
            mode: SendIgnoreErrors,
            code: self.identityImplementation,
            data: initData.data,
            body: InitializeIdentity{
                managementKey: msg.managementKey
            }.toCell()
        });
        
        // Register identity
        let entry: IdentityEntry = IdentityEntry{
            owner: owner,
            identity: identityAddress,
            deployedAt: now(),
            version: self.implementationVersion
        };
        
        self.deployedIdentities.set(owner, entry);
        self.identityByAddress.set(identityAddress, owner);
        self.totalDeployed = self.totalDeployed + 1;
        
        // Emit event
        emit(IdentityDeployed{
            owner: owner,
            identity: identityAddress,
            managementKey: msg.managementKey,
            salt: msg.salt
        }.toCell());
        
        // Refund excess payment
        let excess: Int = context().value - self.deploymentFee - ton("0.5");
        if (excess > 0) {
            send(SendParameters{
                to: deployer,
                value: excess,
                mode: SendIgnoreErrors
            });
        }
    }

    // ============ Implementation Management ============

    receive(msg: UpdateImplementation) {
        self.requireOwner();
        
        let oldVersion: String = self.implementationVersion;
        
        self.identityImplementation = msg.newImplementation;
        self.implementationVersion = msg.version;
        
        emit(ImplementationUpdated{
            oldVersion: oldVersion,
            newVersion: msg.version,
            implementation: msg.newImplementation
        }.toCell());
    }

    // ============ Registry Management ============

    receive(msg: RegisterIdentity) {
        // Allow external registration of existing identities
        require(
            self.authorizedDeployers.get(sender()) == true,
            "Not authorized to register identities"
        );
        
        require(
            self.deployedIdentities.get(msg.owner) == null,
            "Identity already registered for this owner"
        );
        
        let entry: IdentityEntry = IdentityEntry{
            owner: msg.owner,
            identity: msg.identity,
            deployedAt: now(),
            version: "external"
        };
        
        self.deployedIdentities.set(msg.owner, entry);
        self.identityByAddress.set(msg.identity, msg.owner);
        self.totalDeployed = self.totalDeployed + 1;
    }

    // ============ Authorized Deployer Management ============

    receive("add_deployer") {
        self.requireOwner();
        // Implementation would parse deployer address from message
    }

    receive("remove_deployer") {
        self.requireOwner();
        // Implementation would parse deployer address from message
    }

    // ============ Fee Management ============

    receive("update_fee") {
        self.requireOwner();
        // Implementation would parse new fee from message
    }

    receive("withdraw_fees") {
        self.requireOwner();
        
        let balance: Int = myBalance();
        let reserve: Int = ton("1");  // Keep reserve for operations
        
        if (balance > reserve) {
            send(SendParameters{
                to: self.owner,
                value: balance - reserve,
                mode: SendIgnoreErrors
            });
        }
    }

    // ============ View Functions ============

    get fun getIdentityByOwner(owner: Address): IdentityEntry? {
        return self.deployedIdentities.get(owner);
    }

    get fun getOwnerByIdentity(identity: Address): Address? {
        return self.identityByAddress.get(identity);
    }

    get fun calculateIdentityAddress(owner: Address, salt: Int): Address {
        let stateInit: StateInit = self.buildIdentityStateInit(owner, salt);
        return contractAddress(stateInit);
    }

    get fun getImplementationInfo(): ImplementationInfo {
        return ImplementationInfo{
            implementation: self.identityImplementation,
            version: self.implementationVersion,
            deploymentFee: self.deploymentFee,
            totalDeployed: self.totalDeployed
        };
    }

    get fun isAuthorizedDeployer(deployer: Address): Bool {
        return self.authorizedDeployers.get(deployer) == true;
    }

    get fun getFactoryStats(): FactoryStats {
        return FactoryStats{
            totalDeployed: self.totalDeployed,
            currentVersion: self.implementationVersion,
            deploymentFee: self.deploymentFee,
            owner: self.owner
        };
    }

    // ============ Internal Functions ============

    fun buildIdentityStateInit(owner: Address, salt: Int): StateInit {
        // Build state init for identity contract
        let dataBuilder: Builder = beginCell();
        dataBuilder = dataBuilder.storeAddress(owner);
        dataBuilder = dataBuilder.storeInt(salt, 256);
        
        return StateInit{
            code: self.identityImplementation,
            data: dataBuilder.endCell()
        };
    }

    fun generateDeploymentSalt(): Int {
        // Generate pseudo-random salt for deployment
        return now() + self.totalDeployed + myAddress().hash();
    }
}

// Helper structures
struct ImplementationInfo {
    implementation: Cell;
    version: String;
    deploymentFee: Int;
    totalDeployed: Int;
}

struct FactoryStats {
    totalDeployed: Int;
    currentVersion: String;
    deploymentFee: Int;
    owner: Address;
}

// Messages for identity initialization
message InitializeIdentity {
    managementKey: Address;
}

