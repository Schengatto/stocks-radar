import { fetchCompanyDataFromFMP } from './connectors/fmp.js';
import { sendFileViaTelegram } from "./connectors/telegram.js";
import { getNews } from "./utility/news.js";
import { sleep } from "./utility/promise.js";
import { getRSI } from "./tech-indicators/rsi.js";
import { Signal, analyzeFundamentals, generateReport, saveToFile } from './value-investing/index.js';

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
            const data = await fetchCompanyDataFromFMP(symbol);
            const stockResult = data ? analyzeFundamentals(data) : { signal: Signal.None, reasons: { unavailable: "Error fetching data" } };
            const rsi = await getRSI(symbol, undefined, "1mo");
            const newsList = await getNews(symbol) || [];

            results.push({
                symbol,
                name: name,
                ...stockResult,
                rsi,
                news: newsList,
                fundamentals: {
                    pe: parseFloat(data.overview?.peNormalizedAnnual ?? "NaN"),
                    roe: parseFloat(data.overview?.roe ?? "NaN"),
                    eps: (data.earnings?.annualEarnings || []).map((e, i) => ({
                        year: e.date,
                        value: parseFloat(e.reportedEPS)
                    })),
                    revenue: parseFloat(data.incomeStatement?.annualReports?.[0]?.totalRevenue ?? "NaN"),
                    netIncome: parseFloat(data.incomeStatement?.annualReports?.[0]?.netIncome ?? "NaN"),
                    freeCashFlow: parseFloat(data.cashFlowStatement?.annualReports?.[0]?.freeCashFlow ?? "NaN"),
                    totalLiabilities: parseFloat(data.balanceSheet?.annualReports?.[0]?.totalLiabilities ?? "NaN"),
                    totalEquity: parseFloat(data.balanceSheet?.annualReports?.[0]?.totalShareholderEquity ?? "NaN"),
                    currentRatio: parseFloat(data.metrics?.currentRatio ?? "NaN"),
                    interestCoverage: parseFloat(data.metrics?.interestCoverage ?? "NaN"),
                    debtToEBITDA: parseFloat(data.metrics?.debtToEBITDA ?? "NaN")
                }
            });
        } catch (e) {
            console.error(`Errore su ${name} (${symbol}):`, e.message);
        }
        counter += 1;
        await saveToFile(results);
    }

    return results;
};

(async () => {
    const tickers = TICKERS.slice(0, 1);
    const results = await processTickers(tickers);
    const reportPath = await generateReport(results);
    await sleep(5000);

    const toSell = results.filter(x => x.signal === Signal.Negative);
    const toBuy = results.filter(x => x.signal === Signal.Positive);
    await sendFileViaTelegram(reportPath, `Value Investing Report\nPositive Outlook: ${toBuy.length}\nNegative Outlook: ${toSell.length}`);
})();
