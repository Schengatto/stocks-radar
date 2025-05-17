import yahooFinance from 'yahoo-finance2';
import { LARGE_CAPS, MID_CAPS } from './symbols/gettex.js';

const Signal = {
    Buy: "buy",
    None: "none",
}

const SYMBOLS = [
    ...LARGE_CAPS,
    ...MID_CAPS,
];

async function fetchData(ticker) {
    const summary = await yahooFinance.quoteSummary(ticker, {
        modules: [
            'financialData',
            'defaultKeyStatistics',
            'earnings',
            'incomeStatementHistory',
            'balanceSheetHistory'
        ]
    });

    const priceData = await yahooFinance.quote(ticker);

    const fd = summary.financialData;
    const ks = summary.defaultKeyStatistics;
    const earnings = summary.earnings;
    const income = summary.incomeStatementHistory?.incomeStatementHistory;
    const balance = summary.balanceSheetHistory?.balanceSheetStatements;

    const roe = ks.returnOnEquity?.raw * 100;
    const debtEquity = ks.debtToEquity?.raw;
    const pe = ks.forwardPE || ks.trailingPE;

    const epsHistory = earnings.earningsHistory?.history?.slice(-5) || [];
    const epsGrowth = calculateEpsGrowth(epsHistory);

    const freeCashFlow = fd.freeCashflow?.raw;
    const fcfPositive = freeCashFlow > 0;

    return {
        ticker,
        roe,
        debtEquity,
        pe,
        epsGrowth,
        fcfPositive,
        price: priceData.regularMarketPrice
    };
}

function calculateEpsGrowth(epsHistory) {
    if (epsHistory.length < 2) return null;
    const first = epsHistory[0]?.epsActual?.raw;
    const last = epsHistory[epsHistory.length - 1]?.epsActual?.raw;
    return first && last ? ((last - first) / Math.abs(first)) * 100 : null;
}

function passesBuffettFilter(data) {
    return (
        data.roe > 15 &&
        data.debtEquity < 50 &&
        data.pe < 15 &&
        data.epsGrowth > 10 &&
        data.fcfPositive
    );
}

function generateSignal(data) {
    const passed = passesBuffettFilter(data);
    return {
        ticker: data.ticker,
        signal: passed ? Signal.Buy : Signal.None,
        reason: passed ? 'Undervalued & high quality' : 'Fails Buffett filters',
        details: data
    };
}

(async () => {
    const results = [];
    for (let s of SYMBOLS) {
        try {
            const data = await fetchData(s);
            const signal = generateSignal(data);
            results.push(signal);
        } catch (e) {
            console.error(`Error fetching symbol "${s}"`, e);
            continue;
        }
    }
    console.table(results.filter(r => r.signal === Signal.Buy).map(r => r.ticker));
})();