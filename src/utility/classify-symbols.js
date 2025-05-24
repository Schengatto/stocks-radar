import fs from "fs";
import yahooFinance from 'yahoo-finance2';
import { ALL_NASDAQ_SYMBOLS } from "../symbols/nasdaq.js";

const classifyMarketCaps = async () => {
    const smallCaps = [];
    const midCaps = [];
    const largeCaps = [];

    for (const {symbol, name} of ALL_NASDAQ_SYMBOLS) {
        try {
            const quote = await yahooFinance.quoteSummary(symbol, { modules: ['price'] });
            const marketCap = quote.price.marketCap;

            if (!marketCap) {
                console.warn(`Market cap not found for ${name}(${symbol})`);
                continue;
            }

            if (marketCap < 2e9) {
                smallCaps.push({name, symbol});
            } else if (marketCap < 1e10) {
                midCaps.push({name, symbol});
            } else {
                largeCaps.push({name, symbol});
            }

        } catch (error) {
            console.error(`Error retrieving market cap for ${name}(${symbol}):`, error.message);
        }
    }

     const prefix = "NASDAQ";
    fs.writeFileSync(`../output/${prefix}_small_caps.json`, JSON.stringify(smallCaps, null, 2));
    fs.writeFileSync(`../output/${prefix}_mid_caps.json`, JSON.stringify(midCaps, null, 2));
    fs.writeFileSync(`../output/${prefix}_large_caps.json`, JSON.stringify(largeCaps, null, 2));

    console.log("Classification written to files.");
};

classifyMarketCaps();
