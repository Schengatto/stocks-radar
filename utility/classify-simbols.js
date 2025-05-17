import fs from "fs";
import yahooFinance from 'yahoo-finance2';
import { STOCK_SYMBOLS } from "../symbols/gettex.js";

const classifyMarketCaps = async () => {
    const smallCaps = [];
    const midCaps = [];
    const largeCaps = [];

    for (const symbol of STOCK_SYMBOLS) {
        try {
            const quote = await yahooFinance.quoteSummary(symbol, { modules: ['price'] });
            const marketCap = quote.price.marketCap;

            if (!marketCap) {
                console.warn(`Market cap not found for ${symbol}`);
                continue;
            }

            if (marketCap < 2e9) {
                smallCaps.push(symbol);
            } else if (marketCap < 1e10) {
                midCaps.push(symbol);
            } else {
                largeCaps.push(symbol);
            }

        } catch (error) {
            console.error(`Error retrieving market cap for ${symbol}:`, error.message);
        }
    }

    fs.writeFileSync("../output/small_caps.json", JSON.stringify(smallCaps, null, 2));
    fs.writeFileSync("../output/mid_caps.json", JSON.stringify(midCaps, null, 2));
    fs.writeFileSync("../output/large_caps.json", JSON.stringify(largeCaps, null, 2));

    console.log("Classification written to files.");
};

classifyMarketCaps();
