import fs from "fs";
import yahooFinance from 'yahoo-finance2';
import { RSI } from 'technicalindicators';
import { STOCK_SYMBOLS } from "../symbols/gettex.js";

console.log(`[${new Date().toISOString()}] Fetching previous RSI BUY signals...`);

const length = 14;
const upperLine = 70;
const lowerLine = 30;

const backtestBuySignals = async () => {
    const now = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(now.getMonth() - 3);

    const buySignals = [];

    for (const symbol of STOCK_SYMBOLS) {
        try {
            const result = await yahooFinance.historical(symbol, {
                period1: threeMonthsAgo.toISOString().split("T")[0],
                interval: "1d",
            });

            const closes = result.map(d => d.close).filter(Boolean);
            const dates = result.map(d => d.date);

            const rsiValues = RSI.calculate({ values: closes, period: length });

            const events = [];

            for (let i = 1; i < rsiValues.length; i++) {
                const prev = rsiValues[i - 1];
                const curr = rsiValues[i];
                const index = i + (closes.length - rsiValues.length);

                if (prev < lowerLine && curr >= lowerLine) {
                    events.push({
                        type: "buy",
                        symbol,
                        date: dates[index],
                        price: closes[index]
                    });
                } else if (prev > upperLine && curr <= upperLine) {
                    events.push({
                        type: "sell",
                        symbol,
                        date: dates[index],
                        price: closes[index]
                    });
                }
            }

            // Estrarre solo l'ultimo buy che NON è seguito da un sell
            let lastBuy = null;
            for (let i = 0; i < events.length; i++) {
                if (events[i].type === "buy") {
                    lastBuy = events[i];
                } else if (events[i].type === "sell") {
                    lastBuy = null; // se c’è un sell dopo un buy, invalida il buy
                }
            }

            if (lastBuy) {
                buySignals.push({
                    symbol: lastBuy.symbol,
                    date: lastBuy.date.toISOString(),
                    price: lastBuy.price
                });
            }

        } catch (e) {
            console.error(`Error processing ${symbol}:`, e.message);
        }
    }

    fs.writeFileSync("./output/buy_signals_backtest.json", JSON.stringify(buySignals, null, 2));
    console.log("Buy signals saved to buy_signals_backtest.json");
};

backtestBuySignals();