import dotenv from "dotenv";
import axios from "axios";
import { parseDate } from "../utility/parsers.js";
import { readDataFromFile, saveDataToFile } from "../utility/file.js";

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
    const totalKeys = AUTH_KEYS.length;
    const startIndex = Date.now() % totalKeys;

    for (let i = 0; i < totalKeys; i++) {
        const keyIndex = (startIndex + i) % totalKeys;
        const currentKey = AUTH_KEYS[keyIndex];
        try {
            const response = await axios.get(`${url}&apikey=${currentKey}`);
            return response.data;
        } catch (err) {
            if (err.response?.status === 429) {
                // console.warn(`⚠️ Rate limit hit with key index ${keyIndex}. Trying next key...`);
                continue;
            }
            if (err?.response?.data?.["Error Message"]) {
                console.error(err.response.data["Error Message"]);
            }
            throw err;
        }
    }

    throw new Error('Max retries reached. All keys exhausted.');
};

const getDataFromSymbol = async (symbol) => {
    const today = parseDate(new Date());
    const databasePath = `./.storage/${today}_fmp.json`;
    const readFromDb = async () => {
        try {
            return readDataFromFile(databasePath);
        } catch (e) {
            return undefined;
        }
    }

    const database = await readFromDb() || {};
    let data = Object.hasOwn(database, symbol) && database[symbol];

    if (!data) {
        const incomeData = await fetchWithKeyRotation(`${BASE_URL}/income-statement/${symbol}?limit=5`);
        const balanceData = await fetchWithKeyRotation(`${BASE_URL}/balance-sheet-statement/${symbol}?limit=5`);
        const ratiosData = await fetchWithKeyRotation(`${BASE_URL}/ratios/${symbol}?limit=5`);
        const cashFlowData = await fetchWithKeyRotation(`${BASE_URL}/cash-flow-statement/${symbol}?limit=5`);
        const keyMetricsData = await fetchWithKeyRotation(`${BASE_URL}/key-metrics/${symbol}?limit=5`);

        data = { incomeData, balanceData, ratiosData, cashFlowData, keyMetricsData };
        await saveDataToFile(databasePath, { ...database, [symbol]: data });
    }

    return data;
};

export const fetchCompanyDataFromFMP = async (symbol) => {
    try {
        const { incomeData, balanceData, ratiosData, cashFlowData, keyMetricsData } = await getDataFromSymbol(symbol);

        const annualEarnings = incomeData.map((report) => ({
            date: report.date,
            reportedEPS: report.eps ?? NaN
        })).filter(e => !isNaN(e.reportedEPS));

        const latestRatios = ratiosData[0] || {};
        const latestMetrics = keyMetricsData[0] || {};
        const latestCashFlow = cashFlowData[0] || {};
        const latestFCF = parseFloat(latestCashFlow.freeCashFlow ?? latestCashFlow.operatingCashFlow ?? NaN);
        const incomeTotal = parseFloat(incomeData?.[0]?.netIncome ?? NaN);
        const fcfTotal = parseFloat(latestCashFlow?.freeCashFlow ?? NaN);
        const fcfPerShare = parseFloat(latestMetrics?.freeCashFlowPerShare ?? NaN);
        const netIncomePerShare = parseFloat(latestMetrics?.netIncomePerShare ?? NaN);

        let sharesOutstanding = NaN;

        if (!isNaN(fcfTotal) && !isNaN(fcfPerShare) && fcfPerShare !== 0) {
            sharesOutstanding = fcfTotal / fcfPerShare;
        } else if (!isNaN(incomeTotal) && !isNaN(netIncomePerShare) && netIncomePerShare !== 0) {
            sharesOutstanding = incomeTotal / netIncomePerShare;
        }

        const overview = {
            peNormalizedAnnual: parseFloat(latestRatios.priceEarningsRatio ?? NaN),
            roe: parseFloat(latestRatios.returnOnEquity ?? NaN),
        };

        const incomeStatement = {
            annualReports: incomeData.map((r) => ({
                netIncome: parseFloat(r.netIncome ?? NaN),
                totalRevenue: parseFloat(r.revenue ?? NaN),
                operatingIncome: parseFloat(r.operatingIncome ?? NaN) // ✅ Fix 1
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

        // fallback Debt/EBITDA calculation
        const fallbackDebtToEBITDA = (() => {
            const totalDebt = parseFloat(latestMetrics.totalDebt ?? NaN);
            const ebitda = parseFloat(incomeData?.[0]?.ebitda ?? NaN);
            return (!isNaN(totalDebt) && !isNaN(ebitda) && ebitda !== 0)
                ? totalDebt / ebitda
                : NaN;
        })();

        const metrics = {
            currentRatio: parseFloat(latestMetrics.currentRatio ?? NaN),
            interestCoverage: parseFloat(latestMetrics.interestCoverage ?? NaN),
            debtToEBITDA: parseFloat(
                latestMetrics.debtToEBITDA ??
                latestMetrics.netDebtToEBITDA ??
                latestMetrics.debtEBITDARatio ??
                fallbackDebtToEBITDA // ✅ Fix 2
            ),
            marketCap: parseFloat(latestMetrics.marketCap ?? NaN),
            sharesOutstanding,

            // Extended fields
            grossProfitMargin: parseFloat(latestRatios.grossProfitMargin ?? latestMetrics.grossProfitMargin ?? NaN),
            roic: parseFloat(latestMetrics.roic ?? NaN),
            dividendPayoutRatio: parseFloat(latestMetrics.dividendPayoutRatio ?? NaN),
            returnOnTangibleAssets: parseFloat(latestMetrics.returnOnTangibleAssets ?? NaN),
            intangiblesToTotalAssets: parseFloat(latestMetrics.intangiblesToTotalAssets ?? NaN),
            grahamNumber: parseFloat(latestMetrics.grahamNumber ?? NaN),
            pfcfRatio: parseFloat(latestMetrics.pfcfRatio ?? NaN)
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
