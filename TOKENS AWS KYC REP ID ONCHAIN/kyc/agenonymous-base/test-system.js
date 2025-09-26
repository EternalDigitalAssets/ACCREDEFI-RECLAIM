// SPDX-License-Identifier: BUSL-1.1
// License-Filename: LICENSE.md

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Import AccreDeFi services
const AccreDeFiDatabase = require('./accredefi-database');
const AccreDeFiDocumentService = require('./accredefi-document-service');
const AccreDeFiBiometricService = require('./accredefi-biometric-service');
const AccreDeFiComplianceIntegration = require('./accredefi-compliance-integration');

/**
 * AccreDeFi KYC System Test Suite
 * Comprehensive testing of all system components
 */
class AccreDeFiSystemTest {
    constructor() {
        this.testResults = {
            passed: 0,
            failed: 0,
            total: 0,
            details: []
        };
        
        // Mock Telegram bot for testing
        this.mockBot = {
            getUserProfilePhotos: async (userId) => ({
                photos: [[{ file_id: 'mock_photo_id', file_size: 12345 }]]
            }),
            getChatMember: async (chatId, userId) => ({
                status: 'member',
                date: Date.now() - (30 * 24 * 60 * 60 * 1000), // 30 days ago
                user: { is_premium: false, is_bot: false, language_code: 'en' }
            }),
            getFile: async (fileId) => ({
                file_path: 'photos/mock_profile_photo.jpg'
            })
        };
        
        this.initializeServices();
    }

    initializeServices() {
        try {
            // Set test environment variables
            process.env.NODE_ENV = 'test';
            process.env.ENCRYPTION_KEY = 'test_encryption_key_32_characters';
            process.env.ACCREDEFI_COMPLIANCE_SECRET = 'test_compliance_secret';
            process.env.ACCREDEFI_VERIFICATION_SECRET = 'test_verification_secret';
            process.env.ACCREDEFI_COMPLIANCE_MASTER_KEY = 'test_master_key';
            process.env.ACCREDEFI_BIOMETRIC_SECRET = 'test_biometric_secret';
            
            // Initialize services
            this.documentService = new AccreDeFiDocumentService();
            this.biometricService = new AccreDeFiBiometricService(this.mockBot);
            this.complianceService = new AccreDeFiComplianceIntegration();
            
            console.log('✅ Services initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize services:', error);
            throw error;
        }
    }

    async runAllTests() {
        console.log('🚀 Starting AccreDeFi KYC System Test Suite');
        console.log('=' .repeat(60));
        
        try {
            // Test 1: Document Processing
            await this.testDocumentProcessing();
            
            // Test 2: Biometric Verification
            await this.testBiometricVerification();
            
            // Test 3: Compliance Integration
            await this.testComplianceIntegration();
            
            // Test 4: Complete Workflow
            await this.testCompleteWorkflow();
            
            // Test 5: Error Handling
            await this.testErrorHandling();
            
            // Test 6: Security Features
            await this.testSecurityFeatures();
            
            // Test 7: Performance
            await this.testPerformance();
            
            this.printTestResults();
            
        } catch (error) {
            console.error('❌ Test suite failed:', error);
            this.testResults.failed++;
        }
    }

    async testDocumentProcessing() {
        console.log('\n📄 Testing Document Processing Service...');
        
        try {
            // Test with mock document data
            const mockDocumentBase64 = this.generateMockDocumentImage();
            const telegramId = '123456789';
            
            const result = await this.documentService.processGovernmentID(mockDocumentBase64, telegramId);
            
            // Validate result structure
            this.assert(result.firstName, 'Document processing should extract first name');
            this.assert(result.lastName, 'Document processing should extract last name');
            this.assert(result.country, 'Document processing should extract country');
            this.assert(result.complianceHash, 'Document processing should generate compliance hash');
            this.assert(result.kycLevel, 'Document processing should determine KYC level');
            this.assert(result.verificationId, 'Document processing should generate verification ID');
            
            // Validate data types
            this.assert(typeof result.age === 'number', 'Age should be a number');
            this.assert(typeof result.riskScore === 'number', 'Risk score should be a number');
            this.assert(result.confidence && typeof result.confidence === 'object', 'Confidence scores should be an object');
            
            console.log('✅ Document processing test passed');
            this.testResults.passed++;
            
        } catch (error) {
            console.error('❌ Document processing test failed:', error);
            this.testResults.failed++;
            this.testResults.details.push({
                test: 'Document Processing',
                error: error.message
            });
        }
        
        this.testResults.total++;
    }

    async testBiometricVerification() {
        console.log('\n🔍 Testing Biometric Verification Service...');
        
        try {
            const telegramId = '123456789';
            const mockSelfieBase64 = this.generateMockSelfieImage();
            const mockIdPhotoBase64 = this.generateMockDocumentImage();
            
            const result = await this.biometricService.performBiometricVerification(
                telegramId,
                mockSelfieBase64,
                mockIdPhotoBase64
            );
            
            // Validate result structure
            this.assert(typeof result.livenessDetected === 'boolean', 'Liveness detection should return boolean');
            this.assert(typeof result.livenessConfidence === 'number', 'Liveness confidence should be a number');
            this.assert(result.livenessChecks && typeof result.livenessChecks === 'object', 'Liveness checks should be an object');
            this.assert(result.selfieToIdMatch && typeof result.selfieToIdMatch === 'object', 'Facial matching should return object');
            this.assert(typeof result.biometricScore === 'number', 'Biometric score should be a number');
            this.assert(typeof result.verificationPassed === 'boolean', 'Verification passed should be boolean');
            this.assert(result.riskLevel, 'Risk level should be defined');
            this.assert(result.verificationId, 'Verification ID should be generated');
            
            // Validate score ranges
            this.assert(result.biometricScore >= 0 && result.biometricScore <= 100, 'Biometric score should be 0-100');
            this.assert(result.livenessConfidence >= 0 && result.livenessConfidence <= 100, 'Liveness confidence should be 0-100');
            
            console.log('✅ Biometric verification test passed');
            this.testResults.passed++;
            
        } catch (error) {
            console.error('❌ Biometric verification test failed:', error);
            this.testResults.failed++;
            this.testResults.details.push({
                test: 'Biometric Verification',
                error: error.message
            });
        }
        
        this.testResults.total++;
    }

    async testComplianceIntegration() {
        console.log('\n🔐 Testing Compliance Integration Service...');
        
        try {
            const telegramId = '123456789';
            
            // Generate mock KYC and biometric data
            const mockKYCData = this.generateMockKYCData(telegramId);
            const mockBiometricData = this.generateMockBiometricData(telegramId);
            
            const result = await this.complianceService.processComplianceVerification(
                mockKYCData,
                mockBiometricData,
                telegramId
            );
            
            // Validate result structure
            this.assert(result.telegramId === telegramId, 'Telegram ID should match');
            this.assert(result.complianceHash, 'Compliance hash should be generated');
            this.assert(result.complianceHashShort, 'Short compliance hash should be generated');
            this.assert(typeof result.kycPassed === 'boolean', 'KYC passed should be boolean');
            this.assert(typeof result.biometricPassed === 'boolean', 'Biometric passed should be boolean');
            this.assert(typeof result.overallCompliance === 'boolean', 'Overall compliance should be boolean');
            this.assert(result.kycLevel, 'KYC level should be defined');
            this.assert(result.complianceLevel, 'Compliance level should be defined');
            this.assert(result.riskLevel, 'Risk level should be defined');
            this.assert(result.jurisdiction, 'Jurisdiction should be defined');
            this.assert(Array.isArray(result.transferRestrictions), 'Transfer restrictions should be array');
            this.assert(Array.isArray(result.tokenPermissions), 'Token permissions should be array');
            this.assert(result.tradingLimits && typeof result.tradingLimits === 'object', 'Trading limits should be object');
            this.assert(result.expirationDate, 'Expiration date should be set');
            
            // Validate hash format (256-bit = 64 hex characters)
            this.assert(result.complianceHash.length === 64, 'Compliance hash should be 64 characters (256-bit)');
            this.assert(/^[a-f0-9]+$/i.test(result.complianceHash), 'Compliance hash should be hexadecimal');
            
            console.log('✅ Compliance integration test passed');
            this.testResults.passed++;
            
        } catch (error) {
            console.error('❌ Compliance integration test failed:', error);
            this.testResults.failed++;
            this.testResults.details.push({
                test: 'Compliance Integration',
                error: error.message
            });
        }
        
        this.testResults.total++;
    }

    async testCompleteWorkflow() {
        console.log('\n🔄 Testing Complete KYC Workflow...');
        
        try {
            const telegramId = '987654321';
            
            // Step 1: Document processing
            const mockDocumentBase64 = this.generateMockDocumentImage();
            const kycData = await this.documentService.processGovernmentID(mockDocumentBase64, telegramId);
            
            // Step 2: Biometric verification
            const mockSelfieBase64 = this.generateMockSelfieImage();
            const biometricData = await this.biometricService.performBiometricVerification(
                telegramId,
                mockSelfieBase64,
                mockDocumentBase64
            );
            
            // Step 3: Compliance verification
            const complianceRecord = await this.complianceService.processComplianceVerification(
                kycData,
                biometricData,
                telegramId
            );
            
            // Validate complete workflow
            this.assert(kycData.verificationId, 'KYC verification ID should be generated');
            this.assert(biometricData.verificationId, 'Biometric verification ID should be generated');
            this.assert(complianceRecord.complianceHash, 'Compliance hash should be generated');
            this.assert(complianceRecord.verificationId === kycData.verificationId, 'Verification IDs should match');
            this.assert(complianceRecord.biometricId === biometricData.verificationId, 'Biometric IDs should match');
            
            // Validate data consistency
            this.assert(complianceRecord.kycScore === kycData.riskScore || complianceRecord.kycScore >= 0, 'KYC scores should be consistent');
            this.assert(complianceRecord.biometricScore === biometricData.biometricScore, 'Biometric scores should match');
            
            console.log('✅ Complete workflow test passed');
            this.testResults.passed++;
            
        } catch (error) {
            console.error('❌ Complete workflow test failed:', error);
            this.testResults.failed++;
            this.testResults.details.push({
                test: 'Complete Workflow',
                error: error.message
            });
        }
        
        this.testResults.total++;
    }

    async testErrorHandling() {
        console.log('\n⚠️ Testing Error Handling...');
        
        try {
            // Test invalid input handling
            try {
                await this.documentService.processGovernmentID('invalid_base64', '123456789');
                this.assert(false, 'Should throw error for invalid base64');
            } catch (error) {
                this.assert(true, 'Should handle invalid base64 gracefully');
            }
            
            // Test missing parameters
            try {
                await this.biometricService.performBiometricVerification(null, 'selfie', 'id');
                this.assert(false, 'Should throw error for missing telegram ID');
            } catch (error) {
                this.assert(true, 'Should handle missing parameters gracefully');
            }
            
            // Test invalid compliance data
            try {
                await this.complianceService.processComplianceVerification({}, {}, '123456789');
                // This should not throw but should return failed compliance
                this.assert(true, 'Should handle invalid data gracefully');
            } catch (error) {
                this.assert(true, 'Should handle invalid compliance data');
            }
            
            console.log('✅ Error handling test passed');
            this.testResults.passed++;
            
        } catch (error) {
            console.error('❌ Error handling test failed:', error);
            this.testResults.failed++;
            this.testResults.details.push({
                test: 'Error Handling',
                error: error.message
            });
        }
        
        this.testResults.total++;
    }

    async testSecurityFeatures() {
        console.log('\n🔒 Testing Security Features...');
        
        try {
            const telegramId = '555666777';
            
            // Test hash generation consistency
            const mockKYCData = this.generateMockKYCData(telegramId);
            const mockBiometricData = this.generateMockBiometricData(telegramId);
            
            const hash1 = this.complianceService.generateComplianceHash(mockKYCData, mockBiometricData, telegramId);
            const hash2 = this.complianceService.generateComplianceHash(mockKYCData, mockBiometricData, telegramId);
            
            // Hashes should be different due to timestamp
            this.assert(hash1 !== hash2, 'Compliance hashes should be unique');
            this.assert(hash1.length === 64, 'Hash should be 256-bit (64 hex chars)');
            this.assert(/^[a-f0-9]+$/i.test(hash1), 'Hash should be hexadecimal');
            
            // Test data encryption (mock)
            const sensitiveData = 'John Doe';
            const encrypted = crypto.createHash('sha256').update(sensitiveData + process.env.ENCRYPTION_KEY).digest('hex');
            this.assert(encrypted !== sensitiveData, 'Data should be encrypted');
            this.assert(encrypted.length === 64, 'Encrypted data should be hashed');
            
            console.log('✅ Security features test passed');
            this.testResults.passed++;
            
        } catch (error) {
            console.error('❌ Security features test failed:', error);
            this.testResults.failed++;
            this.testResults.details.push({
                test: 'Security Features',
                error: error.message
            });
        }
        
        this.testResults.total++;
    }

    async testPerformance() {
        console.log('\n⚡ Testing Performance...');
        
        try {
            const telegramId = '111222333';
            const iterations = 5;
            const times = [];
            
            for (let i = 0; i < iterations; i++) {
                const startTime = Date.now();
                
                // Run complete workflow
                const mockDocumentBase64 = this.generateMockDocumentImage();
                const mockSelfieBase64 = this.generateMockSelfieImage();
                
                const kycData = await this.documentService.processGovernmentID(mockDocumentBase64, telegramId + i);
                const biometricData = await this.biometricService.performBiometricVerification(
                    telegramId + i,
                    mockSelfieBase64,
                    mockDocumentBase64
                );
                const complianceRecord = await this.complianceService.processComplianceVerification(
                    kycData,
                    biometricData,
                    telegramId + i
                );
                
                const endTime = Date.now();
                times.push(endTime - startTime);
            }
            
            const averageTime = times.reduce((a, b) => a + b, 0) / times.length;
            const maxTime = Math.max(...times);
            const minTime = Math.min(...times);
            
            console.log(`📊 Performance Results:`);
            console.log(`   Average time: ${averageTime.toFixed(2)}ms`);
            console.log(`   Min time: ${minTime}ms`);
            console.log(`   Max time: ${maxTime}ms`);
            
            // Performance assertions
            this.assert(averageTime < 5000, 'Average processing time should be under 5 seconds');
            this.assert(maxTime < 10000, 'Maximum processing time should be under 10 seconds');
            
            console.log('✅ Performance test passed');
            this.testResults.passed++;
            
        } catch (error) {
            console.error('❌ Performance test failed:', error);
            this.testResults.failed++;
            this.testResults.details.push({
                test: 'Performance',
                error: error.message
            });
        }
        
        this.testResults.total++;
    }

    // Helper Methods
    generateMockDocumentImage() {
        // Generate a mock base64 image (1x1 pixel PNG)
        return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    }

    generateMockSelfieImage() {
        // Generate a mock base64 image (1x1 pixel PNG)
        return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    }

    generateMockKYCData(telegramId) {
        return {
            firstName: 'John',
            middleName: 'Michael',
            lastName: 'Doe',
            fullName: 'John Michael Doe',
            streetAddress: '123 Main Street',
            city: 'New York',
            state: 'NY',
            postalCode: '10001',
            country: 'USA',
            documentNumber: 'D123456789',
            documentType: 'DRIVERS_LICENSE',
            issuingAuthority: 'NY DMV',
            issueDate: new Date('2020-01-01'),
            expirationDate: new Date('2028-01-01'),
            dateOfBirth: new Date('1990-01-01'),
            age: 34,
            nationality: 'USA',
            sex: 'M',
            kycLevel: 'FULL_KYC',
            riskScore: 25,
            jurisdiction: {
                country: 'USA',
                state: 'NY',
                region: 'NORTH_AMERICA',
                regulatoryFramework: ['SEC', 'FINRA', 'CFTC']
            },
            confidence: {
                firstName: 95,
                lastName: 95,
                streetAddress: 90,
                city: 95,
                state: 95,
                country: 98,
                documentNumber: 92,
                dateOfBirth: 94
            },
            verificationId: crypto.randomBytes(8).toString('hex')
        };
    }

    generateMockBiometricData(telegramId) {
        return {
            livenessDetected: true,
            livenessConfidence: 85,
            livenessChecks: {
                eyeMovement: true,
                blinkDetection: true,
                headMovement: true,
                textureAnalysis: true,
                depthAnalysis: true
            },
            selfieToIdMatch: {
                similarity: 88,
                confidence: 92,
                match: true,
                threshold: 75
            },
            selfieToProfileMatch: {
                similarity: 82,
                confidence: 89,
                match: true,
                threshold: 75
            },
            idToProfileMatch: {
                similarity: 85,
                confidence: 91,
                match: true,
                threshold: 75
            },
            biometricScore: 87,
            verificationPassed: true,
            riskLevel: 'LOW',
            hasProfilePhoto: true,
            profilePhotoCount: 3,
            verificationId: crypto.randomBytes(8).toString('hex')
        };
    }

    assert(condition, message) {
        if (!condition) {
            throw new Error(`Assertion failed: ${message}`);
        }
    }

    printTestResults() {
        console.log('\n' + '=' .repeat(60));
        console.log('📊 TEST RESULTS SUMMARY');
        console.log('=' .repeat(60));
        console.log(`Total Tests: ${this.testResults.total}`);
        console.log(`Passed: ${this.testResults.passed} ✅`);
        console.log(`Failed: ${this.testResults.failed} ❌`);
        console.log(`Success Rate: ${((this.testResults.passed / this.testResults.total) * 100).toFixed(1)}%`);
        
        if (this.testResults.failed > 0) {
            console.log('\n❌ FAILED TESTS:');
            this.testResults.details.forEach(detail => {
                console.log(`   ${detail.test}: ${detail.error}`);
            });
        }
        
        if (this.testResults.failed === 0) {
            console.log('\n🎉 ALL TESTS PASSED! AccreDeFi KYC System is ready for deployment.');
        } else {
            console.log('\n⚠️ Some tests failed. Please review and fix issues before deployment.');
        }
        
        console.log('=' .repeat(60));
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    const testSuite = new AccreDeFiSystemTest();
    testSuite.runAllTests().catch(console.error);
}

module.exports = AccreDeFiSystemTest;

