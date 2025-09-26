// TON OnchainID - ERC734/ERC735 Implementation for TON Blockchain
// TonIdentity.tact - Core Identity Contract with Key Management and Claims

import "@stdlib/deploy";
import "@stdlib/ownable";

// Key purposes (ERC734 standard)
const MANAGEMENT_KEY: Int = 1;
const ACTION_KEY: Int = 2;
const CLAIM_SIGNER_KEY: Int = 3;
const ENCRYPTION_KEY: Int = 4;

// Key types (ERC734 standard)
const ECDSA_TYPE: Int = 1;
const RSA_TYPE: Int = 2;

// Claim schemes (ERC735 standard)
const ECDSA_SIGNATURE: Int = 1;
const RSA_SIGNATURE: Int = 2;
const CONTRACT_SIGNATURE: Int = 3;

// Standard claim topics
const KYC_CLAIM: Int = 1;
const AML_CLAIM: Int = 2;
const ACCREDITED_INVESTOR_CLAIM: Int = 3;
const JURISDICTION_CLAIM: Int = 4;

// Key structure for ERC734
struct Key {
    purposes: map<Int, Bool>;  // purpose -> exists
    keyType: Int;
    key: Int;  // Hash of the key
}

// Claim structure for ERC735
struct Claim {
    topic: Int;
    scheme: Int;
    issuer: Address;
    signature: Slice;
    data: Slice;
    uri: String;
}

// Execution request structure
struct ExecutionRequest {
    to: Address;
    value: Int;
    data: Slice;
    approved: Bool;
    executed: Bool;
    approvals: map<Int, Bool>;  // key hash -> approved
}

// Messages for key management (ERC734)
message AddKey {
    key: Int;
    purpose: Int;
    keyType: Int;
}

message RemoveKey {
    key: Int;
    purpose: Int;
}

message ExecuteAction {
    to: Address;
    value: Int;
    data: Slice;
}

message ApproveExecution {
    executionId: Int;
    approve: Bool;
}

// Messages for claim management (ERC735)
message AddClaim {
    topic: Int;
    scheme: Int;
    issuer: Address;
    signature: Slice;
    data: Slice;
    uri: String;
}

message RemoveClaim {
    claimId: Int;
}

// Events (ERC734)
message KeyAdded {
    key: Int;
    purpose: Int;
    keyType: Int;
}

message KeyRemoved {
    key: Int;
    purpose: Int;
    keyType: Int;
}

message ExecutionRequested {
    executionId: Int;
    to: Address;
    value: Int;
    data: Slice;
}

message Executed {
    executionId: Int;
    to: Address;
    value: Int;
    data: Slice;
}

message ExecutionFailed {
    executionId: Int;
    to: Address;
    value: Int;
    data: Slice;
}

message Approved {
    executionId: Int;
    approved: Bool;
}

// Events (ERC735)
message ClaimAdded {
    claimId: Int;
    topic: Int;
    scheme: Int;
    issuer: Address;
    signature: Slice;
    data: Slice;
    uri: String;
}

message ClaimRemoved {
    claimId: Int;
    topic: Int;
    scheme: Int;
    issuer: Address;
    signature: Slice;
    data: Slice;
    uri: String;
}

message ClaimChanged {
    claimId: Int;
    topic: Int;
    scheme: Int;
    issuer: Address;
    signature: Slice;
    data: Slice;
    uri: String;
}

contract TonIdentity with Deployable, Ownable {
    // Storage
    keys: map<Int, Key>;  // key hash -> Key
    keysByPurpose: map<Int, map<Int, Bool>>;  // purpose -> key hash -> exists
    claims: map<Int, Claim>;  // claim ID -> Claim
    claimsByTopic: map<Int, map<Int, Bool>>;  // topic -> claim ID -> exists
    executionRequests: map<Int, ExecutionRequest>;
    executionNonce: Int = 0;
    
    // Owner is the initial management key
    owner: Address;

    init(initialManagementKey: Address) {
        self.owner = initialManagementKey;
        
        // Add initial management key
        let keyHash: Int = self.addressToKeyHash(initialManagementKey);
        let managementKey: Key = Key{
            purposes: emptyMap(),
            keyType: ECDSA_TYPE,
            key: keyHash
        };
        managementKey.purposes.set(MANAGEMENT_KEY, true);
        
        self.keys.set(keyHash, managementKey);
        self.keysByPurpose.get(MANAGEMENT_KEY)!!.set(keyHash, true);
        
        // Emit KeyAdded event
        emit(KeyAdded{
            key: keyHash,
            purpose: MANAGEMENT_KEY,
            keyType: ECDSA_TYPE
        }.toCell());
    }

    // ============ ERC734 Key Management ============

    receive(msg: AddKey) {
        self.requireManagementKey();
        
        let existingKey: Key? = self.keys.get(msg.key);
        if (existingKey != null) {
            // Key exists, add purpose
            existingKey!!.purposes.set(msg.purpose, true);
            self.keys.set(msg.key, existingKey!!);
        } else {
            // New key
            let newKey: Key = Key{
                purposes: emptyMap(),
                keyType: msg.keyType,
                key: msg.key
            };
            newKey.purposes.set(msg.purpose, true);
            self.keys.set(msg.key, newKey);
        }
        
        // Update purpose mapping
        if (self.keysByPurpose.get(msg.purpose) == null) {
            self.keysByPurpose.set(msg.purpose, emptyMap());
        }
        self.keysByPurpose.get(msg.purpose)!!.set(msg.key, true);
        
        // Emit event
        emit(KeyAdded{
            key: msg.key,
            purpose: msg.purpose,
            keyType: msg.keyType
        }.toCell());
    }

    receive(msg: RemoveKey) {
        self.requireManagementKey();
        
        let existingKey: Key? = self.keys.get(msg.key);
        require(existingKey != null, "Key does not exist");
        
        // Remove purpose
        existingKey!!.purposes.set(msg.purpose, false);
        
        // Check if key has any remaining purposes
        let hasPurposes: Bool = false;
        let i: Int = 1;
        while (i <= 4) {
            if (existingKey!!.purposes.get(i) == true) {
                hasPurposes = true;
            }
            i = i + 1;
        }
        
        if (!hasPurposes) {
            // Remove key entirely
            self.keys.set(msg.key, null);
        } else {
            // Update key
            self.keys.set(msg.key, existingKey!!);
        }
        
        // Update purpose mapping
        self.keysByPurpose.get(msg.purpose)!!.set(msg.key, false);
        
        // Emit event
        emit(KeyRemoved{
            key: msg.key,
            purpose: msg.purpose,
            keyType: existingKey!!.keyType
        }.toCell());
    }

    receive(msg: ExecuteAction) {
        let senderKeyHash: Int = self.addressToKeyHash(sender());
        
        // Check if sender has management or action key
        require(
            self.keyHasPurpose(senderKeyHash, MANAGEMENT_KEY) || 
            self.keyHasPurpose(senderKeyHash, ACTION_KEY),
            "Sender does not have required key"
        );
        
        self.executionNonce = self.executionNonce + 1;
        let executionId: Int = self.executionNonce;
        
        // Create execution request
        let request: ExecutionRequest = ExecutionRequest{
            to: msg.to,
            value: msg.value,
            data: msg.data,
            approved: false,
            executed: false,
            approvals: emptyMap()
        };
        
        self.executionRequests.set(executionId, request);
        
        // Emit event
        emit(ExecutionRequested{
            executionId: executionId,
            to: msg.to,
            value: msg.value,
            data: msg.data
        }.toCell());
        
        // Auto-approve if sender has management key
        if (self.keyHasPurpose(senderKeyHash, MANAGEMENT_KEY)) {
            self.approveAndExecute(executionId, senderKeyHash);
        }
    }

    receive(msg: ApproveExecution) {
        let senderKeyHash: Int = self.addressToKeyHash(sender());
        require(
            self.keyHasPurpose(senderKeyHash, MANAGEMENT_KEY),
            "Sender does not have management key"
        );
        
        let request: ExecutionRequest? = self.executionRequests.get(msg.executionId);
        require(request != null, "Execution request does not exist");
        require(!request!!.executed, "Already executed");
        
        if (msg.approve) {
            self.approveAndExecute(msg.executionId, senderKeyHash);
        }
        
        // Emit event
        emit(Approved{
            executionId: msg.executionId,
            approved: msg.approve
        }.toCell());
    }

    // ============ ERC735 Claim Management ============

    receive(msg: AddClaim) {
        let senderKeyHash: Int = self.addressToKeyHash(sender());
        require(
            self.keyHasPurpose(senderKeyHash, MANAGEMENT_KEY) ||
            self.keyHasPurpose(senderKeyHash, CLAIM_SIGNER_KEY),
            "Sender does not have required key"
        );
        
        let claimId: Int = self.generateClaimId(msg.issuer, msg.topic);
        let existingClaim: Claim? = self.claims.get(claimId);
        
        let claim: Claim = Claim{
            topic: msg.topic,
            scheme: msg.scheme,
            issuer: msg.issuer,
            signature: msg.signature,
            data: msg.data,
            uri: msg.uri
        };
        
        self.claims.set(claimId, claim);
        
        // Update topic mapping
        if (self.claimsByTopic.get(msg.topic) == null) {
            self.claimsByTopic.set(msg.topic, emptyMap());
        }
        self.claimsByTopic.get(msg.topic)!!.set(claimId, true);
        
        // Emit appropriate event
        if (existingClaim != null) {
            emit(ClaimChanged{
                claimId: claimId,
                topic: msg.topic,
                scheme: msg.scheme,
                issuer: msg.issuer,
                signature: msg.signature,
                data: msg.data,
                uri: msg.uri
            }.toCell());
        } else {
            emit(ClaimAdded{
                claimId: claimId,
                topic: msg.topic,
                scheme: msg.scheme,
                issuer: msg.issuer,
                signature: msg.signature,
                data: msg.data,
                uri: msg.uri
            }.toCell());
        }
    }

    receive(msg: RemoveClaim) {
        let senderKeyHash: Int = self.addressToKeyHash(sender());
        require(
            self.keyHasPurpose(senderKeyHash, MANAGEMENT_KEY),
            "Sender does not have management key"
        );
        
        let claim: Claim? = self.claims.get(msg.claimId);
        require(claim != null, "Claim does not exist");
        
        // Remove from topic mapping
        self.claimsByTopic.get(claim!!.topic)!!.set(msg.claimId, false);
        
        // Remove claim
        self.claims.set(msg.claimId, null);
        
        // Emit event
        emit(ClaimRemoved{
            claimId: msg.claimId,
            topic: claim!!.topic,
            scheme: claim!!.scheme,
            issuer: claim!!.issuer,
            signature: claim!!.signature,
            data: claim!!.data,
            uri: claim!!.uri
        }.toCell());
    }

    // ============ View Functions ============

    get fun getKey(key: Int): Key? {
        return self.keys.get(key);
    }

    get fun keyHasPurpose(key: Int, purpose: Int): Bool {
        let keyData: Key? = self.keys.get(key);
        if (keyData == null) {
            return false;
        }
        return keyData!!.purposes.get(purpose) == true;
    }

    get fun getKeysByPurpose(purpose: Int): map<Int, Bool> {
        let purposeMap: map<Int, Bool>? = self.keysByPurpose.get(purpose);
        if (purposeMap == null) {
            return emptyMap();
        }
        return purposeMap!!;
    }

    get fun getClaim(claimId: Int): Claim? {
        return self.claims.get(claimId);
    }

    get fun getClaimIdsByTopic(topic: Int): map<Int, Bool> {
        let topicMap: map<Int, Bool>? = self.claimsByTopic.get(topic);
        if (topicMap == null) {
            return emptyMap();
        }
        return topicMap!!;
    }

    get fun hasValidClaim(topic: Int, issuer: Address): Bool {
        let claimId: Int = self.generateClaimId(issuer, topic);
        return self.claims.get(claimId) != null;
    }

    // ============ Internal Functions ============

    fun requireManagementKey() {
        let senderKeyHash: Int = self.addressToKeyHash(sender());
        require(
            self.keyHasPurpose(senderKeyHash, MANAGEMENT_KEY),
            "Sender does not have management key"
        );
    }

    fun addressToKeyHash(addr: Address): Int {
        return addr.hash();
    }

    fun generateClaimId(issuer: Address, topic: Int): Int {
        // Equivalent to keccak256(abi.encode(issuer, topic))
        let builder: Builder = beginCell();
        builder = builder.storeAddress(issuer);
        builder = builder.storeInt(topic, 256);
        return builder.endCell().hash();
    }

    fun approveAndExecute(executionId: Int, approverKey: Int) {
        let request: ExecutionRequest? = self.executionRequests.get(executionId);
        require(request != null, "Execution request does not exist");
        
        request!!.approvals.set(approverKey, true);
        request!!.approved = true;
        request!!.executed = true;
        
        self.executionRequests.set(executionId, request!!);
        
        // Execute the action (simplified - in real implementation would make external call)
        emit(Executed{
            executionId: executionId,
            to: request!!.to,
            value: request!!.value,
            data: request!!.data
        }.toCell());
    }
}

