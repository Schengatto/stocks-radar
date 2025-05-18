import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const AUTH_KEYS = [
    process.env.FMP_API_KEY1,
    process.env.FMP_API_KEY2,
    process.env.FMP_API_KEY3,
    process.env.FMP_API_KEY4,
].filter(k => !!k); // Filtra chiavi non definite

const BASE_URL = 'https://financialmodelingprep.com/api/v3';
const MAX_RETRIES = AUTH_KEYS.length * 2; // Evita loop infiniti

// Rotazione delle chiavi con fallback
const fetchWithKeyRotation = async (url, retryCount = 0) => {
    if (retryCount >= MAX_RETRIES) {
        throw new Error('Max retries reached. All keys exhausted.');
    }

    const currentKey = AUTH_KEYS[retryCount % AUTH_KEYS.length];
    try {
        const response = await axios.get(`${url}&apikey=${currentKey}`);
        return response.data;
    } catch (err) {
        if (err.response?.status === 429 || err.response?.status === 403) {
            console.warn(`⚠️ Rate limit hit with key ${currentKey}. Retrying with next key...`);
            return fetchWithKeyRotation(url, retryCount + 1);
        }
        throw err; // Rilancia altri errori (es. 404)
    }
};

export const fetchCompanyDataFromFMP = async (symbol) => {
    try {
        const endpoints = [
            `${BASE_URL}/income-statement/${symbol}?limit=5`,
            `${BASE_URL}/balance-sheet-statement/${symbol}?limit=5`,
            `${BASE_URL}/ratios/${symbol}?limit=5`
        ];

        const [incomeData, balanceData, ratiosData] = await Promise.all(
            endpoints.map(url => fetchWithKeyRotation(url))
        );

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