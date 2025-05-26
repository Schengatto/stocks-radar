import dotenv from "dotenv";
import { RSI } from 'technicalindicators';
import yahooFinance from 'yahoo-finance2';

import { sendViaTelegram } from "./connectors/telegram.js";
import { NASDAQ_LARGE_CAPS } from "./symbols/nasdaq.js";

const Signal = {
    Buy: "buy",
    Sell: "sell",
    None: "none",
}

const TICKERS = [
    ...NASDAQ_LARGE_CAPS,
    // ...NASDAQ_MID_CAPS,
].sort();

dotenv.config();
console.log(`[${new Date().toISOString()}] Starting RSI signals...`);

const interval = process.env.INTERVAL || "1d";

const length = 14;
const upperLine = 70;
const lowerLine = 30;

const getRsiSignal = async (symbol, name) => {
    const result = await yahooFinance.historical(symbol, {
        period1: '2024-01-01',
        interval: interval,
    });

    const closes = result.map(d => d.close).filter(Boolean);
    if (closes.length < length) return;

    // --- RSI Calculation ---
    const rsiValues = RSI.calculate({ values: closes, period: length });
    const prev = rsiValues.at(-2);
    const curr = rsiValues.at(-1);
    if (prev == null || curr == null) return;

    const signal =
        prev < lowerLine && curr >= lowerLine
            ? Signal.Buy
            : prev > upperLine && curr <= upperLine
                ? Signal.Sell
                : Signal.None;

    // --- Price performance calculation ---
    const latest = closes.at(-1);
    const oneDayAgo = closes.at(-2);
    const oneWeekAgo = closes.at(-6); // 7 calendar days = ~5 market days, adjust accordingly

    const performance24h = oneDayAgo ? ((latest - oneDayAgo) / oneDayAgo) * 100 : null;
    const performanceWeek = oneWeekAgo ? ((latest - oneWeekAgo) / oneWeekAgo) * 100 : null;

    // console.debug(`Processing ${symbol}: ${signal}, 24h: ${performance24h?.toFixed(2)}%, 7d: ${performanceWeek?.toFixed(2)}%`);

    // 👇 Fetch P/E ratio
    let peRatio = 0;
    let forwardPE = 0;
    let averageAnalystRating = "NA";
    let earningsTimestampStart = "NA";
    let epsCurrentYear = 0;
    let epsForward = 0;

    try {
        const quote = await yahooFinance.quote(symbol);
        peRatio = quote.trailingPE ?? 0;
        averageAnalystRating = quote.averageAnalystRating || "NA";
        forwardPE = quote.forwardPE || 0;
        epsCurrentYear = quote.epsCurrentYear || 0;
        epsForward = quote.epsForward || 0;
        earningsTimestampStart = quote.earningsTimestampStart && quote.earningsTimestampStart.toISOString().split("T")[0] || "NA";
    } catch (e) {
        console.warn(`Failed to get P/E ratio for ${symbol}:`);
    }
    return {
        symbol,
        name,
        signal,
        performance24h,
        performanceWeek,
        peRatio,
        forwardPE,
        averageAnalystRating,
        earningsTimestampStart,
        epsCurrentYear,
        epsForward
    };
};

const generateSignals = async () => {
    const results = await Promise.all(TICKERS.map(async ({ symbol, name }) => await getRsiSignal(symbol, name)));

    const buySymbols = results.filter(r => !!r && r.signal === Signal.Buy);
    const sellSymbol = results.filter(r => !!r && r.signal === Signal.Sell);

    let message = "";

    const tickerParser = (t) => `*${t.name}* | 1d: ${t.performance24h.toFixed(2)}% | 1w: ${t.performanceWeek.toFixed(2)}% | P/E: ${t.peRatio.toFixed(2)} (${t.forwardPE.toFixed(2)}) | EPS: ${t.epsCurrentYear.toFixed(2)} (${t.epsForward.toFixed(2)}) | earnings: ${t.earningsTimestampStart}`;

    if (buySymbols.length || sellSymbol.length) {
        message = `*RSI Signals - Timeframe ${interval}*\n\n`;
    }

    if (!!buySymbols.length) {
        message = `${message}📈 *${buySymbols.length} BUY SIGNAL DETECTED*\n${buySymbols.map(tickerParser).join(",\n\n")}`;
        message = `${message}________________\n`;
    }

    if (!!sellSymbol.length) {
        message = `${message}\n\n*📉 ${sellSymbol.length} SELL SIGNAL DETECTED*\n${sellSymbol.map(tickerParser).join(",\n\n")}`;
    }

    if (!message) return;

    await sendViaTelegram(message);
    console.table([...buySymbols, ...sellSymbol]);
};

const getSignals = async () => {
    console.log(`${new Date().toISOString()} - Processing signals...`);
    try {
        await generateSignals();
    } catch (e) {
        console.error(e);
    }
};

getSignals();
