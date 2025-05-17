import axios from 'axios';
import fs from 'fs';
import { GETTEX_MAPPING, STOCK_SYMBOLS } from "../symbols/gettex.js";

// Inserisci qui la tua API Key di Finnhub
const FINNHUB_API_KEY = 'd0jhdupr01ql09hsg55gd0jhdupr01ql09hsg560';

const getDescriptionFromSymbol = (symbol) => {
    const desc = Object.entries(GETTEX_MAPPING).find(([k, v]) => v === symbol)?.[0];
    return desc ? `${desc} (${symbol})` : symbol;
};

const searchFinnhubSymbol = async (query) => {
    try {
        const res = await axios.get('https://finnhub.io/api/v1/search', {
            params: {
                q: query,
                token: FINNHUB_API_KEY
            }
        });
        return res.data.result;
    } catch (err) {
        console.error(`❌ Error fetching data for ${query}:`, err.message);
        return [];
    }
};

const mapSymbols = async () => {
    const matched = {};
    const unmatched = [];

    for (const yahooSymbol of TO_MAP) {
        const desc = getDescriptionFromSymbol(yahooSymbol);
        const results = await searchFinnhubSymbol(desc);

        if (results.length > 0) {
            const bestMatch = results[0];
            matched[yahooSymbol] = bestMatch.symbol;
            console.log(`✅ ${yahooSymbol} -> ${bestMatch.symbol} (${bestMatch.description})`);
        } else {
            unmatched.push(yahooSymbol);
            console.log(`❌ ${yahooSymbol} -> No match found`);
        }
    }

    fs.writeFileSync('matched.json', JSON.stringify(matched, null, 2), 'utf-8');
    fs.writeFileSync('unmatched.json', JSON.stringify(unmatched, null, 2), 'utf-8');

    console.log(`\n✅ Saved ${Object.keys(matched).length} matched symbols to matched.json`);
    console.log(`🚫 Saved ${unmatched.length} unmatched symbols to unmatched.json`);
};

mapSymbols();
