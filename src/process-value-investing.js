import yahooFinance from 'yahoo-finance2';
import { fetchCompanyDataFromFMP } from './connectors/fmp.js';
import { sendFileViaTelegram } from "./connectors/telegram.js";
import { getNews } from "./utility/news.js";
import { sleep } from "./utility/promise.js";
import { getRSI } from "./tech-indicators/rsi.js";
import { Signal, analyzeFundamentals, generateReport, saveToFile } from './value-investing/index.js';
import { NASDAQ_LARGE_CAPS } from './symbols/nasdaq.js';
import { getCompanySummary } from './connectors/yahoo-finance.js';

const TICKERS = [
    ...NASDAQ_LARGE_CAPS,
    // ...NASDAQ_MID_CAPS,
].sort();

const processTickers = async (tickers) => {
    const results = [];
    const elementToProcess = tickers.length;
    let counter = 1;

    for (let { symbol, name } of tickers) {
        console.log(`${counter}/${elementToProcess}| Processing ${name} (${symbol})`);

        try {
            const fmpData = await fetchCompanyDataFromFMP(symbol);
            const companySummary = await getCompanySummary(symbol);
            const yahooQuote = await yahooFinance.quote(symbol);
            const pricePerShare = yahooQuote.regularMarketPrice;

            const stockResult = fmpData
                ? analyzeFundamentals({ ...fmpData, pricePerShare })
                : { signal: Signal.None, reasons: { unavailable: "Error fetching data" }, score: 0 };
            const rsi = await getRSI(symbol, undefined, "1mo");

            let newsList = [];
            if (stockResult.signal === Signal.Positive) {
                newsList = await getNews(symbol, 3) || [];
            }

            results.push({
                symbol,
                name: name,
                companySummary,
                ...stockResult,
                fmpData,
                yahooQuote,
                rsi,
                currentPrice: pricePerShare,
                news: newsList,
                fundamentals: {
                    pe: parseFloat(fmpData.overview?.peNormalizedAnnual ?? "NaN"),
                    roe: parseFloat(fmpData.overview?.roe ?? "NaN"),
                    eps: (fmpData.earnings?.annualEarnings || []).map((e, i) => ({
                        year: e.date,
                        value: parseFloat(e.reportedEPS)
                    })),
                    revenue: parseFloat(fmpData.incomeStatement?.annualReports?.[0]?.totalRevenue ?? "NaN"),
                    netIncome: parseFloat(fmpData.incomeStatement?.annualReports?.[0]?.netIncome ?? "NaN"),
                    freeCashFlow: parseFloat(fmpData.cashFlowStatement?.annualReports?.[0]?.freeCashFlow ?? "NaN"),
                    totalLiabilities: parseFloat(fmpData.balanceSheet?.annualReports?.[0]?.totalLiabilities ?? "NaN"),
                    totalEquity: parseFloat(fmpData.balanceSheet?.annualReports?.[0]?.totalShareholderEquity ?? "NaN"),
                    currentRatio: parseFloat(fmpData.metrics?.currentRatio ?? "NaN"),
                    interestCoverage: parseFloat(fmpData.metrics?.interestCoverage ?? "NaN"),
                    debtToEBITDA: parseFloat(fmpData.metrics?.debtToEBITDA ?? "NaN")
                }
            });
        } catch (e) {
            console.error(`Errore su ${name} (${symbol}):`, e.message);
        }
        counter += 1;
        sleep(1000);
    }
    return results;
};

(async () => {
    const fullReport = true;
    const tickers = TICKERS;

    const results = await processTickers(tickers);
    await saveToFile(results);

    const toSell = results.filter(x => x.signal === Signal.Negative);
    const toBuy = results.filter(x => x.signal === Signal.Positive);

    if (!results.length) {
        console.warn("No results!");
        return;
    }

    if (toSell.length || toBuy.length) {
        // Short Version
        const shortReportPath = await generateReport([...toBuy, ...toSell]);
        await sleep(5000);
        await sendFileViaTelegram(shortReportPath, `Value Investing Report\nPositive Outlook: ${toBuy.length}\nNegative Outlook: ${toSell.length}`);
    }

    if (fullReport) {
        // Full Version
        const reportPath = await generateReport(results);
        await sleep(5000);
        await sendFileViaTelegram(reportPath, `Value Investing Report - Full Version`);
    }
})();
