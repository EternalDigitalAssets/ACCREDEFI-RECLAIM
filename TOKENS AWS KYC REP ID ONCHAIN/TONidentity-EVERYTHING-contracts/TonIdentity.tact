// SPDX-License-Identifier: BUSL-1.1
// License-Filename: LICENSE.md

import "@stdlib/deploy";
import "@stdlib/ownable";

// TON Identity Contract - ERC734 Key Holder equivalent
// Manages keys with different purposes and execution framework

// Key purposes (ERC734 standard)
const KEY_PURPOSE_MANAGEMENT: Int = 1;  // Management keys (can add/remove other keys)
const KEY_PURPOSE_ACTION: Int = 2;      // Action keys (can execute actions)
const KEY_PURPOSE_CLAIM: Int = 3;       // Claim keys (can add/remove claims)
const KEY_PURPOSE_ENCRYPTION: Int = 4;  // Encryption keys

// Key types
const KEY_TYPE_ECDSA: Int = 1;
const KEY_TYPE_RSA: Int = 2;

// Execution status
const EXECUTION_PENDING: Int = 0;
const EXECUTION_APPROVED: Int = 1;
const EXECUTION_EXECUTED: Int = 2;
const EXECUTION_FAILED: Int = 3;

// Messages for key management
message AddKey {
    key: Int;           // Key hash (256-bit)
    purpose: Int;       // Key purpose
    keyType: Int;       // Key type
}

message RemoveKey {
    key: Int;
    purpose: Int;
}

message Execute {
    to: Address;
    value: Int;
    data: Cell;
}

message Approve {
    executionId: Int;
    approved: Bool;
}

// Events
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
    data: Cell;
}

message ExecutionApproved {
    executionId: Int;
    approved: Bool;
}

message ExecutionExecuted {
    executionId: Int;
    to: Address;
    value: Int;
    data: Cell;
}

message ExecutionFailed {
    executionId: Int;
    to: Address;
    value: Int;
    data: Cell;
}

// Key structure
struct Key {
    purposes: map<Int, Bool>;  // Map of purposes this key has
    keyType: Int;
    exists: Bool;
}

// Execution structure
struct Execution {
    to: Address;
    value: Int;
    data: Cell;
    approved: Bool;
    executed: Bool;
    approvals: map<Int, Bool>;  // Map of key approvals
    approvalsCount: Int;
}

contract TonIdentity with Deployable, Ownable {
    owner: Address;
    keys: map<Int, Key>;                    // Map of key hash to Key struct
    keysByPurpose: map<Int, map<Int, Bool>>; // Map of purpose to keys
    executions: map<Int, Execution>;        // Map of execution ID to Execution
    executionNonce: Int = 0;
    requiredApprovals: Int = 1;             // Number of approvals needed

    init(owner: Address) {
        self.owner = owner;
        
        // Add owner as management key
        let ownerKeyHash: Int = self.addressToKeyHash(owner);
        self.keys.set(ownerKeyHash, Key{
            purposes: map<Int, Bool>{},
            keyType: KEY_TYPE_ECDSA,
            exists: true
        });
        
        // Set management purpose for owner key
        let ownerKey: Key = self.keys.get(ownerKeyHash)!!;
        ownerKey.purposes.set(KEY_PURPOSE_MANAGEMENT, true);
        self.keys.set(ownerKeyHash, ownerKey);
        
        // Add to keysByPurpose mapping
        let managementKeys: map<Int, Bool> = map<Int, Bool>{};
        managementKeys.set(ownerKeyHash, true);
        self.keysByPurpose.set(KEY_PURPOSE_MANAGEMENT, managementKeys);
    }

    // Add a key with specified purpose
    receive(msg: AddKey) {
        let senderKeyHash: Int = self.addressToKeyHash(sender());
        
        // Only management keys can add other keys
        require(self.keyHasPurpose(senderKeyHash, KEY_PURPOSE_MANAGEMENT), "Only management keys can add keys");
        
        // Create or update key
        let key: Key = self.keys.get(msg.key) ?: Key{
            purposes: map<Int, Bool>{},
            keyType: msg.keyType,
            exists: true
        };
        
        key.purposes.set(msg.purpose, true);
        self.keys.set(msg.key, key);
        
        // Add to keysByPurpose mapping
        let purposeKeys: map<Int, Bool> = self.keysByPurpose.get(msg.purpose) ?: map<Int, Bool>{};
        purposeKeys.set(msg.key, true);
        self.keysByPurpose.set(msg.purpose, purposeKeys);
        
        // Emit event
        emit(KeyAdded{key: msg.key, purpose: msg.purpose, keyType: msg.keyType}.toCell());
    }

    // Remove a key purpose
    receive(msg: RemoveKey) {
        let senderKeyHash: Int = self.addressToKeyHash(sender());
        
        // Only management keys can remove other keys
        require(self.keyHasPurpose(senderKeyHash, KEY_PURPOSE_MANAGEMENT), "Only management keys can remove keys");
        
        let key: Key? = self.keys.get(msg.key);
        require(key != null, "Key does not exist");
        
        let keyStruct: Key = key!!;
        keyStruct.purposes.set(msg.purpose, false);
        
        // Remove from keysByPurpose mapping
        let purposeKeys: map<Int, Bool>? = self.keysByPurpose.get(msg.purpose);
        if (purposeKeys != null) {
            let purposeKeysMap: map<Int, Bool> = purposeKeys!!;
            purposeKeysMap.set(msg.key, false);
            self.keysByPurpose.set(msg.purpose, purposeKeysMap);
        }
        
        // Check if key has any purposes left
        let hasPurposes: Bool = false;
        let purposes: map<Int, Bool> = keyStruct.purposes;
        // Note: In a real implementation, we'd iterate through purposes
        // For now, we'll keep the key structure
        
        self.keys.set(msg.key, keyStruct);
        
        // Emit event
        emit(KeyRemoved{key: msg.key, purpose: msg.purpose, keyType: keyStruct.keyType}.toCell());
    }

    // Execute a transaction
    receive(msg: Execute) {
        let senderKeyHash: Int = self.addressToKeyHash(sender());
        
        // Only action or management keys can execute
        require(
            self.keyHasPurpose(senderKeyHash, KEY_PURPOSE_ACTION) || 
            self.keyHasPurpose(senderKeyHash, KEY_PURPOSE_MANAGEMENT), 
            "Only action or management keys can execute"
        );
        
        self.executionNonce = self.executionNonce + 1;
        let executionId: Int = self.executionNonce;
        
        // Create execution
        let execution: Execution = Execution{
            to: msg.to,
            value: msg.value,
            data: msg.data,
            approved: false,
            executed: false,
            approvals: map<Int, Bool>{},
            approvalsCount: 0
        };
        
        self.executions.set(executionId, execution);
        
        // Emit event
        emit(ExecutionRequested{
            executionId: executionId,
            to: msg.to,
            value: msg.value,
            data: msg.data
        }.toCell());
        
        // Auto-approve if sender is management key
        if (self.keyHasPurpose(senderKeyHash, KEY_PURPOSE_MANAGEMENT)) {
            self.approveExecution(executionId, senderKeyHash);
        }
    }

    // Approve an execution
    receive(msg: Approve) {
        let senderKeyHash: Int = self.addressToKeyHash(sender());
        
        // Only management keys can approve
        require(self.keyHasPurpose(senderKeyHash, KEY_PURPOSE_MANAGEMENT), "Only management keys can approve");
        
        if (msg.approved) {
            self.approveExecution(msg.executionId, senderKeyHash);
        }
    }

    // Internal function to approve execution
    fun approveExecution(executionId: Int, keyHash: Int) {
        let execution: Execution? = self.executions.get(executionId);
        require(execution != null, "Execution does not exist");
        require(!execution!!.executed, "Execution already executed");
        
        let exec: Execution = execution!!;
        
        // Add approval if not already approved by this key
        if (!exec.approvals.get(keyHash) ?: false) {
            exec.approvals.set(keyHash, true);
            exec.approvalsCount = exec.approvalsCount + 1;
        }
        
        // Check if we have enough approvals
        if (exec.approvalsCount >= self.requiredApprovals) {
            exec.approved = true;
            exec.executed = true;
            
            // Execute the transaction
            // Note: In a real implementation, we would send the message
            // For now, we'll just mark as executed
            
            emit(ExecutionExecuted{
                executionId: executionId,
                to: exec.to,
                value: exec.value,
                data: exec.data
            }.toCell());
        } else {
            emit(ExecutionApproved{
                executionId: executionId,
                approved: true
            }.toCell());
        }
        
        self.executions.set(executionId, exec);
    }

    // Check if a key has a specific purpose
    get fun keyHasPurpose(key: Int, purpose: Int): Bool {
        let keyStruct: Key? = self.keys.get(key);
        if (keyStruct == null) {
            return false;
        }
        return keyStruct!!.purposes.get(purpose) ?: false;
    }

    // Get key information
    get fun getKey(key: Int): Key? {
        return self.keys.get(key);
    }

    // Get keys by purpose
    get fun getKeysByPurpose(purpose: Int): map<Int, Bool>? {
        return self.keysByPurpose.get(purpose);
    }

    // Convert address to key hash (simplified)
    fun addressToKeyHash(addr: Address): Int {
        // In a real implementation, this would be a proper hash function
        // For now, we'll use a simplified approach
        return addr.asSlice().loadUint(256);
    }

    // Get execution information
    get fun getExecution(executionId: Int): Execution? {
        return self.executions.get(executionId);
    }

    // Get current execution nonce
    get fun getExecutionNonce(): Int {
        return self.executionNonce;
    }
}

