// SPDX-License-Identifier: BUSL-1.1
// License-Filename: LICENSE.md

import express from 'express';
import { Address } from '@ton/ton';
import { logger } from '../utils/logger';

const router = express.Router();

// Middleware for address validation
const validateAddress = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const { address } = req.params;
    try {
        Address.parse(address);
        next();
    } catch (error) {
        res.status(400).json({ error: 'Invalid TON address format' });
    }
};

// Middleware for authentication
const authenticate = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
};

/**
 * GET /api/reputation-marketplace/benefits
 * Get all available reputation benefits
 */
router.get('/benefits', async (req, res) => {
    try {
        const { level, active = 'true' } = req.query;
        
        // Mock benefits data
        const allBenefits = [
            {
                benefitId: 'TRADING_DISCOUNT_SILVER',
                name: 'Silver Trading Discount',
                description: '5% discount on trading fees',
                requiredLevel: 'SILVER',
                requiredScore: 200,
                costInPoints: 0,
                benefitType: 'DISCOUNT',
                value: 5,
                isActive: true,
                usageLimit: 0,
                validUntil: 0,
                category: 'Trading'
            },
            {
                benefitId: 'TRADING_DISCOUNT_GOLD',
                name: 'Gold Trading Discount',
                description: '10% discount on trading fees',
                requiredLevel: 'GOLD',
                requiredScore: 400,
                costInPoints: 0,
                benefitType: 'DISCOUNT',
                value: 10,
                isActive: true,
                usageLimit: 0,
                validUntil: 0,
                category: 'Trading'
            },
            {
                benefitId: 'TRADING_DISCOUNT_PLATINUM',
                name: 'Platinum Trading Discount',
                description: '15% discount on trading fees',
                requiredLevel: 'PLATINUM',
                requiredScore: 700,
                costInPoints: 0,
                benefitType: 'DISCOUNT',
                value: 15,
                isActive: true,
                usageLimit: 0,
                validUntil: 0,
                category: 'Trading'
            },
            {
                benefitId: 'TRADING_DISCOUNT_DIAMOND',
                name: 'Diamond Trading Discount',
                description: '20% discount on trading fees',
                requiredLevel: 'DIAMOND',
                requiredScore: 900,
                costInPoints: 0,
                benefitType: 'DISCOUNT',
                value: 20,
                isActive: true,
                usageLimit: 0,
                validUntil: 0,
                category: 'Trading'
            },
            {
                benefitId: 'PRIORITY_SUPPORT',
                name: 'Priority Customer Support',
                description: 'Priority access to customer support',
                requiredLevel: 'GOLD',
                requiredScore: 400,
                costInPoints: 0,
                benefitType: 'ACCESS',
                value: 1,
                isActive: true,
                usageLimit: 0,
                validUntil: 0,
                category: 'Support'
            },
            {
                benefitId: 'EARLY_ACCESS',
                name: 'Early Feature Access',
                description: 'Early access to new features and products',
                requiredLevel: 'PLATINUM',
                requiredScore: 700,
                costInPoints: 0,
                benefitType: 'ACCESS',
                value: 1,
                isActive: true,
                usageLimit: 0,
                validUntil: 0,
                category: 'Features'
            },
            {
                benefitId: 'VIP_ACCESS',
                name: 'VIP Program Access',
                description: 'Access to exclusive VIP program',
                requiredLevel: 'DIAMOND',
                requiredScore: 900,
                costInPoints: 0,
                benefitType: 'PRIVILEGE',
                value: 1,
                isActive: true,
                usageLimit: 0,
                validUntil: 0,
                category: 'VIP'
            },
            {
                benefitId: 'REDUCED_FEES',
                name: 'Reduced Platform Fees',
                description: 'Reduced fees for platform services',
                requiredLevel: 'SILVER',
                requiredScore: 200,
                costInPoints: 100,
                benefitType: 'DISCOUNT',
                value: 25,
                isActive: true,
                usageLimit: 10,
                validUntil: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
                category: 'Fees'
            }
        ];

        let filteredBenefits = allBenefits;

        // Filter by level if specified
        if (level) {
            filteredBenefits = filteredBenefits.filter(benefit => benefit.requiredLevel === level);
        }

        // Filter by active status
        if (active === 'true') {
            filteredBenefits = filteredBenefits.filter(benefit => benefit.isActive);
        }

        res.json({
            success: true,
            data: {
                benefits: filteredBenefits,
                totalCount: filteredBenefits.length,
                categories: [...new Set(filteredBenefits.map(b => b.category))]
            }
        });

    } catch (error) {
        logger.error('Error fetching benefits:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/reputation-marketplace/rewards
 * Get all available reputation rewards
 */
router.get('/rewards', async (req, res) => {
    try {
        const { actionType, active = 'true' } = req.query;
        
        // Mock rewards data
        const allRewards = [
            {
                rewardId: 'TRANSACTION_MILESTONE_10',
                name: 'First 10 Transactions',
                description: 'Reward for completing first 10 transactions',
                rewardType: 'TOKEN',
                value: 100,
                requiredActions: 10,
                actionType: 'TRANSACTION',
                isActive: true,
                totalClaimed: 1250,
                maxClaims: 0,
                category: 'Milestones'
            },
            {
                rewardId: 'TRANSACTION_MILESTONE_100',
                name: '100 Transactions Milestone',
                description: 'Reward for completing 100 transactions',
                rewardType: 'TOKEN',
                value: 500,
                requiredActions: 100,
                actionType: 'TRANSACTION',
                isActive: true,
                totalClaimed: 450,
                maxClaims: 0,
                category: 'Milestones'
            },
            {
                rewardId: 'TRANSACTION_MILESTONE_1000',
                name: '1000 Transactions Milestone',
                description: 'Reward for completing 1000 transactions',
                rewardType: 'TOKEN',
                value: 2500,
                requiredActions: 1000,
                actionType: 'TRANSACTION',
                isActive: true,
                totalClaimed: 85,
                maxClaims: 0,
                category: 'Milestones'
            },
            {
                rewardId: 'COMPLIANCE_STREAK_30',
                name: '30-Day Compliance Streak',
                description: 'Reward for 30 days without compliance violations',
                rewardType: 'TOKEN',
                value: 200,
                requiredActions: 30,
                actionType: 'COMPLIANCE_CHECK',
                isActive: true,
                totalClaimed: 320,
                maxClaims: 0,
                category: 'Compliance'
            },
            {
                rewardId: 'COMPLIANCE_STREAK_90',
                name: '90-Day Compliance Streak',
                description: 'Reward for 90 days without compliance violations',
                rewardType: 'TOKEN',
                value: 750,
                requiredActions: 90,
                actionType: 'COMPLIANCE_CHECK',
                isActive: true,
                totalClaimed: 125,
                maxClaims: 0,
                category: 'Compliance'
            },
            {
                rewardId: 'REFERRAL_MILESTONE_5',
                name: '5 Successful Referrals',
                description: 'Reward for 5 successful referrals',
                rewardType: 'TOKEN',
                value: 300,
                requiredActions: 5,
                actionType: 'REFERRAL',
                isActive: true,
                totalClaimed: 180,
                maxClaims: 0,
                category: 'Referrals'
            },
            {
                rewardId: 'REFERRAL_MILESTONE_25',
                name: '25 Successful Referrals',
                description: 'Reward for 25 successful referrals',
                rewardType: 'TOKEN',
                value: 1500,
                requiredActions: 25,
                actionType: 'REFERRAL',
                isActive: true,
                totalClaimed: 45,
                maxClaims: 0,
                category: 'Referrals'
            },
            {
                rewardId: 'STAKING_MILESTONE_1M',
                name: 'First Million Staked',
                description: 'Reward for staking 1 million tokens',
                rewardType: 'TOKEN',
                value: 1000,
                requiredActions: 1,
                actionType: 'STAKING',
                isActive: true,
                totalClaimed: 95,
                maxClaims: 0,
                category: 'Staking'
            }
        ];

        let filteredRewards = allRewards;

        // Filter by action type if specified
        if (actionType) {
            filteredRewards = filteredRewards.filter(reward => reward.actionType === actionType);
        }

        // Filter by active status
        if (active === 'true') {
            filteredRewards = filteredRewards.filter(reward => reward.isActive);
        }

        res.json({
            success: true,
            data: {
                rewards: filteredRewards,
                totalCount: filteredRewards.length,
                categories: [...new Set(filteredRewards.map(r => r.category))],
                actionTypes: [...new Set(filteredRewards.map(r => r.actionType))]
            }
        });

    } catch (error) {
        logger.error('Error fetching rewards:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/reputation-marketplace/:address/benefits
 * Get user's eligible benefits and usage history
 */
router.get('/:address/benefits', validateAddress, async (req, res) => {
    try {
        const { address } = req.params;
        
        // Mock user data
        const userLevel = 'GOLD';
        const userScore = 520;
        
        // Mock user benefit usage
        const benefitUsage = [
            {
                benefitId: 'TRADING_DISCOUNT_SILVER',
                usageCount: 15,
                lastUsed: Date.now() - 86400000,
                totalSaved: 125.50
            },
            {
                benefitId: 'TRADING_DISCOUNT_GOLD',
                usageCount: 8,
                lastUsed: Date.now() - 3600000,
                totalSaved: 89.25
            },
            {
                benefitId: 'PRIORITY_SUPPORT',
                usageCount: 3,
                lastUsed: Date.now() - 172800000,
                totalSaved: 0
            }
        ];

        // Mock eligible benefits
        const eligibleBenefits = [
            {
                benefitId: 'TRADING_DISCOUNT_GOLD',
                name: 'Gold Trading Discount',
                description: '10% discount on trading fees',
                value: 10,
                eligible: true,
                used: true,
                usageCount: 8,
                totalSaved: 89.25
            },
            {
                benefitId: 'PRIORITY_SUPPORT',
                name: 'Priority Customer Support',
                description: 'Priority access to customer support',
                eligible: true,
                used: true,
                usageCount: 3
            },
            {
                benefitId: 'TRADING_DISCOUNT_PLATINUM',
                name: 'Platinum Trading Discount',
                description: '15% discount on trading fees',
                value: 15,
                eligible: false,
                requiredScore: 700,
                pointsNeeded: 180
            }
        ];

        res.json({
            success: true,
            data: {
                userAddress: address,
                userLevel,
                userScore,
                eligibleBenefits,
                benefitUsage,
                totalSaved: benefitUsage.reduce((sum, usage) => sum + usage.totalSaved, 0)
            }
        });

    } catch (error) {
        logger.error('Error fetching user benefits:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/reputation-marketplace/:address/rewards
 * Get user's reward progress and claimed rewards
 */
router.get('/:address/rewards', validateAddress, async (req, res) => {
    try {
        const { address } = req.params;
        
        // Mock user reward progress
        const rewardProgress = [
            {
                rewardId: 'TRANSACTION_MILESTONE_10',
                name: 'First 10 Transactions',
                currentProgress: 10,
                requiredActions: 10,
                completed: true,
                claimed: true,
                claimedAt: Date.now() - 86400000 * 5,
                value: 100
            },
            {
                rewardId: 'TRANSACTION_MILESTONE_100',
                name: '100 Transactions Milestone',
                currentProgress: 67,
                requiredActions: 100,
                completed: false,
                claimed: false,
                progressPercentage: 67
            },
            {
                rewardId: 'COMPLIANCE_STREAK_30',
                name: '30-Day Compliance Streak',
                currentProgress: 22,
                requiredActions: 30,
                completed: false,
                claimed: false,
                progressPercentage: 73
            },
            {
                rewardId: 'REFERRAL_MILESTONE_5',
                name: '5 Successful Referrals',
                currentProgress: 3,
                requiredActions: 5,
                completed: false,
                claimed: false,
                progressPercentage: 60
            }
        ];

        const claimedRewards = rewardProgress.filter(r => r.claimed);
        const availableRewards = rewardProgress.filter(r => r.completed && !r.claimed);
        const inProgressRewards = rewardProgress.filter(r => !r.completed);

        res.json({
            success: true,
            data: {
                userAddress: address,
                rewardProgress,
                claimedRewards,
                availableRewards,
                inProgressRewards,
                totalClaimed: claimedRewards.reduce((sum, reward) => sum + (reward.value || 0), 0),
                totalAvailable: availableRewards.length
            }
        });

    } catch (error) {
        logger.error('Error fetching user rewards:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/reputation-marketplace/:address/claim-benefit
 * Claim a reputation benefit
 */
router.post('/:address/claim-benefit', validateAddress, authenticate, async (req, res) => {
    try {
        const { address } = req.params;
        const { benefitId, amount } = req.body;

        if (!benefitId) {
            return res.status(400).json({ error: 'Benefit ID is required' });
        }

        // Mock benefit validation and claiming
        const benefit = {
            benefitId: 'TRADING_DISCOUNT_GOLD',
            name: 'Gold Trading Discount',
            value: 10,
            benefitType: 'DISCOUNT'
        };

        const claimResult = {
            userAddress: address,
            benefitId,
            benefitName: benefit.name,
            appliedAmount: amount || 0,
            discountValue: amount ? (amount * benefit.value) / 100 : benefit.value,
            timestamp: new Date().toISOString(),
            transactionId: `claim_${Date.now()}`
        };

        logger.info(`Benefit claimed:`, claimResult);

        res.json({
            success: true,
            data: claimResult
        });

    } catch (error) {
        logger.error('Error claiming benefit:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/reputation-marketplace/:address/claim-reward
 * Claim a completed reward
 */
router.post('/:address/claim-reward', validateAddress, authenticate, async (req, res) => {
    try {
        const { address } = req.params;
        const { rewardId } = req.body;

        if (!rewardId) {
            return res.status(400).json({ error: 'Reward ID is required' });
        }

        // Mock reward validation and claiming
        const reward = {
            rewardId: 'TRANSACTION_MILESTONE_10',
            name: 'First 10 Transactions',
            value: 100,
            rewardType: 'TOKEN'
        };

        const claimResult = {
            userAddress: address,
            rewardId,
            rewardName: reward.name,
            rewardType: reward.rewardType,
            value: reward.value,
            timestamp: new Date().toISOString(),
            transactionId: `reward_${Date.now()}`
        };

        logger.info(`Reward claimed:`, claimResult);

        res.json({
            success: true,
            data: claimResult
        });

    } catch (error) {
        logger.error('Error claiming reward:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/reputation-marketplace/record-action
 * Record user action for reward progress
 */
router.post('/record-action', authenticate, async (req, res) => {
    try {
        const { userAddress, actionType, count = 1 } = req.body;

        if (!userAddress || !actionType) {
            return res.status(400).json({ error: 'User address and action type are required' });
        }

        // Validate user address
        try {
            Address.parse(userAddress);
        } catch {
            return res.status(400).json({ error: 'Invalid user address format' });
        }

        // Mock action recording
        const actionResult = {
            userAddress,
            actionType,
            count,
            timestamp: new Date().toISOString(),
            affectedRewards: [] as string[]
        };

        // Mock affected rewards based on action type
        if (actionType === 'TRANSACTION') {
            actionResult.affectedRewards = ['TRANSACTION_MILESTONE_10', 'TRANSACTION_MILESTONE_100'];
        } else if (actionType === 'COMPLIANCE_CHECK') {
            actionResult.affectedRewards = ['COMPLIANCE_STREAK_30', 'COMPLIANCE_STREAK_90'];
        } else if (actionType === 'REFERRAL') {
            actionResult.affectedRewards = ['REFERRAL_MILESTONE_5', 'REFERRAL_MILESTONE_25'];
        }

        logger.info(`Action recorded:`, actionResult);

        res.json({
            success: true,
            data: actionResult
        });

    } catch (error) {
        logger.error('Error recording action:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/reputation-marketplace/analytics
 * Get marketplace analytics and statistics
 */
router.get('/analytics', async (req, res) => {
    try {
        const analytics = {
            totalBenefits: 8,
            activeBenefits: 8,
            totalRewards: 8,
            activeRewards: 8,
            totalBenefitClaims: 2450,
            totalRewardClaims: 1875,
            totalValueDistributed: 125000,
            topBenefits: [
                { benefitId: 'TRADING_DISCOUNT_GOLD', claims: 850, value: 12500 },
                { benefitId: 'TRADING_DISCOUNT_SILVER', claims: 720, value: 8900 },
                { benefitId: 'PRIORITY_SUPPORT', claims: 450, value: 0 }
            ],
            topRewards: [
                { rewardId: 'TRANSACTION_MILESTONE_10', claims: 1250, value: 125000 },
                { rewardId: 'COMPLIANCE_STREAK_30', claims: 320, value: 64000 },
                { rewardId: 'REFERRAL_MILESTONE_5', claims: 180, value: 54000 }
            ],
            userEngagement: {
                activeBenefitUsers: 1850,
                activeRewardUsers: 1650,
                averageBenefitsPerUser: 2.3,
                averageRewardsPerUser: 1.8
            },
            trends: {
                benefitClaimsGrowth: 15.2, // percentage
                rewardClaimsGrowth: 22.8,
                newUserEngagement: 68.5
            }
        };

        res.json({
            success: true,
            data: analytics
        });

    } catch (error) {
        logger.error('Error fetching analytics:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;

