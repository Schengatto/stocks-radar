import dotenv from "dotenv";
import { RSI } from 'technicalindicators';
import yahooFinance from 'yahoo-finance2';

import { sendViaTelegram } from "./connectors/telegram.js";

import { getDescriptionFromSymbol, STOCK_SYMBOLS } from "./symbols/gettex.js";
import { getFinnhubSymbolFromYahoo } from "./symbols/yahoo-to-finnhub.js";
import { parseDate } from "./utility/parsers.js";
import { getNews } from "./utility/news.js";

const Rating = {
    Low: "low",
    Medium: "medium",
    High: "high",
};

const now = new Date();
const startingDate = new Date();
startingDate.setFullYear(now.getFullYear() - 1);

dotenv.config();

const interval = process.env.INTERVAL || "1d";

const getPeRating = async (peRatio) => {
    if (peRatio <= 0 || peRatio > 55) {
        return Rating.Low;
    } else if (peRatio < 5 || peRatio >= 40) {
        return Rating.Medium;
    } else {
        return Rating.High;
    }
};

const getEpsRating = async (epsCurrentYear) => {
    if (epsCurrentYear <= 3) {
        return Rating.Low;
    } else if (epsCurrentYear < 7) {
        return Rating.Medium;
    } else {
        return Rating.High;
    }
};

const getRsiSignal = async (symbol) => {
    const result = await yahooFinance.historical(symbol, {
        period1: parseDate(startingDate),
        interval: interval,
    });

    const displayName = getDescriptionFromSymbol(symbol);

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
        earningsTimestampStart = quote.earningsTimestampStart && parseDate(quote.earningsTimestampStart) || "NA";
    } catch (e) {
        console.warn(`Failed to get P/E ratio for ${symbol}:`, e.message);
        peRatio = 0;
    }
    const peRating = await getPeRating(peRatio);
    const epsRating = await getEpsRating(epsCurrentYear);

    const closes = result.map(d => d.close).filter(Boolean);

    // --- Price performance calculation ---
    const latest = closes.at(-1);
    const oneDayAgo = closes.at(-2);
    const oneWeekAgo = closes.at(-6); // 7 calendar days = ~5 market days, adjust accordingly

    const performance24h = oneDayAgo ? ((latest - oneDayAgo) / oneDayAgo) * 100 : null;
    const performanceWeek = oneWeekAgo ? ((latest - oneWeekAgo) / oneWeekAgo) * 100 : null;

    const rsiValues = RSI.calculate({ values: closes, period: 14 });
    // const prev = rsiValues.at(-2);
    const rsi = rsiValues.at(-1);

    return {
        symbol,
        displayName,
        peRatio: Number(peRatio.toFixed(2)),
        forwardPE,
        peRating,
        averageAnalystRating,
        earningsTimestampStart,
        epsCurrentYear,
        epsForward,
        epsRating,
        performance24h: Number(performance24h.toFixed(2)),
        performanceWeek: Number(performanceWeek.toFixed(2)),
        rsi
    };
};

const generateSignals = async () => {
    const results = await Promise.all(STOCK_SYMBOLS.map(async (s) => await getRsiSignal(s)));
    const best = results.filter(r => r.peRating === Rating.High && r.epsRating === Rating.High && r.rsi < 45).sort((a, b) => b.rsi - a.rsi);

    const symbolParser = (s) => `*${s.displayName}*\nP/E: ${s.peRatio.toFixed(2)} (${s.forwardPE.toFixed(2)}) | EPS: ${s.epsCurrentYear.toFixed(2)} (${s.epsForward.toFixed(2)}) | RSI: ${s.rsi}`;
    const newsParser = (n) => `${parseDate(n.datetime)}* - ${n.sentiment} - ${n.headline}*\n${n.summary ? n.summary + "\n" : ""}${n.url}`;

    for (let c of best) {
        const finnhubSymbol = getFinnhubSymbolFromYahoo(c.symbol);
        const newsList = await getNews(finnhubSymbol);

        let message = `*Undervalued company*:\n${symbolParser(c)}\n\n${newsList.map(newsParser).join("\n\n")}`;

        sendViaTelegram(message);
        console.log(message);
    }

    // console.table(results.filter(r => r.peRating === Rating.High && r.epsRating === Rating.High));
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
