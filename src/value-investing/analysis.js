import { Signal } from "./index.js";

export function analyzeFundamentals(data) {
    const {
        overview,
        earnings,
        balanceSheet,
        incomeStatement,
        cashFlowStatement,
        metrics
    } = data;

    const reasons = {
        passed: [],
        failed: [],
        unavailable: []
    };

    let score = 0;
    const maxScore = 9;

    try {
        // EPS trend (non costante)
        const epsList = (earnings?.annualEarnings || [])
            .map(e => parseFloat(e.reportedEPS))
            .filter(eps => !isNaN(eps));
        const hasEPS = epsList.length >= 3;
        if (!hasEPS) {
            reasons.unavailable.push("EPS data insufficient");
        } else {
            const first = epsList[0];
            const last = epsList[epsList.length - 1];
            if (last > first) {
                reasons.passed.push("EPS shows upward trend");
                score++;
            } else {
                reasons.failed.push("EPS does not show upward trend");
            }
        }

        // ROE > 10%
        const roe = parseFloat(overview?.roe ?? "NaN");
        if (isNaN(roe)) {
            reasons.unavailable.push("ROE not available");
        } else if (roe >= 0.10) {
            reasons.passed.push(`ROE acceptable (${roe.toFixed(2)})`);
            score++;
        } else {
            reasons.failed.push(`ROE too low (${roe.toFixed(2)})`);
        }

        // P/E < 25
        const pe = parseFloat(overview?.peNormalizedAnnual ?? "NaN");
        if (isNaN(pe)) {
            reasons.unavailable.push("P/E ratio not available");
        } else if (pe < 25) {
            reasons.passed.push(`P/E is reasonable (${pe.toFixed(2)})`);
            score++;
        } else {
            reasons.failed.push(`P/E too high (${pe.toFixed(2)})`);
        }

        // Debt < 2x Equity
        const bs = balanceSheet?.annualReports?.[0];
        const debt = bs ? parseFloat(bs.totalLiabilities) : NaN;
        const equity = bs ? parseFloat(bs.totalShareholderEquity) : NaN;
        if (!bs || isNaN(debt) || isNaN(equity) || equity === 0) {
            reasons.unavailable.push("Debt or equity not available or invalid");
        } else if (debt / equity < 2) {
            reasons.passed.push("Debt < 2x Equity");
            score++;
        } else {
            reasons.failed.push("Debt is too high relative to equity");
        }

        // Operating Margin > 10%
        const inc = incomeStatement?.annualReports?.[0];
        const netIncome = inc ? parseFloat(inc.netIncome) : NaN;
        const revenue = inc ? parseFloat(inc.totalRevenue) : NaN;
        if (!inc || isNaN(netIncome) || isNaN(revenue) || revenue <= 0) {
            reasons.unavailable.push("Net income or revenue not available");
        } else {
            const operatingMargin = netIncome / revenue;
            if (operatingMargin > 0.10) {
                reasons.passed.push(`Operating margin > 10% (${(operatingMargin * 100).toFixed(1)}%)`);
                score++;
            } else {
                reasons.failed.push(`Operating margin too low (${(operatingMargin * 100).toFixed(1)}%)`);
            }
        }

        // Free Cash Flow > 0
        const cf = cashFlowStatement?.annualReports?.[0];
        const fcf = cf ? parseFloat(cf.freeCashFlow) : NaN;
        if (isNaN(fcf)) {
            reasons.unavailable.push("Free Cash Flow not available");
        } else if (fcf > 0) {
            reasons.passed.push("Free Cash Flow is positive");
            score++;
        } else {
            reasons.failed.push("Free Cash Flow is negative");
        }

        // Current Ratio > 1.5
        const currentRatio = parseFloat(metrics?.currentRatio ?? "NaN");
        if (isNaN(currentRatio)) {
            reasons.unavailable.push("Current Ratio not available");
        } else if (currentRatio > 1.5) {
            reasons.passed.push(`Current Ratio > 1.5 (${currentRatio.toFixed(2)})`);
            score++;
        } else {
            reasons.failed.push(`Current Ratio too low (${currentRatio.toFixed(2)})`);
        }

        // Interest Coverage > 3
        const interestCoverage = parseFloat(metrics?.interestCoverage ?? "NaN");
        if (isNaN(interestCoverage)) {
            reasons.unavailable.push("Interest Coverage not available");
        } else if (interestCoverage > 3) {
            reasons.passed.push(`Interest Coverage > 3 (${interestCoverage.toFixed(2)})`);
            score++;
        } else {
            reasons.failed.push(`Interest Coverage too low (${interestCoverage.toFixed(2)})`);
        }

        // Debt/EBITDA < 3
        const debtToEBITDA = parseFloat(metrics?.debtToEBITDA ?? "NaN");
        if (isNaN(debtToEBITDA)) {
            reasons.unavailable.push("Debt/EBITDA not available");
        } else if (debtToEBITDA < 3) {
            reasons.passed.push(`Debt/EBITDA < 3 (${debtToEBITDA.toFixed(2)})`);
            score++;
        } else {
            reasons.failed.push(`Debt/EBITDA too high (${debtToEBITDA.toFixed(2)})`);
        }

        // Final decision logic
        if (reasons.unavailable.length >= 3) {
            return {
                signal: Signal.None,
                reasons
            };
        }

        if (score >= 7) return { signal: Signal.Positive, reasons };
        if (score <= 3) return { signal: Signal.Negative, reasons };
        return { signal: Signal.None, reasons };

    } catch (error) {
        console.error("Error during fundamental analysis:", error);
        return {
            signal: Signal.None,
            reasons: { error: error.message }
        };
    }
}