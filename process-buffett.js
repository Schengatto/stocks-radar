import fs from "fs";
import { fetchCompanyDataFromFMP } from './connectors/fmp.js';
import { getDescriptionFromSymbol, LARGE_CAPS, MID_CAPS } from './symbols/gettex.js';
import { sleep } from "./utility/promise.js";
import { getFinnhubSymbolFromYahoo } from "./symbols/yahoo-to-finnhub.js";

const Signal = {
    Buy: "buy",
    Sell: "sell",
    None: "none",
}

const SYMBOLS = [
    ...LARGE_CAPS,
    ...MID_CAPS,
];

const PATCH_FMP = {
    "TSM": "TSM",
    "PAH3.DE": "POAHY",
    "UMG.AS": "UNVGY",
    "AKRBP.OL": "AKAAF",
    "AUTO.OL": "?",
    "002466.SZ": "?",
    "2269.T": "MEJHY",
    "1800.HK": "CUCSY",
    "CAR.AX": "?",
    "8012.T": "?",
    "FCT.MI": "FNCNF",
    "SUM.NZ": "?",
    "DNLM.L": "DNLMY",
    "DOKA.SW": "?",
    "SRRK": "?",
    "SATS.OL": "SPASF",
    "WB": "WB",
    "HUMBLE.ST": "?",
    "BARN.SW": "?",
    "AKRO": "AKRO",
    "0842.HK": "LCHIF",
    "ACAST.ST": "?",
    "NCAB.ST": "?",
    "VNV.ST": "VSTKF",
};

function analyzeFundamentals(data) {
    const { overview, earnings, balanceSheet, incomeStatement } = data;

    const reasons = {
        passed: [],
        failed: [],
        unavailable: []
    };

    try {
        // EPS Growth
        const epsList = (earnings?.annualEarnings || [])
            .map(e => parseFloat(e.reportedEPS))
            .filter(eps => !isNaN(eps));
        const hasEPS = epsList.length > 1;
        const epsGrowing = hasEPS && epsList.every((val, i, arr) => i === 0 || val >= arr[i - 1]);
        if (!hasEPS) reasons.unavailable.push("EPS data not available");

        // ROE
        const roe = parseFloat(overview?.roe ?? "NaN");
        const hasROE = !isNaN(roe);
        if (!hasROE) reasons.unavailable.push("ROE not available");

        // P/E
        const pe = parseFloat(overview?.peNormalizedAnnual ?? "NaN");
        const hasPE = !isNaN(pe);
        if (!hasPE) reasons.unavailable.push("P/E ratio not available");

        // Debt/Equity
        const bs = balanceSheet?.annualReports?.[0];
        const debt = bs ? parseFloat(bs.totalLiabilities) : NaN;
        const equity = bs ? parseFloat(bs.totalShareholderEquity) : NaN;
        const hasDebtEquity = bs && !isNaN(debt) && !isNaN(equity) && equity !== 0;
        if (!hasDebtEquity) reasons.unavailable.push("Debt or equity not available or invalid");

        // Operating Margin
        const inc = incomeStatement?.annualReports?.[0];
        const netIncome = inc ? parseFloat(inc.netIncome) : NaN;
        const revenue = inc ? parseFloat(inc.totalRevenue) : NaN;
        const hasMargin = inc && !isNaN(netIncome) && !isNaN(revenue) && revenue > 0;
        if (!hasMargin) reasons.unavailable.push("Net income or revenue not available or invalid");

        // If any required data is missing, abort analysis
        if (reasons.unavailable.length > 0) {
            return {
                signal: Signal.None,
                reasons
            };
        }

        // Apply rules
        if (epsGrowing) reasons.passed.push("EPS is growing");
        else reasons.failed.push("EPS is not consistently growing");

        if (roe > 0.15) reasons.passed.push("ROE > 15%");
        else reasons.failed.push(`ROE too low (${roe.toFixed(2)})`);

        if (pe < 20) reasons.passed.push("P/E < 20");
        else reasons.failed.push(`P/E too high (${pe.toFixed(2)})`);

        if (debt < equity * 1.5) reasons.passed.push("Debt < 1.5x Equity");
        else reasons.failed.push("Debt is too high relative to equity");

        const operatingMargin = netIncome / revenue;
        if (operatingMargin > 0.15) reasons.passed.push("Operating margin > 15%");
        else reasons.failed.push(`Operating margin too low (${(operatingMargin * 100).toFixed(1)}%)`);

        // Final signal
        const allPassed = reasons.failed.length === 0;
        const isBuy = allPassed;
        const isSell = reasons.failed.length > 2; // More than 2 major failures

        if (isBuy) return { signal: Signal.Buy, reasons };
        if (isSell) return { signal: Signal.Sell, reasons };
        return { signal: Signal.None, reasons };

    } catch (error) {
        console.error("Error during fundamental analysis:", error);
        return {
            signal: Signal.None,
            reasons: { error: error.message }
        };
    }
}

(async () => {
    const results = [];

    for (let symbol of SYMBOLS) {
        const commonSymbol = PATCH_FMP[symbol] || getFinnhubSymbolFromYahoo(symbol);
        // if (commonSymbol === "?") continue;

        try {
            // const data = await fetchCompanyData(finnhubSymbol);
            // const data = await fetchCompanyDataFromYahoo(symbol);
            const data = await fetchCompanyDataFromFMP(commonSymbol);

            const stockResult = data
                ? analyzeFundamentals(data)
                : { signal: Signal.None, reasons: { unavailable: "Error fetching data" } };

            results.push({ symbol, name: getDescriptionFromSymbol(symbol), ...stockResult });
        } catch (e) {
            console.error(`Errore su ${symbol} (${commonSymbol}):`, e.message);
        }
        sleep(500);
    }

    console.log(`Analizzati ${results.length}/${SYMBOLS.length}`);


    fs.writeFileSync("./output/report-buffet-analysis.json", JSON.stringify(results, null, 2));

    const toSell = results.filter(x => x.signal === Signal.Sell);
    const toBuy = results.filter(x => x.signal === Signal.Buy);
    console.log("\n\nCompanies to SELL")
    console.log(toSell.map(x => `${x.symbol}: ${JSON.stringify(x.reasons)}`).join("\n"));

    console.log("\n\nCompanies to BUY")
    console.log(toBuy.map(x => `${x.symbol}: ${JSON.stringify(x.reasons)}`).join("\n"));
})();