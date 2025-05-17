import axios from 'axios';
import fs from "fs";

const BASE_URL = 'https://symbol-search.tradingview.com/symbol_search/v3/';
const LIMIT = 1000;

const headers = {
    'accept': '*/*',
    'accept-language': 'en-GB,en;q=0.9,it-IT;q=0.8,it;q=0.7,en-US;q=0.6',
    'origin': 'https://www.tradingview.com',
    'priority': 'u=1, i',
    'referer': 'https://www.tradingview.com/',
    'sec-ch-ua': '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
};

async function fetchAllSymbols() {
    let allSymbols = [];
    let start = 0;
    let symbolsRemaining = Infinity;

    while (symbolsRemaining > 0) {
        const url = `${BASE_URL}?text=&hl=1&exchange=GETTEX&lang=en&search_type=stocks&start=${start}&domain=production&sort_by_country=US&promo=true`;

        try {
            const response = await axios.get(url, { headers });
            const data = response.data;

            if (!data.symbols || !Array.isArray(data.symbols)) {
                console.error('Formato non valido nella risposta:', data);
                break;
            }

            const symbols = data.symbols.map(item => item.description);
            allSymbols.push(...symbols);

            symbolsRemaining = data.symbols_remaining;
            start += LIMIT;

            console.log(`Scaricati ${symbols.length} simboli. Rimasti: ${symbolsRemaining}`);
        } catch (err) {
            console.error(`Errore durante la richiesta da start=${start}:`, err.response?.status || err.message);
            break;
        }
    }

    return allSymbols;
}

// Esegui lo script
fetchAllSymbols()
    .then(symbols => {
        console.log('\nTotale simboli estratti:', symbols.length);
        console.log(JSON.stringify(symbols, null, 2));
        fs.writeFileSync('symbols.json', JSON.stringify(symbols, null, 2));
    })
    .catch(error => {
        console.error('Errore generale:', error);
    });
