import { EMA, ROC, SMA } from 'technicalindicators';

export function getSignals(data, params) {
    const { close, volume } = data;
    const emaFast = EMA.calculate({ period: params.emaFastPeriod, values: close });
    const emaSlow = EMA.calculate({ period: params.emaSlowPeriod, values: close });
    const roc = ROC.calculate({ period: params.rocPeriod, values: close });
    const smaVolume = SMA.calculate({ period: params.volumeSmaPeriod, values: volume });

    const signals = [];

    for (let i = 1; i < close.length; i++) {
        const index = i + params.emaSlowPeriod - 1;
        if (index >= close.length) break;

        const crossoverUp = emaFast[i - 1] < emaSlow[i - 1] && emaFast[i] >= emaSlow[i];
        const crossoverDown = emaFast[i - 1] > emaSlow[i - 1] && emaFast[i] <= emaSlow[i];
        const volumeFilter = volume[index] > smaVolume[i];
        const momentumFilter = roc[i] > params.rocThreshold;

        if (crossoverUp && volumeFilter && momentumFilter) {
            signals.push({ type: 'buy', index });
        } else if (crossoverDown) {
            signals.push({ type: 'sell', index });
        }
    }

    return signals;
}
