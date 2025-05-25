import { Signal } from "./index.js";

const estimateIntrinsicValue = ({ latestFCF, metrics, pricePerShare }, options = {}) => {
    const {
        growthRate = 0.10,
        discountRate = 0.10,
        terminalGrowth = 0.02,
        years = 5
    } = options;

    const { sharesOutstanding, marketCap } = metrics;

    if (!latestFCF || latestFCF <= 0 || !sharesOutstanding || sharesOutstanding <= 0 || discountRate <= terminalGrowth) {
        return { value: NaN, message: "Invalid input data" };
    }

    let totalDCF = 0;
    for (let year = 1; year <= years; year++) {
        const projectedFCF = latestFCF * Math.pow(1 + growthRate, year);
        totalDCF += projectedFCF / Math.pow(1 + discountRate, year);
    }

    const lastFCF = latestFCF * Math.pow(1 + growthRate, years);
    const terminalValue = (lastFCF * (1 + terminalGrowth)) / (discountRate - terminalGrowth);
    totalDCF += terminalValue / Math.pow(1 + discountRate, years);

    const intrinsicValuePerShare = totalDCF / sharesOutstanding;

    const marketPricePerShare = pricePerShare !== undefined
        ? pricePerShare
        : marketCap && sharesOutstanding
            ? marketCap / sharesOutstanding
            : NaN;

    const marginOfSafety = isNaN(marketPricePerShare)
        ? NaN
        : (1 - marketPricePerShare / intrinsicValuePerShare) * 100;

    return {
        intrinsicValuePerShare,
        marketPricePerShare,
        marginOfSafety,
        signal: isNaN(marginOfSafety)
            ? 'Unknown'
            : marginOfSafety >= 30
                ? 'Undervalued'
                : marginOfSafety <= -20
                    ? 'Overvalued'
                    : 'Fairly valued'
    };
};

const calculateCAGR = (start, end, years) => {
    if (start <= 0 || end <= 0 || years <= 0) return NaN;
    return Math.pow(end / start, 1 / years) - 1;
};

export function analyzeFundamentals(data) {
    const {
        overview,
        earnings,
        balanceSheet,
        incomeStatement,
        cashFlowStatement,
        metrics,
        pricePerShare,
        latestFCF,
    } = data;

    const reasons = {
        passed: [],
        failed: [],
        unavailable: []
    };

    let score = 0;
    const maxScore = 18;

    try {
        const epsList = (earnings?.annualEarnings || [])
            .map(e => parseFloat(e.reportedEPS))
            .filter(eps => !isNaN(eps));
        const hasEPS = epsList.length >= 3;
        if (!hasEPS) {
            reasons.unavailable.push("EPS data insufficient");
        } else {
            const first = epsList[epsList.length - 1];
            const last = epsList[0];
            if (last > first) {
                reasons.passed.push("EPS shows upward trend");
                score++;
            } else {
                reasons.failed.push("EPS does not show upward trend");
            }

            // CAGR on EPS
            const epsCAGR = calculateCAGR(first, last, epsList.length - 1);
            if (!isNaN(epsCAGR) && epsCAGR > 0.10) {
                reasons.passed.push(`EPS CAGR > 10% (${(epsCAGR * 100).toFixed(2)}%)`);
                score++;
            }
        }

        const roic = parseFloat(metrics?.roic ?? "NaN");
        if (isNaN(roic)) {
            reasons.unavailable.push("ROIC not available");
        } else if (roic > 0.10) {
            reasons.passed.push(`ROIC acceptable (${roic.toFixed(2)})`);
            score++;
        } else {
            reasons.failed.push(`ROIC too low (${roic.toFixed(2)})`);
        }

        const grossMargin = parseFloat(metrics?.grossProfitMargin ?? "NaN");
        if (!isNaN(grossMargin)) {
            if (grossMargin > 0.60) {
                reasons.passed.push(`Strong gross margin (${(grossMargin * 100).toFixed(1)}%) — potential moat`);
                score++;
            } else {
                reasons.failed.push(`Low gross margin (${(grossMargin * 100).toFixed(1)}%)`);
            }
        }

        const pfcf = parseFloat(metrics?.pfcfRatio ?? "NaN");
        if (isNaN(pfcf)) {
            reasons.unavailable.push("P/FCF ratio not available");
        } else if (pfcf < 15) {
            reasons.passed.push(`P/FCF is reasonable (${pfcf.toFixed(2)})`);
            score++;
        } else {
            reasons.failed.push(`P/FCF too high (${pfcf.toFixed(2)})`);
        }

        const dividendPayout = parseFloat(metrics?.dividendPayoutRatio ?? "NaN");
        if (!isNaN(dividendPayout)) {
            if (dividendPayout > 0 && dividendPayout < 60) {
                reasons.passed.push(`Dividend payout ratio is healthy (${dividendPayout.toFixed(2)}%)`);
                score++;
            } else {
                reasons.failed.push(`Dividend payout ratio too high (${dividendPayout.toFixed(2)}%)`);
            }
        }

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

        const inc = incomeStatement?.annualReports?.[0];
        const operatingIncome = inc ? parseFloat(inc.operatingIncome) : NaN;
        const revenue = inc ? parseFloat(inc.totalRevenue) : NaN;
        if (!inc || isNaN(operatingIncome) || isNaN(revenue) || revenue <= 0) {
            reasons.unavailable.push("Operating income or revenue not available");
        } else {
            const operatingMargin = operatingIncome / revenue;
            if (operatingMargin > 0.10) {
                reasons.passed.push(`Operating margin > 10% (${(operatingMargin * 100).toFixed(1)}%)`);
                score++;
            } else {
                reasons.failed.push(`Operating margin too low (${(operatingMargin * 100).toFixed(1)}%)`);
            }
        }

        const cf = cashFlowStatement?.annualReports?.[0];
        const fcf = cf ? parseFloat(cf.freeCashFlow) : NaN;
        const capex = cf ? parseFloat(cf.capitalExpenditure) : NaN;
        if (isNaN(fcf)) {
            reasons.unavailable.push("Free Cash Flow not available");
        } else {
            if (fcf > 0) {
                reasons.passed.push("Free Cash Flow is positive");
                score++;
            } else {
                reasons.failed.push("Free Cash Flow is negative");
            }

            // CapEx intensity
            if (!isNaN(capex) && capex !== 0) {
                const capexToFCF = Math.abs(capex / fcf);
                if (capexToFCF < 0.5) {
                    reasons.passed.push("CapEx intensity is low (CapEx/FCF < 50%)");
                    score++;
                } else {
                    reasons.failed.push("CapEx intensity is high");
                }
            }
        }

        const currentRatio = parseFloat(metrics?.currentRatio ?? "NaN");
        if (isNaN(currentRatio)) {
            reasons.unavailable.push("Current Ratio not available");
        } else if (currentRatio > 1.5) {
            reasons.passed.push(`Current Ratio > 1.5 (${currentRatio.toFixed(2)})`);
            score++;
        } else {
            reasons.failed.push(`Current Ratio too low (${currentRatio.toFixed(2)})`);
        }

        const interestCoverage = parseFloat(metrics?.interestCoverage ?? "NaN");
        if (isNaN(interestCoverage)) {
            reasons.unavailable.push("Interest Coverage not available");
        } else if (interestCoverage > 3) {
            reasons.passed.push(`Interest Coverage > 3 (${interestCoverage.toFixed(2)})`);
            score++;
        } else {
            reasons.failed.push(`Interest Coverage too low (${interestCoverage.toFixed(2)})`);
        }

        const debtToEBITDA = parseFloat(metrics?.debtToEBITDA ?? "NaN");
        if (isNaN(debtToEBITDA)) {
            reasons.unavailable.push("Debt/EBITDA not available");
        } else if (debtToEBITDA < 3) {
            reasons.passed.push(`Debt/EBITDA < 3 (${debtToEBITDA.toFixed(2)})`);
            score++;
        } else {
            reasons.failed.push(`Debt/EBITDA too high (${debtToEBITDA.toFixed(2)})`);
        }

        const rota = parseFloat(metrics?.returnOnTangibleAssets ?? "NaN");
        if (!isNaN(rota)) {
            if (rota > 0.05) {
                reasons.passed.push(`Solid return on tangible assets (${(rota * 100).toFixed(2)}%)`);
                score++;
            } else {
                reasons.failed.push(`Low return on tangible assets (${(rota * 100).toFixed(2)}%)`);
            }
        }

        const intangiblesRatio = parseFloat(metrics?.intangiblesToTotalAssets ?? "NaN");
        if (!isNaN(intangiblesRatio) && intangiblesRatio < 0.2) {
            reasons.passed.push("Low reliance on intangibles — balance sheet is clean");
            score++;
        }

        const grahamNumber = parseFloat(metrics?.grahamNumber ?? "NaN");
        if (!isNaN(grahamNumber) && pricePerShare < grahamNumber) {
            reasons.passed.push("Price is below Graham Number — strong value signal");
            score++;
        }

        const valuation = estimateIntrinsicValue({ latestFCF, metrics, pricePerShare });
        if (!isNaN(valuation.intrinsicValuePerShare)) {
            if (valuation.signal === 'Undervalued') {
                reasons.passed.push(`Intrinsic Value per Share: $${valuation.intrinsicValuePerShare.toFixed(2)} (${valuation.signal})`);
                score++;
            } else if (valuation.signal === 'Overvalued') {
                reasons.failed.push(`Intrinsic Value per Share: $${valuation.intrinsicValuePerShare.toFixed(2)} (${valuation.signal})`);
                score--;
            }
        } else {
            reasons.unavailable.push("Could not estimate intrinsic value");
        }

        if (reasons.unavailable.length >= 5) {
            return {
                signal: Signal.None,
                reasons
            };
        }

        if (score >= 14) return { signal: Signal.Positive, reasons, score };
        if (score <= 5) return { signal: Signal.Negative, reasons, score };
        return { signal: Signal.None, reasons, score };

    } catch (error) {
        console.error("Error during fundamental analysis:", error);
        return {
            signal: Signal.None,
            reasons: { error: error.message },
            score: 0
        };
    }
}
