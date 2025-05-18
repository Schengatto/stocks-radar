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

        // EPS history (manual calc: netIncome / sharesOutstanding)
        const annualEarnings = incomeData.map((report) => ({
            reportedEPS: report.eps ?? NaN
        })).filter(e => !isNaN(e.reportedEPS));

        const latestRatios = ratiosData[0] || {};

        const overview = {
            peNormalizedAnnual: parseFloat(latestRatios.priceEarningsRatio ?? NaN),
            roe: parseFloat(latestRatios.returnOnEquity ?? NaN)
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

        return { overview, earnings: { annualEarnings }, incomeStatement, balanceSheet };
    } catch (err) {
        console.error(`❌ FMP error for ${symbol}:`, err.message);
        return null;
    }
};