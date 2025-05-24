import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const AUTH = [
    process.env.ALPHAVANTAGE_KEY1,
    process.env.ALPHAVANTAGE_KEY2,
    process.env.ALPHAVANTAGE_KEY3,
    process.env.ALPHAVANTAGE_KEY4,
    process.env.ALPHAVANTAGE_KEY5,
    process.env.ALPHAVANTAGE_KEY6,
    process.env.ALPHAVANTAGE_KEY7,
    process.env.ALPHAVANTAGE_KEY8,
    process.env.ALPHAVANTAGE_KEY9,
    process.env.ALPHAVANTAGE_KEY10,
].filter(k => !!k);

const BASE_URL = 'https://www.alphavantage.co/query?';

const fetchOverview = async (symbol, key) => {
    const response = await axios.get(`${BASE_URL}function=OVERVIEW&symbol=${symbol}&apikey=${key}`);
    return response.data;
};

const fetchEarnings = async (symbol, key) => {
    const response = await axios.get(`${BASE_URL}function=EARNINGS&symbol=${symbol}&apikey=${key}`);
    return response.data;
};

const fetchBalance = async (symbol, key) => {
    const response = await axios.get(`${BASE_URL}function=BALANCE_SHEET&symbol=${symbol}&apikey=${key}`);
    return response.data;
};

const fetchIncomeStatement = async (symbol, key) => {
    const response = await axios.get(`${BASE_URL}function=INCOME_STATEMENT&symbol=${symbol}&apikey=${key}`);
    return response.data;
};

export const fetchCompanyData = async (symbol) => {
    let lastError = null;
    for (const key of AUTH) {
        try {
            console.log(`Using key: ${key}`)
            const overview = await fetchOverview(symbol, key);
            const earnings = await fetchEarnings(symbol, key);
            const balanceSheet = await fetchBalance(symbol, key);
            const incomeStatement = await fetchIncomeStatement(symbol, key);

            console.log({overview, earnings, incomeStatement});

            if (
                earnings.Information && earnings.Information.includes("rate limit") ||
                overview.Note && overview.Note.includes("rate limit")
            ) {
                continue;
            }
            const results = {
                overview,
                earnings,
                balanceSheet,
                incomeStatement
            }
            console.log(results);
            return results;
        } catch (e) {
            lastError = e;
            throw e;
        }
    }

    throw lastError || new Error('All Alpha-vantage API keys failed.');
};
