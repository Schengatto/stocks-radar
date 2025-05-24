import fs from "fs";

import { sendViaTelegram } from "./connectors/telegram.js";
import { NASDAQ_LARGE_CAPS } from "./symbols/nasdaq.js";
import { getRSI } from "./tech-indicators/rsi.js";
import { getNews, newsTelegramParser } from "./utility/news.js";
import { parseDate } from "./utility/parsers.js";
import { sleep } from "./utility/promise.js";

const TICKERS = [
    ...NASDAQ_LARGE_CAPS,
    // ...NASDAQ_MID_CAPS,
].sort();

const saveToFile = async (results) => {
    fs.writeFileSync(`./output/report-news-${parseDate(new Date())}.json`, JSON.stringify(results, null, 2));
};

const generateReport = async (results) => {
    const data = results || JSON.parse(fs.readFileSync(`./output/report-news-${parseDate(new Date())}.json`, 'utf8')).filter(e => !!e.news.length);

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
    const elementToProcess = TICKERS.length;
    let counter = 1;

    for (let { symbol, name } of TICKERS) {
        console.log(`${counter}/${elementToProcess}| Processing ${name} (${symbol})`);

        try {
            const rsi = await getRSI(symbol);
            const newsList = await getNews(symbol, 5, new Date()) || [];
            const news = newsList;
            if (news.length) {
                results.push({ symbol, name, rsi, news });
            }
        } catch (e) {
            console.error(`Errore su ${anme} (${symbol}):`, e.message);
        }
        counter += 1;
        await saveToFile(results);
        await sleep(500);
    }
    console.log(`Processed ${results.length}/${elementToProcess}`);
    await generateReport(results);
};

processNews();