import fs from "fs";

import { getDescriptionFromSymbol, LARGE_CAPS, MID_CAPS } from './symbols/gettex.js';
import { getFinnhubSymbolFromYahoo } from "./symbols/yahoo-to-finnhub.js";
import { getRSI } from "./tech-indicators/rsi.js";
import { getNews, newsTelegramParser } from "./utility/news.js";
import { sleep } from "./utility/promise.js";
import { parseDate } from "./utility/parsers.js";
import { sendViaTelegram } from "./connectors/telegram.js";

const SYMBOLS = [
    ...new Set([
        ...LARGE_CAPS,
        // ...MID_CAPS,
    ])
].sort();

const saveToFile = async (results) => {
    fs.writeFileSync(`./output/report-news-${parseDate(new Date())}.json`, JSON.stringify(results, null, 2));
};

const generateReport = async (results) => {
    const data = results || JSON.parse(fs.readFileSync('./output/report-buffet-analysis-2025-05-20.json', 'utf8')).filter(e => !!e.news.length);

    const today = parseDate(new Date());

    const entriesWithPositiveNews = data
        .filter(entry => entry.news?.some(article => article.sentiment === "positive" && parseDate(article.datetime) === today))
        .map(e => ({ ...e, news: e.news.filter(n => n.sentiment === "positive" && parseDate(n.datetime) === today) }));

    const entriesWithNegativeNews = data
        .filter(entry => entry.news?.some(article => article.sentiment === "negative" && parseDate(article.datetime) === today))
        .map(e => ({ ...e, news: e.news.filter(n => n.sentiment === "negative" && parseDate(n.datetime) === today) }));

    console.log("Positive")
    console.log(entriesWithPositiveNews.map(x => ({ name: x.name, news: x.news.map(n => n.headline) })));

    console.log("Nagative")
    console.log(entriesWithNegativeNews.map(x => ({ name: x.name, news: x.news.map(n => n.headline) })));

    for (const positive of entriesWithPositiveNews) {
        await sendViaTelegram(`*Today News ${today}*\n*${positive.name}*\n${positive.news.map(newsTelegramParser).join("\n")}`);
        await sleep(1000);
    }

    for (const negative of entriesWithNegativeNews) {
        await sendViaTelegram(`*Today News ${today}*\n*${negative.name}*\n${negative.news.map(newsTelegramParser).join("\n")}`);
        await sleep(1000);
    }
};

const processNews = async () => {
    const results = [];
    const elementToProcess = SYMBOLS.length;
    let counter = 1;

    for (let symbol of SYMBOLS) {
        const finnhubSymbol = getFinnhubSymbolFromYahoo(symbol);
        if (finnhubSymbol === "?") continue;
        console.log(`${counter}/${elementToProcess}| Processing ${symbol} (${finnhubSymbol})`);

        try {
            const rsi = await getRSI(symbol);
            const newsList = await getNews(finnhubSymbol, 5, new Date()) || [];
            const news = newsList;
            if (news.length) {
                results.push({ symbol, name: getDescriptionFromSymbol(symbol), rsi, news });
            }
        } catch (e) {
            console.error(`Errore su ${symbol} (${finnhubSymbol}):`, e.message);
        }
        counter += 1;
        await saveToFile(results);
        await sleep(500);
    }

    console.log(`Analizzati ${results.length}/${elementToProcess}`);

    await generateReport(results);
};

// processNews();
generateReport();