// backtest-simulation.js
import dotenv from "dotenv";
import fs from "fs";
import yahooFinance from "yahoo-finance2";
import { LARGE_CAPS } from "../symbols/gettex.js";
import { getSignals as emaCrossoverSignals } from "../strategies/ema-crossover.js";
import { getSignals as rsiSignals } from "../strategies/rsi.js";

dotenv.config();

const interval = process.env.INTERVAL || "1wk";
const years = 5;
const buyAmount = 1000;
const factor = parseFloat(process.env.FACTOR || 1);
const stopLossThreshold = parseFloat(process.env.STOP_LOSS || -1);
const strategy = process.env.STRATEGY || "rsi";
const isAggregatingBuy = process.env.AGGREGATING_BUY === "true";

const strategyMap = {
  emaCrossover: emaCrossoverSignals,
  rsi: rsiSignals
};

const strategyParams = {
  emaCrossover: {
    emaFastPeriod: 20,
    emaSlowPeriod: 50,
    rocPeriod: 20,
    rocThreshold: 2,
    volumeSmaPeriod: 20,
  },
  rsi: { rsiPeriod: 14, rsiBuy: 30, rsiSell: 70 },
};

const STOCK_SYMBOLS = [...LARGE_CAPS];

const generateBacktest = async () => {
  const now = new Date();
  const startingDate = new Date();
  startingDate.setFullYear(now.getFullYear() - years);

  const trades = [];
  const openTrades = [];
  const holdTrades = [];
  let maxCapitalUsed = 0;

  for (const symbol of STOCK_SYMBOLS) {
    try {
      const result = await yahooFinance.historical(symbol, {
        period1: startingDate.toISOString().split("T")[0],
        interval,
      });

      const close = result.map(d => d.close);
      const open = result.map(d => d.open);
      const low = result.map(d => d.low);
      const volume = result.map(d => d.volume);
      const dates = result.map(d => new Date(d.date));

      const data = { close, volume };
      const signals = strategyMap[strategy](data, strategyParams[strategy]);

      const historicalLength = dates.length;
      const holdPerformance = ((close[historicalLength - 1] - open[0]) / open[0]) * 100;
      const holdDurationDays = Math.round((dates[historicalLength - 1] - dates[0]) / (1000 * 60 * 60 * 24));
      holdTrades.push({
        symbol,
        buyDate: dates[0].toISOString(),
        buyPrice: open[0],
        sellDate: dates[historicalLength - 1].toISOString(),
        sellPrice: close[historicalLength - 1],
        performance: holdPerformance,
        durationDays: holdDurationDays,
        profit: Number(Number(buyAmount * holdPerformance / 100).toFixed(2)),
      });

      let currentBuy = null;

      for (const signal of signals) {
        const i = signal.index;
        const date = dates[i];
        const openPrice = open[i];
        const lowPrice = low[i];

        const isBuy = signal.type === "buy" && (!currentBuy || isAggregatingBuy);
        const isSell = signal.type === "sell" && currentBuy;
        const isStopLoss = currentBuy && ((lowPrice - currentBuy.price) / currentBuy.price) <= stopLossThreshold;
        const isStopLossFactor = currentBuy && (((lowPrice - currentBuy.price) / currentBuy.price) * factor <= -1);

        if (isBuy) {
          const amount = buyAmount * factor;
          maxCapitalUsed += buyAmount;
          currentBuy = {
            date: currentBuy ? currentBuy.date : date,
            price: currentBuy ? ((currentBuy.price * currentBuy.amount + openPrice * amount) / (currentBuy.amount + amount)) : openPrice,
            amount: currentBuy ? currentBuy.amount + amount : amount,
          };
        } else if (isStopLossFactor) {
          const duration = Math.round((date - currentBuy.date) / (1000 * 60 * 60 * 24));
          const profit = -100;
          maxCapitalUsed -= currentBuy.amount / factor;
          trades.push({
            symbol,
            buyDate: currentBuy.date.toISOString(),
            buyPrice: currentBuy.price,
            sellDate: date.toISOString(),
            sellPrice: currentBuy.price * (1 + stopLossThreshold),
            performance: profit,
            durationDays: duration,
            exitReason: "stop_loss_factor",
            profit: Number((currentBuy.amount * profit / 100).toFixed(2))
          });
          currentBuy = null;
        } else if (isStopLoss) {
          const duration = Math.round((date - currentBuy.date) / (1000 * 60 * 60 * 24));
          const profit = stopLossThreshold * 100;
          maxCapitalUsed -= currentBuy.amount / factor;
          trades.push({
            symbol,
            buyDate: currentBuy.date.toISOString(),
            buyPrice: currentBuy.price,
            sellDate: date.toISOString(),
            sellPrice: currentBuy.price * (1 + stopLossThreshold),
            performance: profit,
            durationDays: duration,
            exitReason: "stop_loss",
            profit: Number((currentBuy.amount * profit / 100).toFixed(2))
          });
          currentBuy = null;
        } else if (isSell) {
          const perf = ((openPrice - currentBuy.price) / currentBuy.price) * 100;
          const duration = Math.round((date - currentBuy.date) / (1000 * 60 * 60 * 24));
          maxCapitalUsed -= currentBuy.amount / factor;
          trades.push({
            symbol,
            buyDate: currentBuy.date.toISOString(),
            buyPrice: currentBuy.price,
            sellDate: date.toISOString(),
            sellPrice: openPrice,
            performance: +perf.toFixed(2),
            durationDays: duration,
            exitReason: signal.type,
            amount: currentBuy.amount,
            profit: Number((currentBuy.amount * perf / 100).toFixed(2))
          });
          currentBuy = null;
        }
      }

      if (currentBuy) {
        const todayPrice = open[open.length - 1];
        const performance = ((todayPrice - currentBuy.price) / currentBuy.price) * 100;
        openTrades.push({ symbol, ...currentBuy, todayPrice, performance: Number(performance.toFixed(2)) });
      }

    } catch (e) {
      console.error(`Error processing ${symbol}:`, e.message);
    }
  }

  const avgPerf = trades.reduce((sum, t) => sum + t.performance, 0) / trades.length;
  const avgDuration = trades.reduce((sum, t) => sum + t.durationDays, 0) / trades.length;
  const totalProfit = trades.reduce((tot, trade) => tot + trade.profit, 0);
  const avgPerfHoldTrades = holdTrades.reduce((sum, t) => sum + t.performance, 0) / trades.length;

  console.table(trades);
  console.log("\nSUMMARY");
  console.log(`- Average performance: ${avgPerf.toFixed(2)}%`);
  console.log(`- Average duration: ${avgDuration.toFixed(1)} days`);
  console.log(`- Max Capital used at the same time: € ${maxCapitalUsed}`);
  console.log(`- Total profit € ${totalProfit.toFixed(2)}`);
  console.log(`- Total profit x${((totalProfit / maxCapitalUsed) + 1).toFixed(2)}`);
  console.log(`- Open trades: ${openTrades.length} | € ${openTrades.length * buyAmount}`);
  console.log(`\nMARKET PERFORMANCE`);
  console.log(`- Average performance: ${avgPerfHoldTrades.toFixed(2)}%`);
  console.log(`- Max Capital used at the same time: € ${buyAmount * STOCK_SYMBOLS.length}`);
  console.log(`- Total profit € ${holdTrades.reduce((tot, trade) => tot + trade.profit, 0).toFixed(2)}`);
  console.log(`- Total profit x${((holdTrades.reduce((tot, trade) => tot + trade.profit, 0) / maxCapitalUsed) + 1).toFixed(2)}`);
  console.log(`- Symbols that didn't perform well ${(holdTrades.filter(t => t.performance <= 0).length / holdTrades.length * 100).toFixed(2)}%`);

  fs.writeFileSync("./output/strategy_trades.json", JSON.stringify(trades, null, 2));
  console.log("\nResults saved to output/strategy_trades.json");
};

generateBacktest();
