import yahooFinance from "yahoo-finance2";
import { RSI } from 'technicalindicators';
import { parseDate } from "../utility/parsers.js";

export const getRSI = async (symbol, startingDate = undefined, interval = "1d") => {
    let _startingDate = startingDate;
    if (!_startingDate) {
        const now = new Date();
        _startingDate = new Date();
        _startingDate.setFullYear(now.getFullYear() - 2);
    }

    const period1 = parseDate(_startingDate);

    const result = await yahooFinance.historical(symbol, {
        period1: period1,
        interval: interval,
    });

    const closes = result.map(d => d.close).filter(Boolean);

    const rsiValues = RSI.calculate({ values: closes, period: 14 });
    const rsi = rsiValues.at(-1);
    return rsi;
}