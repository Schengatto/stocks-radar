import { RSI } from 'technicalindicators';

export function getSignals(data, params) {
    const { close } = data;
    const rsi = RSI.calculate({ period: params.rsiPeriod, values: close });

    const signals = [];

    for (let i = 1; i < rsi.length; i++) {
        const index = i + params.rsiPeriod - 1;
        if (index >= close.length) break;

        if (rsi[i - 1] < params.rsiBuy && rsi[i] >= params.rsiBuy) {
            signals.push({ type: 'buy', index });
        } else if (rsi[i - 1] > params.rsiSell && rsi[i] <= params.rsiSell) {
            signals.push({ type: 'sell', index });
        }
    }

    return signals;
}
