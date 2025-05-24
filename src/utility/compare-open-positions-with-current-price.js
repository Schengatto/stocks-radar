import yahooFinance from 'yahoo-finance2';
import fs from "fs";

const compareWithCurrentPrice = async () => {
    const raw = fs.readFileSync("../output/buy_signals_backtest.json", "utf8");
    const signals = JSON.parse(raw);

    // Mappa per tenere solo l'ultimo segnale per simbolo
    const latestSignals = {};
    for (const signal of signals) {
        const prev = latestSignals[signal.symbol];
        if (!prev || new Date(signal.date) > new Date(prev.date)) {
            latestSignals[signal.symbol] = signal;
        }
    }

    const results = [];

    for (const [symbol, data] of Object.entries(latestSignals)) {
        try {
            const quote = await yahooFinance.quote(symbol);
            const currentPrice = quote.regularMarketPrice;

            const change = ((currentPrice - data.price) / data.price) * 100;

            results.push({
                symbol,
                buyDate: data.date,
                buyPrice: data.price,
                currentPrice,
                performance: change,
                changePercent: change.toFixed(2)
            });

        } catch (e) {
            console.error(`Error fetching quote for ${symbol}:`, e.message);
        }
    }

    // Puoi stampare o salvare su file
    console.table(results);

    // Ordina i risultati per performance decrescente
    const sorted = [...results].sort((a, b) => b.performance - a.performance);

    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    console.log("📈 Best performer:");
    console.log(best);

    console.log("📉 Worst performer:");
    console.log(worst);

    fs.writeFileSync("../output/buy_vs_current.json", JSON.stringify(results, null, 2));
    console.log("Comparison saved to buy_vs_current.json");
};

compareWithCurrentPrice();