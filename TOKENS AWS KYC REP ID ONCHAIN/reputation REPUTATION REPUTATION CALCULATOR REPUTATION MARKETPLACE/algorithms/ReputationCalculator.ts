// SPDX-License-Identifier: BUSL-1.1
// License-Filename: LICENSE.md

import { Address } from '@ton/ton';

// Reputation Calculator Service
// Advanced scoring algorithms for AccreDeFi reputation system

export interface ReputationMetrics {
    transactionVolume: number;
    transactionFrequency: number;
    complianceScore: number;
    violationCount: number;
    stakingAmount: number;
    referralCount: number;
    platformAge: number;
    diversityScore: number;
    consistencyScore: number;
    communityEngagement: number;
}

export interface ScoringWeights {
    transaction: number;
    compliance: number;
    activity: number;
    staking: number;
    referral: number;
    consistency: number;
    diversity: number;
    community: number;
}

export interface ReputationScore {
    baseScore: number;
    complianceScore: number;
    activityScore: number;
    totalScore: number;
    level: string;
    percentile: number;
    trend: 'INCREASING' | 'STABLE' | 'DECREASING';
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface ScoreBreakdown {
    transactionComponent: number;
    complianceComponent: number;
    activityComponent: number;
    stakingBonus: number;
    referralBonus: number;
    consistencyBonus: number;
    diversityBonus: number;
    communityBonus: number;
    penalties: number;
    totalAdjustments: number;
}

export class ReputationCalculator {
    private defaultWeights: ScoringWeights = {
        transaction: 25,
        compliance: 35,
        activity: 15,
        staking: 10,
        referral: 5,
        consistency: 5,
        diversity: 3,
        community: 2
    };

    private levelThresholds = {
        BRONZE: 0,
        SILVER: 200,
        GOLD: 400,
        PLATINUM: 700,
        DIAMOND: 900
    };

    constructor(private customWeights?: Partial<ScoringWeights>) {
        if (customWeights) {
            this.defaultWeights = { ...this.defaultWeights, ...customWeights };
        }
    }

    /**
     * Calculate comprehensive reputation score
     */
    calculateReputationScore(
        userAddress: string,
        metrics: ReputationMetrics,
        historicalScores: number[] = []
    ): ReputationScore {
        const breakdown = this.calculateScoreBreakdown(metrics);
        
        // Calculate base components
        const baseScore = this.calculateBaseScore(metrics);
        const complianceScore = this.calculateComplianceScore(metrics);
        const activityScore = this.calculateActivityScore(metrics);
        
        // Apply bonuses and penalties
        const totalScore = Math.max(0, Math.min(1000, 
            baseScore + breakdown.totalAdjustments
        ));
        
        // Determine level and additional metrics
        const level = this.getReputationLevel(totalScore);
        const percentile = this.calculatePercentile(totalScore);
        const trend = this.calculateTrend(historicalScores);
        const riskLevel = this.assessRiskLevel(metrics, totalScore);

        return {
            baseScore,
            complianceScore,
            activityScore,
            totalScore,
            level,
            percentile,
            trend,
            riskLevel
        };
    }

    /**
     * Calculate detailed score breakdown
     */
    calculateScoreBreakdown(metrics: ReputationMetrics): ScoreBreakdown {
        const transactionComponent = this.calculateTransactionScore(metrics);
        const complianceComponent = this.calculateComplianceScore(metrics);
        const activityComponent = this.calculateActivityScore(metrics);
        
        // Bonus calculations
        const stakingBonus = this.calculateStakingBonus(metrics.stakingAmount);
        const referralBonus = this.calculateReferralBonus(metrics.referralCount);
        const consistencyBonus = this.calculateConsistencyBonus(metrics.consistencyScore);
        const diversityBonus = this.calculateDiversityBonus(metrics.diversityScore);
        const communityBonus = this.calculateCommunityBonus(metrics.communityEngagement);
        
        // Penalty calculations
        const penalties = this.calculatePenalties(metrics);
        
        const totalAdjustments = stakingBonus + referralBonus + consistencyBonus + 
                               diversityBonus + communityBonus - penalties;

        return {
            transactionComponent,
            complianceComponent,
            activityComponent,
            stakingBonus,
            referralBonus,
            consistencyBonus,
            diversityBonus,
            communityBonus,
            penalties,
            totalAdjustments
        };
    }

    /**
     * Calculate base transaction score
     */
    private calculateBaseScore(metrics: ReputationMetrics): number {
        const transactionScore = this.calculateTransactionScore(metrics);
        const complianceScore = this.calculateComplianceScore(metrics);
        const activityScore = this.calculateActivityScore(metrics);
        
        return Math.round(
            (transactionScore * this.defaultWeights.transaction +
             complianceScore * this.defaultWeights.compliance +
             activityScore * this.defaultWeights.activity) / 100
        );
    }

    /**
     * Calculate transaction-based score component
     */
    private calculateTransactionScore(metrics: ReputationMetrics): number {
        // Volume score (0-400 points)
        const volumeScore = Math.min(400, Math.log10(metrics.transactionVolume + 1) * 50);
        
        // Frequency score (0-300 points)
        const frequencyScore = Math.min(300, metrics.transactionFrequency * 10);
        
        // Platform age bonus (0-100 points)
        const ageBonus = Math.min(100, metrics.platformAge * 2);
        
        return Math.round(volumeScore + frequencyScore + ageBonus);
    }

    /**
     * Calculate compliance score component
     */
    private calculateComplianceScore(metrics: ReputationMetrics): number {
        // Base compliance score (0-800 points)
        let score = metrics.complianceScore * 8;
        
        // Violation penalty
        const violationPenalty = metrics.violationCount * 50;
        score = Math.max(0, score - violationPenalty);
        
        // Perfect compliance bonus
        if (metrics.violationCount === 0 && metrics.complianceScore > 90) {
            score += 100;
        }
        
        return Math.round(Math.min(1000, score));
    }

    /**
     * Calculate activity score component
     */
    private calculateActivityScore(metrics: ReputationMetrics): number {
        // Diversity score (0-300 points)
        const diversityScore = metrics.diversityScore * 3;
        
        // Consistency score (0-400 points)
        const consistencyScore = metrics.consistencyScore * 4;
        
        // Community engagement (0-300 points)
        const communityScore = metrics.communityEngagement * 3;
        
        return Math.round(diversityScore + consistencyScore + communityScore);
    }

    /**
     * Calculate staking bonus
     */
    private calculateStakingBonus(stakingAmount: number): number {
        // Logarithmic scaling for staking bonus (0-100 points)
        if (stakingAmount <= 0) return 0;
        return Math.min(100, Math.log10(stakingAmount / 1000000000) * 20); // Assuming nanotons
    }

    /**
     * Calculate referral bonus
     */
    private calculateReferralBonus(referralCount: number): number {
        // Diminishing returns for referrals (0-75 points)
        return Math.min(75, referralCount * 10 - Math.pow(referralCount, 1.5));
    }

    /**
     * Calculate consistency bonus
     */
    private calculateConsistencyBonus(consistencyScore: number): number {
        // Linear scaling for consistency (0-50 points)
        return Math.round(consistencyScore * 0.5);
    }

    /**
     * Calculate diversity bonus
     */
    private calculateDiversityBonus(diversityScore: number): number {
        // Linear scaling for diversity (0-30 points)
        return Math.round(diversityScore * 0.3);
    }

    /**
     * Calculate community engagement bonus
     */
    private calculateCommunityBonus(communityEngagement: number): number {
        // Linear scaling for community engagement (0-20 points)
        return Math.round(communityEngagement * 0.2);
    }

    /**
     * Calculate penalties
     */
    private calculatePenalties(metrics: ReputationMetrics): number {
        let penalties = 0;
        
        // Violation penalties
        penalties += metrics.violationCount * 25;
        
        // Inactivity penalty (if very low activity)
        if (metrics.transactionFrequency < 1) {
            penalties += 20;
        }
        
        // Risk-based penalties
        if (metrics.complianceScore < 50) {
            penalties += 50;
        }
        
        return penalties;
    }

    /**
     * Determine reputation level based on score
     */
    private getReputationLevel(score: number): string {
        if (score >= this.levelThresholds.DIAMOND) return 'DIAMOND';
        if (score >= this.levelThresholds.PLATINUM) return 'PLATINUM';
        if (score >= this.levelThresholds.GOLD) return 'GOLD';
        if (score >= this.levelThresholds.SILVER) return 'SILVER';
        return 'BRONZE';
    }

    /**
     * Calculate percentile ranking
     */
    private calculatePercentile(score: number): number {
        // Simplified percentile calculation
        // In production, this would compare against actual user distribution
        return Math.min(99, Math.round((score / 1000) * 100));
    }

    /**
     * Calculate score trend
     */
    private calculateTrend(historicalScores: number[]): 'INCREASING' | 'STABLE' | 'DECREASING' {
        if (historicalScores.length < 2) return 'STABLE';
        
        const recent = historicalScores.slice(-5); // Last 5 scores
        const trend = recent[recent.length - 1] - recent[0];
        
        if (trend > 10) return 'INCREASING';
        if (trend < -10) return 'DECREASING';
        return 'STABLE';
    }

    /**
     * Assess risk level
     */
    private assessRiskLevel(metrics: ReputationMetrics, totalScore: number): 'LOW' | 'MEDIUM' | 'HIGH' {
        let riskFactors = 0;
        
        // High violation count
        if (metrics.violationCount > 3) riskFactors++;
        
        // Low compliance score
        if (metrics.complianceScore < 70) riskFactors++;
        
        // Very low activity
        if (metrics.transactionFrequency < 0.5) riskFactors++;
        
        // Low total score
        if (totalScore < 300) riskFactors++;
        
        if (riskFactors >= 3) return 'HIGH';
        if (riskFactors >= 1) return 'MEDIUM';
        return 'LOW';
    }

    /**
     * Calculate reputation decay for inactive users
     */
    calculateDecay(currentScore: number, daysSinceLastActivity: number): number {
        if (daysSinceLastActivity <= 0) return currentScore;
        
        // Exponential decay with different rates for different score ranges
        let decayRate = 0.01; // 1% per day for high scores
        
        if (currentScore < 200) decayRate = 0.005; // 0.5% per day for low scores
        else if (currentScore < 500) decayRate = 0.0075; // 0.75% per day for medium scores
        
        const decayFactor = Math.pow(1 - decayRate, daysSinceLastActivity);
        return Math.round(currentScore * decayFactor);
    }

    /**
     * Calculate reputation recovery rate
     */
    calculateRecoveryMultiplier(currentScore: number, violationCount: number): number {
        // Users with lower scores recover faster
        let baseMultiplier = 1.0;
        
        if (currentScore < 200) baseMultiplier = 1.5;
        else if (currentScore < 400) baseMultiplier = 1.25;
        
        // Penalty for violations
        const violationPenalty = Math.min(0.5, violationCount * 0.1);
        
        return Math.max(0.5, baseMultiplier - violationPenalty);
    }

    /**
     * Predict future score based on current trajectory
     */
    predictFutureScore(
        currentScore: number,
        historicalScores: number[],
        daysAhead: number
    ): number {
        if (historicalScores.length < 3) return currentScore;
        
        // Simple linear regression for trend prediction
        const recentScores = historicalScores.slice(-10);
        const trend = this.calculateLinearTrend(recentScores);
        
        const predictedScore = currentScore + (trend * daysAhead);
        return Math.max(0, Math.min(1000, Math.round(predictedScore)));
    }

    /**
     * Calculate linear trend from historical data
     */
    private calculateLinearTrend(scores: number[]): number {
        if (scores.length < 2) return 0;
        
        const n = scores.length;
        const sumX = (n * (n - 1)) / 2; // Sum of indices
        const sumY = scores.reduce((sum, score) => sum + score, 0);
        const sumXY = scores.reduce((sum, score, index) => sum + (score * index), 0);
        const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6; // Sum of squared indices
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        return slope;
    }

    /**
     * Generate reputation insights and recommendations
     */
    generateInsights(
        metrics: ReputationMetrics,
        score: ReputationScore,
        breakdown: ScoreBreakdown
    ): string[] {
        const insights: string[] = [];
        
        // Score-based insights
        if (score.totalScore < 200) {
            insights.push("Focus on completing more transactions to improve your base score");
        }
        
        if (metrics.violationCount > 0) {
            insights.push("Maintain compliance to avoid score penalties");
        }
        
        if (metrics.stakingAmount === 0) {
            insights.push("Consider staking tokens to earn reputation bonuses");
        }
        
        if (metrics.referralCount < 3) {
            insights.push("Refer new users to earn referral bonuses");
        }
        
        if (breakdown.consistencyBonus < 25) {
            insights.push("Maintain regular platform activity for consistency bonuses");
        }
        
        // Level-specific insights
        if (score.level === 'BRONZE') {
            insights.push("Complete KYC verification and make regular transactions to reach Silver level");
        } else if (score.level === 'SILVER') {
            insights.push("Increase transaction volume and maintain compliance to reach Gold level");
        } else if (score.level === 'GOLD') {
            insights.push("Engage with community features and stake tokens to reach Platinum level");
        }
        
        return insights;
    }

    /**
     * Calculate reputation multiplier for benefits
     */
    getReputationMultiplier(level: string): number {
        const multipliers = {
            BRONZE: 1.0,
            SILVER: 1.1,
            GOLD: 1.2,
            PLATINUM: 1.3,
            DIAMOND: 1.5
        };
        
        return multipliers[level as keyof typeof multipliers] || 1.0;
    }

    /**
     * Validate reputation metrics
     */
    validateMetrics(metrics: ReputationMetrics): boolean {
        return (
            metrics.transactionVolume >= 0 &&
            metrics.transactionFrequency >= 0 &&
            metrics.complianceScore >= 0 && metrics.complianceScore <= 100 &&
            metrics.violationCount >= 0 &&
            metrics.stakingAmount >= 0 &&
            metrics.referralCount >= 0 &&
            metrics.platformAge >= 0 &&
            metrics.diversityScore >= 0 && metrics.diversityScore <= 100 &&
            metrics.consistencyScore >= 0 && metrics.consistencyScore <= 100 &&
            metrics.communityEngagement >= 0 && metrics.communityEngagement <= 100
        );
    }
}

