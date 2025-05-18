import dotenv from "dotenv";
import fs from "fs";
import { RSI } from 'technicalindicators';
import yahooFinance from 'yahoo-finance2';

import { CRYPTO, ETF, LARGE_CAPS, MID_CAPS } from "./symbols/gettex.js";

dotenv.config();
console.log(`[${new Date().toISOString()}] Starting RSI signals...`);

const interval = process.env.INTERVAL || "1wk";
if (!interval) console.warn("INTERVAL not defined!");

const length = 14;
const upperLine = 70;
const lowerLine = 30;

const years = 5;

const isAggregatingBuy = true;
const buyAmount = 200;
// Set it to 1 to disable it
const factor = 1;

// Set it to -1 to disable it
const stopLossThreshold = -1.00;

const STOCK_SYMBOLS = [
    ...LARGE_CAPS,
    // ...MID_CAPS,
    // ...ETF,
    // ...CRYPTO
];

const generateClosedTradesPerformance = async () => {
    const now = new Date();
    const startingDate = new Date();
    startingDate.setFullYear(now.getFullYear() - years);

    const trades = [];
    let openTrades = [];
    let maxCapitalUsed = 0;
    const holdTrades = [];

    for (const symbol of STOCK_SYMBOLS) {
        try {
            const result = await yahooFinance.historical(symbol, {
                period1: startingDate.toISOString().split("T")[0],
                interval: interval,
            });

            const open = result.map(d => d.open).filter(Boolean);
            const lows = result.map(d => d.low).filter(Boolean);
            const closes = result.map(d => d.close).filter(Boolean);
            const dates = result.map(d => d.date);
            const historicalLength = dates.length;

            const holdPerformance = ((closes[historicalLength - 1] - open[0]) / open[0]) * 100;
            const holdDurationDays = Math.round((dates[historicalLength - 1] - dates[0]) / (1000 * 60 * 60 * 24));
            holdTrades.push({
                symbol,
                buyDate: dates[0].toISOString(),
                buyPrice: open[0],
                sellDate: dates[historicalLength - 1].toISOString(),
                sellPrice: closes[historicalLength - 1],
                performance: holdPerformance,
                durationDays: holdDurationDays,
                profit: Number(Number(buyAmount * holdPerformance / 100).toFixed(2)),
            });

            const rsiValues = RSI.calculate({ values: open, period: length });

            let currentBuy = undefined;

            for (let i = 1; i < rsiValues.length; i++) {
                const currentRsi = rsiValues[i];
                const previousRsi = rsiValues[i - 1];
                const index = i + length;
                const currentDate = dates[index];
                const currentOpen = open[index];
                const currentLow = lows[index];

                let isBuy;
                let isStopLoss;
                let isStopLossFactor;
                let isSell;

                if (isAggregatingBuy) {
                    isBuy = previousRsi < lowerLine && currentRsi >= lowerLine;
                } else {
                    isBuy = !currentBuy && previousRsi < lowerLine && currentRsi >= lowerLine;
                }

                isStopLoss = currentBuy && ((currentLow - currentBuy.price) / currentBuy.price) <= stopLossThreshold;
                isStopLossFactor = currentBuy && (((currentLow - currentBuy.price) / currentBuy.price) * factor <= -1);
                isSell = currentBuy && previousRsi > upperLine && currentRsi <= upperLine;

                if (isBuy) {
                    const amount = buyAmount * factor;
                    maxCapitalUsed += buyAmount;
                    currentBuy = {
                        date: currentDate,
                        price: currentBuy ? (currentBuy.price + currentOpen) / 2 : currentOpen,
                        amount: currentBuy ? amount + currentBuy.amount : amount,
                    }
                    continue;
                } else if (isStopLossFactor) {
                    const durationDays = Math.round((currentDate - currentBuy.date) / (1000 * 60 * 60 * 24));
                    const profit = -100;
                    maxCapitalUsed -= currentBuy.amount / factor;
                    trades.push({
                        symbol,
                        buyDate: currentBuy.date.toISOString(),
                        buyPrice: currentBuy.price,
                        sellDate: currentDate.toISOString(),
                        sellPrice: currentBuy.price - (currentBuy.price * stopLossThreshold),
                        performance: profit,
                        durationDays,
                        exitReason: "stop_loss_factor",
                        profit: Number(Number(currentBuy.amount * profit / 100).toFixed(2)),
                    });
                    currentBuy = undefined;
                } else if (isStopLoss) {
                    const durationDays = Math.round((currentDate - currentBuy.date) / (1000 * 60 * 60 * 24));
                    const profit = (stopLossThreshold * 100);
                    maxCapitalUsed -= currentBuy.amount / factor;
                    trades.push({
                        symbol,
                        buyDate: currentBuy.date.toISOString(),
                        buyPrice: currentBuy.price,
                        sellDate: currentDate.toISOString(),
                        sellPrice: currentBuy.price - (currentBuy.price * stopLossThreshold),
                        performance: profit,
                        durationDays,
                        exitReason: "stop_loss",
                        profit: Number(Number(currentBuy.amount * profit / 100).toFixed(2)),
                    });
                    currentBuy = undefined;
                } else if (isSell) {
                    const perf = ((currentOpen - currentBuy.price) / currentBuy.price) * 100;
                    const durationDays = Math.round((currentDate - currentBuy.date) / (1000 * 60 * 60 * 24));
                    maxCapitalUsed -= currentBuy.amount / factor;
                    trades.push({
                        symbol,
                        buyDate: currentBuy.date.toISOString(),
                        buyPrice: currentBuy.price,
                        sellDate: currentDate.toISOString(),
                        sellPrice: currentOpen,
                        performance: +perf.toFixed(2),
                        durationDays,
                        exitReason: "rsi",
                        amount: currentBuy.amount,
                        profit: Number(Number(currentBuy.amount * perf / 100).toFixed(2)),
                    });
                    currentBuy = undefined;
                }
            }

            if (currentBuy) {
                const todayPrice = open[open.length - 1]
                const performance = ((todayPrice - currentBuy.price) / currentBuy.price) * 100;
                openTrades.push({ symbol, ...currentBuy, todayPrice, performance: Number(performance.toFixed(2)) });
            }
        } catch (e) {
            console.error(`Error processing ${symbol}:`, e.message);
        }
    }

    const sorted = [...trades].sort((a, b) => b.performance - a.performance);

    console.log(`Results in ${years} years`);
    console.table(trades);

    console.log("\n- Top 3 performers:");
    console.table(sorted.slice(0, 3));

    console.log("\n- Worst 3 performers:");
    console.table(sorted.slice(-3));

    console.log(`\n- Open trades (not closed by sell signal or stop loss): ${openTrades.length} | € ${openTrades.length * buyAmount}`);
    console.table(openTrades);

    const avgPerf = trades.reduce((sum, t) => sum + t.performance, 0) / trades.length;
    const avgDuration = trades.reduce((sum, t) => sum + t.durationDays, 0) / trades.length;

    console.log("\nParams");
    console.log(`- Years: ${years}`);
    console.log(`- Factor: x${factor}`);
    console.log(`- Stop Loss: ${stopLossThreshold === -1 ? "off" : (stopLossThreshold * 100).toFixed(2) + "%"}`);

    console.log("\nYOUR PERFORMANCE");
    console.log(`- Number of trades: ${trades.length}`);
    console.log(`- Open positions (no SELL): ${openTrades.length} | € ${openTrades.length * buyAmount}`);
    console.log(`- Average performance: ${avgPerf.toFixed(2)}%`);
    console.log(`- Average duration: ${avgDuration.toFixed(1)} days`);
    console.log(`- Max Capital used at the same time: € ${maxCapitalUsed}`);
    console.log(`- Total profit € ${trades.reduce((tot, trade) => tot + trade.profit, 0).toFixed(2)}`);
    console.log(`- Total profit x${((trades.reduce((tot, trade) => tot + trade.profit, 0) / maxCapitalUsed) + 1).toFixed(2)}`);
    console.log(`- Trades with loss: ${((trades.filter(t => t.performance <= 0).length / holdTrades.length) * 100).toFixed(2)}%`);

    // console.log(`\n- Holding trades (trades in case the stock was bought the first day and sold the last)`);
    //console.table(holdTrades);

    const avgPerfHoldTrades = holdTrades.reduce((sum, t) => sum + t.performance, 0) / trades.length;
    const buyAndHoldCapital = buyAmount * STOCK_SYMBOLS.length;

    console.log("\nMARKET PERFORMANCE");
    console.log(`- Average performance: ${avgPerfHoldTrades.toFixed(2)}%`);
    console.log(`- Max Capital used at the same time: € ${buyAndHoldCapital}`);
    console.log(`- Total profit € ${holdTrades.reduce((tot, trade) => tot + trade.profit, 0).toFixed(2)}`);
    console.log(`- Total profit x${((holdTrades.reduce((tot, trade) => tot + trade.profit, 0) / buyAndHoldCapital) + 1).toFixed(2)}`);
    console.log(`- Symbols that didn't perform well ${((holdTrades.filter(t => t.performance <= 0).length / holdTrades.length) * 100).toFixed(2)}%`);
    // console.table(holdTrades.filter(t => t.performance <= 0));

    fs.writeFileSync("./output/closed_trades_performance.json", JSON.stringify(trades, null, 2));
    console.log("\nClosed trades performance saved to closed_trades_performance.json");
    return trades;
};

generateClosedTradesPerformance();