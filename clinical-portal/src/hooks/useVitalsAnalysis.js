/**
 * ML-Grade Vitals Analysis Engine
 * 
 * Features:
 * - Z-Score Anomaly Detection
 * - EWMA (Exponential Weighted Moving Average)
 * - Linear Regression with R² Confidence
 * - Multi-Variate Weighted Risk Scoring
 * - Explainability Output
 */

// ============================================
// CONFIGURATION
// ============================================

const GATES = {
    MIN_FOR_STATS: 3,
    MIN_FOR_PREDICTION: 5
};

const MAX_CONTRIBUTION_PER_VITAL = 35;

const VITAL_CONFIG = {
    spo2: {
        min: 70, max: 100,
        ideal: [95, 100],
        weight: 0.30,
        label: 'SpO₂',
        criticalDirection: 'decreasing' // Bad when decreasing
    },
    heart_rate: {
        min: 40, max: 180,
        ideal: [60, 100],
        weight: 0.25,
        label: 'Heart Rate',
        criticalDirection: 'increasing'
    },
    respiratory_rate: {
        min: 8, max: 40,
        ideal: [12, 20],
        weight: 0.20,
        label: 'Resp. Rate',
        criticalDirection: 'increasing'
    },
    bp_systolic: {
        min: 70, max: 200,
        ideal: [90, 140],
        weight: 0.10,
        label: 'BP Systolic',
        criticalDirection: 'both'
    },
    bp_diastolic: {
        min: 40, max: 130,
        ideal: [60, 90],
        weight: 0.05,
        label: 'BP Diastolic',
        criticalDirection: 'both'
    },
    temperature: {
        min: 34.0, max: 42.0,
        ideal: [36.1, 37.2],
        weight: 0.10,
        label: 'Temperature',
        criticalDirection: 'increasing'
    }
};

// ============================================
// STATISTICAL HELPERS
// ============================================

/**
 * Linear Regression with R² (coefficient of determination)
 */
function linearRegression(values) {
    const n = values.length;
    if (n < 2) return { slope: 0, intercept: values[0] || 0, rSquared: 0 };

    const xMean = (n - 1) / 2;
    const yMean = values.reduce((a, b) => a + b, 0) / n;

    let ssXY = 0, ssXX = 0, ssYY = 0;
    for (let i = 0; i < n; i++) {
        ssXY += (i - xMean) * (values[i] - yMean);
        ssXX += (i - xMean) ** 2;
        ssYY += (values[i] - yMean) ** 2;
    }

    const slope = ssXX ? ssXY / ssXX : 0;
    const intercept = yMean - slope * xMean;
    const rSquared = ssYY && ssXX ? Math.pow(ssXY, 2) / (ssXX * ssYY) : 0;

    return { slope, intercept, rSquared };
}

/**
 * Exponential Weighted Moving Average
 */
function calculateEWMA(values, alpha = 0.3) {
    if (values.length === 0) return 0;
    let ewma = values[0];
    for (let i = 1; i < values.length; i++) {
        ewma = alpha * values[i] + (1 - alpha) * ewma;
    }
    return ewma;
}

/**
 * Z-Score calculation for anomaly detection
 */
function calculateZScore(value, history) {
    if (history.length < 2) return 0;
    const mean = history.reduce((a, b) => a + b, 0) / history.length;
    const variance = history.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / history.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev === 0) return 0;
    return (value - mean) / stdDev;
}

// ============================================
// RISK SCORE CALCULATION
// ============================================

function calculateDeviationScore(value, vitalKey) {
    const config = VITAL_CONFIG[vitalKey];
    if (!config || value == null) return 0;

    const [idealLow, idealHigh] = config.ideal;

    // Within ideal range = 0 deviation
    if (value >= idealLow && value <= idealHigh) return 0;

    let deviation = 0;
    if (value < idealLow) {
        deviation = (idealLow - value) / (idealLow - config.min);
    } else {
        deviation = (value - idealHigh) / (config.max - idealHigh);
    }

    // Clamp deviation to 0-1
    deviation = Math.max(0, Math.min(1, deviation));

    // Exponential scaling for severe deviations
    const rawScore = Math.pow(deviation, 1.5) * 100;

    // Cap per-vital contribution
    return Math.min(rawScore, MAX_CONTRIBUTION_PER_VITAL);
}

function calculateRiskScore(vitals) {
    let totalScore = 0;
    let totalWeight = 0;
    const breakdown = {};

    for (const [vitalKey, config] of Object.entries(VITAL_CONFIG)) {
        let value = vitals[vitalKey];
        if (value == null || value === '') continue;

        // Ensure numeric type for calculation
        value = parseFloat(value);
        if (isNaN(value)) continue;

        const deviation = calculateDeviationScore(value, vitalKey);
        const weightedScore = deviation * config.weight;

        totalScore += weightedScore;
        totalWeight += config.weight;

        breakdown[vitalKey] = {
            value,
            deviationPct: Math.round((deviation / MAX_CONTRIBUTION_PER_VITAL) * 100),
            contribution: Math.round(weightedScore),
            label: config.label
        };
    }

    // Normalize if not all vitals present
    const normalizedScore = totalWeight > 0
        ? Math.round((totalScore / totalWeight) * (1 / 0.3)) // Scale up since max weight = 0.3
        : 0;

    return {
        score: Math.min(normalizedScore, 100),
        breakdown
    };
}

// ============================================
// TREND ANALYSIS
// ============================================

function analyzeVitalTrend(values, vitalKey) {
    if (values.length < GATES.MIN_FOR_STATS) {
        return {
            direction: 'insufficient',
            strength: 0,
            confidence: 0,
            predictedNext: null,
            isAnomaly: false
        };
    }

    // Reverse to chronological order (oldest first)
    const chronological = [...values].reverse();

    const { slope, rSquared } = linearRegression(chronological);
    const ewma = calculateEWMA(chronological, 0.3);
    const latestValue = chronological[chronological.length - 1];
    const zScore = calculateZScore(latestValue, chronological.slice(0, -1));

    // Predict next value
    const predictedNext = values.length >= GATES.MIN_FOR_PREDICTION
        ? Math.round((ewma + slope) * 10) / 10
        : null;

    // Determine direction (threshold = 0.3 for significant change)
    let direction = 'stable';
    if (Math.abs(slope) > 0.3) {
        direction = slope > 0 ? 'increasing' : 'decreasing';
    }

    return {
        direction,
        strength: Math.abs(slope),
        confidence: Math.round(rSquared * 100) / 100,
        predictedNext,
        isAnomaly: Math.abs(zScore) > 2,
        zScore: Math.round(zScore * 100) / 100
    };
}

// ============================================
// STATUS DETERMINATION
// ============================================

function determineStatus(riskScore, trends, vitalsHistory) {
    // Confidence threshold for escalation
    const CONFIDENCE_THRESHOLD = 0.6;

    // Check for deterioration patterns
    const spo2Trend = trends.spo2 || {};
    const hrTrend = trends.heart_rate || {};
    const rrTrend = trends.respiratory_rate || {};

    const spo2Declining = spo2Trend.direction === 'decreasing' && spo2Trend.confidence > CONFIDENCE_THRESHOLD;
    const hrRising = hrTrend.direction === 'increasing' && hrTrend.confidence > CONFIDENCE_THRESHOLD;
    const rrRising = rrTrend.direction === 'increasing' && rrTrend.confidence > CONFIDENCE_THRESHOLD;

    const deteriorating = spo2Declining || (hrRising && rrRising);

    // Average confidence across all trends
    const trendValues = Object.values(trends).filter(t => t.confidence > 0);
    const avgConfidence = trendValues.length > 0
        ? trendValues.reduce((sum, t) => sum + t.confidence, 0) / trendValues.length
        : 0;

    // Decision logic
    if (riskScore >= 50) return 'critical';
    if (riskScore >= 30 && deteriorating) return 'critical';
    if (riskScore >= 25 || deteriorating) return 'observe';
    return 'stable';
}

// ============================================
// EXPLAINABILITY
// ============================================

function generateExplanation(riskResult, trends, status) {
    const reasons = [];

    // Top risk contributors
    const contributors = Object.entries(riskResult.breakdown)
        .filter(([_, data]) => data.contribution > 3)
        .sort((a, b) => b[1].contribution - a[1].contribution)
        .slice(0, 2);

    for (const [vitalKey, data] of contributors) {
        reasons.push(`${data.label} deviation (+${data.contribution}pts)`);
    }

    // Significant trends
    for (const [vitalKey, trend] of Object.entries(trends)) {
        if (trend.direction !== 'stable' && trend.direction !== 'insufficient' && trend.confidence > 0.5) {
            const config = VITAL_CONFIG[vitalKey];
            const arrow = trend.direction === 'increasing' ? '↑' : '↓';
            reasons.push(`${config?.label || vitalKey} ${arrow} (R²=${trend.confidence})`);
        }
    }

    if (reasons.length === 0) {
        return 'All vitals within expected range';
    }

    return reasons.join(' • ');
}

// ============================================
// PREDICTIONS
// ============================================

function generatePredictions(trends, latestVitals) {
    const predictions = {};

    for (const [vitalKey, trend] of Object.entries(trends)) {
        if (trend.predictedNext != null) {
            const config = VITAL_CONFIG[vitalKey];
            const current = latestVitals[vitalKey];

            predictions[vitalKey] = {
                value: trend.predictedNext,
                direction: trend.direction,
                confidence: trend.confidence,
                label: config?.label || vitalKey,
                change: current ? Math.round((trend.predictedNext - current) * 10) / 10 : 0
            };
        }
    }

    return predictions;
}

// ============================================
// MAIN HOOK
// ============================================

export function useVitalsAnalysis(vitalsHistory) {
    // Guard: empty history
    if (!vitalsHistory || vitalsHistory.length === 0) {
        return {
            riskScore: 0,
            status: 'stable',
            explanation: 'No vitals data available',
            trends: {},
            predictions: null,
            canPredict: false,
            breakdown: {}
        };
    }

    // Latest vitals for current risk
    const latestVitals = parseVitals(vitalsHistory[0]);

    // Calculate current risk score
    const riskResult = calculateRiskScore(latestVitals);

    // Analyze trends for each vital
    const trends = {};
    for (const vitalKey of Object.keys(VITAL_CONFIG)) {
        const values = vitalsHistory
            .map(v => parseVitalValue(v, vitalKey))
            .filter(v => v != null);

        if (values.length > 0) {
            trends[vitalKey] = analyzeVitalTrend(values, vitalKey);
        }
    }

    // Determine status
    const status = determineStatus(riskResult.score, trends, vitalsHistory);

    // Generate explanation
    const explanation = generateExplanation(riskResult, trends, status);

    // Generate predictions (only if enough data)
    const canPredict = vitalsHistory.length >= GATES.MIN_FOR_PREDICTION;
    const predictions = canPredict ? generatePredictions(trends, latestVitals) : null;

    // Calculate prediction risk score
    let predictedRiskScore = null;
    if (predictions) {
        const predictedVitals = {};
        for (const [key, pred] of Object.entries(predictions)) {
            predictedVitals[key] = pred.value;
        }
        predictedRiskScore = calculateRiskScore(predictedVitals).score;
    }

    return {
        riskScore: riskResult.score,
        predictedRiskScore,
        status,
        explanation,
        trends,
        predictions,
        canPredict,
        breakdown: riskResult.breakdown
    };
}

// ============================================
// HELPERS
// ============================================

function parseVitals(record) {
    const parsed = {
        heart_rate: record.heart_rate,
        spo2: record.spo2,
        temperature: record.temperature,
        respiratory_rate: record.respiratory_rate
    };

    // Parse blood pressure from "120/80" format
    if (record.blood_pressure) {
        const parts = record.blood_pressure.split('/');
        if (parts.length === 2) {
            parsed.bp_systolic = parseInt(parts[0]);
            parsed.bp_diastolic = parseInt(parts[1]);
        }
    }

    return parsed;
}

function parseVitalValue(record, vitalKey) {
    if (vitalKey === 'bp_systolic' || vitalKey === 'bp_diastolic') {
        if (record.blood_pressure) {
            const parts = record.blood_pressure.split('/');
            if (parts.length === 2) {
                return vitalKey === 'bp_systolic' ? parseInt(parts[0]) : parseInt(parts[1]);
            }
        }
        return null;
    }
    return record[vitalKey];
}

export default useVitalsAnalysis;
