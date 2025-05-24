import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const AUTH_KEYS = [
    process.env.FMP_API_KEY1,
    process.env.FMP_API_KEY2,
    process.env.FMP_API_KEY3,
    process.env.FMP_API_KEY4,
    process.env.FMP_API_KEY5,
    process.env.FMP_API_KEY6,
    process.env.FMP_API_KEY7,
    process.env.FMP_API_KEY8,
    process.env.FMP_API_KEY9,
    process.env.FMP_API_KEY10,
    process.env.FMP_API_KEY11,
    process.env.FMP_API_KEY12,
    process.env.FMP_API_KEY13,
    process.env.FMP_API_KEY14,
    process.env.FMP_API_KEY15,
    process.env.FMP_API_KEY16,
    process.env.FMP_API_KEY17,
    process.env.FMP_API_KEY18,
    process.env.FMP_API_KEY19,
    process.env.FMP_API_KEY20,
].filter(k => !!k);

const BASE_URL = 'https://financialmodelingprep.com/api/v3';

const fetchWithKeyRotation = async (url) => {
    for (let i = 0; i < AUTH_KEYS.length; i++) {
        const currentKey = AUTH_KEYS[i];
        try {
            const response = await axios.get(`${url}&apikey=${currentKey}`);
            return response.data;
        } catch (err) {
            if (err.response?.status === 429) {
                // console.warn(`⚠️ Rate limit hit with key index ${i}. Trying next key...`);
                continue;
            }
            if (err?.response?.data["Error Message"])
                console.error(err.response.data["Error Message"]);
            throw err; // altri errori: esci subito
        }
    }
    throw new Error('Max retries reached. All keys exhausted.');
};

export const fetchCompanyDataFromFMP = async (symbol) => {
    try {
        const incomeData = await fetchWithKeyRotation(`${BASE_URL}/income-statement/${symbol}?limit=5`);
        const balanceData = await fetchWithKeyRotation(`${BASE_URL}/balance-sheet-statement/${symbol}?limit=5`);
        const ratiosData = await fetchWithKeyRotation(`${BASE_URL}/ratios/${symbol}?limit=5`);
        const cashFlowData = await fetchWithKeyRotation(`${BASE_URL}/cash-flow-statement/${symbol}?limit=5`);
        const keyMetricsData = await fetchWithKeyRotation(`${BASE_URL}/key-metrics/${symbol}?limit=5`);

        const annualEarnings = incomeData.map((report) => ({
            date: report.date,
            reportedEPS: report.eps ?? NaN
        })).filter(e => !isNaN(e.reportedEPS));

        const latestRatios = ratiosData[0] || {};
        const latestMetrics = keyMetricsData[0] || {};
        const latestCashFlow = cashFlowData[0] || {};
        const latestFCF = parseFloat(latestCashFlow.freeCashFlow ?? latestCashFlow.operatingCashFlow ?? NaN);

        const overview = {
            peNormalizedAnnual: parseFloat(latestRatios.priceEarningsRatio ?? NaN),
            roe: parseFloat(latestRatios.returnOnEquity ?? NaN),
        };

        const incomeStatement = {
            annualReports: incomeData.map((r) => ({
                netIncome: parseFloat(r.netIncome ?? NaN),
                totalRevenue: parseFloat(r.revenue ?? NaN)
            }))
        };

        const balanceSheet = {
            annualReports: balanceData.map((r) => ({
                totalLiabilities: parseFloat(r.totalLiabilities ?? NaN),
                totalShareholderEquity: parseFloat(r.totalStockholdersEquity ?? NaN)
            }))
        };

        const cashFlowStatement = {
            annualReports: cashFlowData.map((r) => ({
                freeCashFlow: parseFloat(r.freeCashFlow ?? r.operatingCashFlow ?? NaN),
                operatingCashFlow: parseFloat(r.operatingCashFlow ?? NaN),
                capitalExpenditure: parseFloat(r.capitalExpenditure ?? NaN)
            }))
        };

        const metrics = {
            currentRatio: parseFloat(latestMetrics.currentRatio ?? NaN),
            interestCoverage: parseFloat(latestMetrics.interestCoverage ?? NaN),
            debtToEBITDA: parseFloat(latestMetrics.debtToEBITDA ?? NaN),
            marketCap: parseFloat(latestMetrics.marketCap ?? NaN),
        };

        return {
            overview,
            earnings: { annualEarnings },
            incomeStatement,
            balanceSheet,
            cashFlowStatement,
            metrics,
            latestFCF
        };

    } catch (err) {
        console.error(`❌ FMP error for ${symbol}:`, err.message);
        return null;
    }
};