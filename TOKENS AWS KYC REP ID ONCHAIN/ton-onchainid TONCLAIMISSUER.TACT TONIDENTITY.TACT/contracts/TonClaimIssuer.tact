// TON OnchainID - Claim Issuer Contract
// TonClaimIssuer.tact - Issues and validates claims for KYC/AML compliance

import "@stdlib/deploy";
import "@stdlib/ownable";

// Claim validation status
const CLAIM_VALID: Int = 1;
const CLAIM_INVALID: Int = 2;
const CLAIM_REVOKED: Int = 3;

// Standard claim topics
const KYC_CLAIM: Int = 1;
const AML_CLAIM: Int = 2;
const ACCREDITED_INVESTOR_CLAIM: Int = 3;
const JURISDICTION_CLAIM: Int = 4;
const SANCTIONS_CLAIM: Int = 5;

// Claim structure
struct IssuedClaim {
    topic: Int;
    scheme: Int;
    identity: Address;
    signature: Slice;
    data: Slice;
    uri: String;
    issuedAt: Int;
    expiresAt: Int;
    revoked: Bool;
}

// Messages
message IssueClaim {
    identity: Address;
    topic: Int;
    scheme: Int;
    data: Slice;
    uri: String;
    expiresAt: Int;
}

message RevokeClaim {
    claimId: Int;
}

message RevokeClaimBySignature {
    signature: Slice;
}

message ValidateClaim {
    identity: Address;
    topic: Int;
    signature: Slice;
    data: Slice;
}

// Events
message ClaimIssued {
    claimId: Int;
    identity: Address;
    topic: Int;
    scheme: Int;
    signature: Slice;
    data: Slice;
    uri: String;
    expiresAt: Int;
}

message ClaimRevoked {
    claimId: Int;
    signature: Slice;
}

message ClaimValidated {
    claimId: Int;
    identity: Address;
    topic: Int;
    valid: Bool;
    reason: String;
}

// Response messages
message ClaimValidationResponse {
    valid: Bool;
    reason: String;
    claimId: Int;
}

contract TonClaimIssuer with Deployable, Ownable {
    // Storage
    issuedClaims: map<Int, IssuedClaim>;  // claim ID -> claim
    revokedSignatures: map<Int, Bool>;    // signature hash -> revoked
    claimNonce: Int = 0;
    
    // Issuer information
    owner: Address;
    issuerName: String;
    issuerType: String;  // "KYC", "AML", "ACCREDITATION", etc.
    
    // Trusted signers (can issue claims on behalf of this issuer)
    trustedSigners: map<Address, Bool>;

    init(issuerName: String, issuerType: String) {
        self.owner = sender();
        self.issuerName = issuerName;
        self.issuerType = issuerType;
        
        // Owner is automatically a trusted signer
        self.trustedSigners.set(sender(), true);
    }

    // ============ Claim Issuance ============

    receive(msg: IssueClaim) {
        self.requireOwner();
        
        self.claimNonce = self.claimNonce + 1;
        let claimId: Int = self.claimNonce;
        
        // Generate signature for the claim
        let signature: Slice = self.generateClaimSignature(
            msg.identity,
            msg.topic,
            msg.data
        );
        
        let claim: IssuedClaim = IssuedClaim{
            topic: msg.topic,
            scheme: msg.scheme,
            identity: msg.identity,
            signature: signature,
            data: msg.data,
            uri: msg.uri,
            issuedAt: now(),
            expiresAt: msg.expiresAt,
            revoked: false
        };
        
        self.issuedClaims.set(claimId, claim);
        
        // Emit event
        emit(ClaimIssued{
            claimId: claimId,
            identity: msg.identity,
            topic: msg.topic,
            scheme: msg.scheme,
            signature: signature,
            data: msg.data,
            uri: msg.uri,
            expiresAt: msg.expiresAt
        }.toCell());
        
        // Send claim to identity contract
        send(SendParameters{
            to: msg.identity,
            value: ton("0.1"),  // Gas for adding claim
            mode: SendIgnoreErrors,
            body: AddClaimToIdentity{
                topic: msg.topic,
                scheme: msg.scheme,
                issuer: myAddress(),
                signature: signature,
                data: msg.data,
                uri: msg.uri
            }.toCell()
        });
    }

    // ============ Claim Revocation ============

    receive(msg: RevokeClaim) {
        self.requireOwner();
        
        let claim: IssuedClaim? = self.issuedClaims.get(msg.claimId);
        require(claim != null, "Claim does not exist");
        require(!claim!!.revoked, "Claim already revoked");
        
        // Mark claim as revoked
        claim!!.revoked = true;
        self.issuedClaims.set(msg.claimId, claim!!);
        
        // Mark signature as revoked
        let sigHash: Int = claim!!.signature.hash();
        self.revokedSignatures.set(sigHash, true);
        
        // Emit event
        emit(ClaimRevoked{
            claimId: msg.claimId,
            signature: claim!!.signature
        }.toCell());
        
        // Notify identity contract to remove claim
        send(SendParameters{
            to: claim!!.identity,
            value: ton("0.1"),
            mode: SendIgnoreErrors,
            body: RemoveClaimFromIdentity{
                claimId: self.generateClaimIdForIdentity(myAddress(), claim!!.topic)
            }.toCell()
        });
    }

    receive(msg: RevokeClaimBySignature) {
        self.requireOwner();
        
        let sigHash: Int = msg.signature.hash();
        require(!self.revokedSignatures.get(sigHash)!!, "Signature already revoked");
        
        self.revokedSignatures.set(sigHash, true);
        
        emit(ClaimRevoked{
            claimId: 0,  // Unknown claim ID
            signature: msg.signature
        }.toCell());
    }

    // ============ Claim Validation ============

    receive(msg: ValidateClaim) {
        let claimId: Int = self.generateClaimIdForIdentity(myAddress(), msg.topic);
        let valid: Bool = false;
        let reason: String = "";
        
        // Check if signature is revoked
        let sigHash: Int = msg.signature.hash();
        if (self.revokedSignatures.get(sigHash) == true) {
            valid = false;
            reason = "Signature revoked";
        } else {
            // Validate signature and data
            let expectedSig: Slice = self.generateClaimSignature(
                msg.identity,
                msg.topic,
                msg.data
            );
            
            if (self.signaturesEqual(msg.signature, expectedSig)) {
                valid = true;
                reason = "Valid claim";
            } else {
                valid = false;
                reason = "Invalid signature";
            }
        }
        
        // Emit validation event
        emit(ClaimValidated{
            claimId: claimId,
            identity: msg.identity,
            topic: msg.topic,
            valid: valid,
            reason: reason
        }.toCell());
        
        // Send response back to sender
        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendRemainingValue,
            body: ClaimValidationResponse{
                valid: valid,
                reason: reason,
                claimId: claimId
            }.toCell()
        });
    }

    // ============ Trusted Signer Management ============

    receive("add_signer") {
        self.requireOwner();
        // Implementation would parse signer address from message
    }

    receive("remove_signer") {
        self.requireOwner();
        // Implementation would parse signer address from message
    }

    // ============ View Functions ============

    get fun getIssuedClaim(claimId: Int): IssuedClaim? {
        return self.issuedClaims.get(claimId);
    }

    get fun isSignatureRevoked(signature: Slice): Bool {
        let sigHash: Int = signature.hash();
        return self.revokedSignatures.get(sigHash) == true;
    }

    get fun getIssuerInfo(): IssuerInfo {
        return IssuerInfo{
            name: self.issuerName,
            issuerType: self.issuerType,
            owner: self.owner,
            totalClaims: self.claimNonce
        };
    }

    get fun isTrustedSigner(signer: Address): Bool {
        return self.trustedSigners.get(signer) == true;
    }

    get fun validateClaimData(identity: Address, topic: Int, data: Slice): Bool {
        // Validate claim data based on topic
        if (topic == KYC_CLAIM) {
            return self.validateKYCData(data);
        } else if (topic == AML_CLAIM) {
            return self.validateAMLData(data);
        } else if (topic == ACCREDITED_INVESTOR_CLAIM) {
            return self.validateAccreditationData(data);
        } else if (topic == JURISDICTION_CLAIM) {
            return self.validateJurisdictionData(data);
        }
        return false;
    }

    // ============ Internal Functions ============

    fun generateClaimSignature(identity: Address, topic: Int, data: Slice): Slice {
        // Generate deterministic signature for claim
        let builder: Builder = beginCell();
        builder = builder.storeAddress(identity);
        builder = builder.storeInt(topic, 256);
        builder = builder.storeSlice(data);
        builder = builder.storeAddress(myAddress());  // Issuer address
        builder = builder.storeInt(now(), 64);        // Timestamp
        
        return builder.endCell().beginParse();
    }

    fun generateClaimIdForIdentity(issuer: Address, topic: Int): Int {
        let builder: Builder = beginCell();
        builder = builder.storeAddress(issuer);
        builder = builder.storeInt(topic, 256);
        return builder.endCell().hash();
    }

    fun signaturesEqual(sig1: Slice, sig2: Slice): Bool {
        return sig1.hash() == sig2.hash();
    }

    fun validateKYCData(data: Slice): Bool {
        // Validate KYC data structure
        // Implementation would check required fields
        return true;  // Simplified
    }

    fun validateAMLData(data: Slice): Bool {
        // Validate AML data structure
        return true;  // Simplified
    }

    fun validateAccreditationData(data: Slice): Bool {
        // Validate accreditation data structure
        return true;  // Simplified
    }

    fun validateJurisdictionData(data: Slice): Bool {
        // Validate jurisdiction data structure
        return true;  // Simplified
    }
}

// Helper structures
struct IssuerInfo {
    name: String;
    issuerType: String;
    owner: Address;
    totalClaims: Int;
}

// Messages for identity interaction
message AddClaimToIdentity {
    topic: Int;
    scheme: Int;
    issuer: Address;
    signature: Slice;
    data: Slice;
    uri: String;
}

message RemoveClaimFromIdentity {
    claimId: Int;
}

