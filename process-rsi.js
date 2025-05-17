import dotenv from "dotenv";
import { RSI } from 'technicalindicators';
import yahooFinance from 'yahoo-finance2';

import { sendViaTelegram } from "./connectors/telegram.js";
import { getDescriptionFromSymbol, GETTEX_MAPPING, STOCK_SYMBOLS } from "./symbols/gettex.js";

const Signal = {
    Buy: "buy",
    Sell: "sell",
    None: "none",
}

dotenv.config();
console.log(`[${new Date().toISOString()}] Starting RSI signals...`);

const interval = process.env.INTERVAL || "1d";

const length = 14;
const upperLine = 70;
const lowerLine = 30;

const getRsiSignal = async (symbol) => {
    const result = await yahooFinance.historical(symbol, {
        period1: '2020-01-01',
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
    const displayName = getDescriptionFromSymbol(symbol);
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
        console.warn(`Failed to get P/E ratio for ${symbol}:`, e.message);
    }
    return {
        symbol,
        signal,
        performance24h,
        performanceWeek,
        displayName,
        peRatio,
        forwardPE,
        averageAnalystRating,
        earningsTimestampStart,
        epsCurrentYear,
        epsForward
    };
};

const generateSignals = async () => {
    const results = await Promise.all(STOCK_SYMBOLS.map(async (s) => await getRsiSignal(s)));

    const buySymbols = results.filter(r => r.signal === Signal.Buy);
    const sellSymbol = results.filter(r => r.signal === Signal.Sell);

    let message = "";

    const symbolParser = (s) => `*${s.displayName}* | 1d: ${s.performance24h.toFixed(2)}% | 1w: ${s.performanceWeek.toFixed(2)}% | P/E: ${s.peRatio.toFixed(2)} (${s.forwardPE.toFixed(2)}) | EPS: ${s.epsCurrentYear.toFixed(2)} (${s.epsForward.toFixed(2)}) | earnings: ${s.earningsTimestampStart}`;

    if (!!buySymbols.length) {
        message = `📈 *${buySymbols.length} BUY SIGNAL DETECTED*\n${buySymbols.map(symbolParser).join(",\n\n")}`;
        message = `________________\n`;
    }

    if (!!sellSymbol.length) {
        message = `${message}\n\n*📉 ${sellSymbol.length} SELL SIGNAL DETECTED*\n${sellSymbol.map(symbolParser).join(",\n\n")}`;
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
