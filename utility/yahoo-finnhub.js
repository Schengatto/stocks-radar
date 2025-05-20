import fs from "fs";

import { getDescriptionFromSymbol, STOCK_SYMBOLS } from "../symbols/gettex.js";
import { FINNHUB_SYMBOLS } from "../symbols/finnhub.js";

const PATCH_FINNHUB = {
    "TSM": "TSMWF",
    "MAA": "MAA",
    "ITUB": "ITUB",
    "WB": "WEIBF",
    "1211.HK": "BYDDY",
    "1810.HK": "XIACY",
    "BAYN.DE": "BAYRY",
    "SIE.DE": "SIEGY",
    "NOVO-B.CO": "NVO",
    "ALV.DE": "ALIZY",
    "PAH3.DE": "POAHY",
    "DTE.DE": "DTEGY",
    "MUV2.DE": "MURGY",
    "S63.SI": "SGGKY",
    "UMG.AS": "UMGNF",
    "002466.SZ": "TQLCF",
    "3998.HK": "BSDGY",
    "ITMG.JK": "PTIZF",
    "2269.T": "MJHLY",
    "1179.HK": "HTHT",
    "0293.HK": "CPCAY",
    "1800.HK": "CCCGY",
    "7735.T": "DINRF",
    "0788.HK": "CHWRF",
    "3331.HK": "VDAHY",
    "BKT.MC": "BKNIY",
    "BOLSAA.MX": "BOMXF",
    "9706.T": "JAIRF",
    "9021.T": "WJRYF",
    "WWI.OL": "WILYY",
    "CAR.AX": "CARZF",
    "WN.TO": "WNGRF",
    "CP.TO": "CP",
    "2587.T": "STBFY",
    "2281.T": null,
    "9613.T": "NTDTY",
    "IRPC.BK": "IRPSY",
    "OMN.JO": "OABI",
    "TEP.PA": "TLPFY",
    "0434.HK": "BOYAF",
    "1U1.DE": "TLGHY",
    "FCT.MI": "FCCMF",
    "DAE.SW": "DAWIF",
    "CLN.SW": "CLZNY",
    "ABG.OL": "ABGSF",
    "DOKA.SW": "DESNF",
    "PIRC.MI": "PLLIF",
    "SATS.OL": "STSCY",
    "1672.HK": "ASCLF",
    "VALMT.HE": "VOYJF",
    "BCVN.SW": "BQCNF",
    "BLX.TO": "BRLXF",
    "BCHN.SW": "BCHHF",
    "BARN.SW": "BRRLF",
    "BEN.AX": "BXRBF",
    "0842.HK": "LIECF",
    "INW.MI": "IFSUF",
    "MF.PA": "WNDLF",
    "KRU.WA": "KRKKF",
    "ACO-Y.TO": "ACLLF"
};

export const missingSymbols = () => {
    const notFound = [];
    let mapping = {};
    for (const yahooSymbol of STOCK_SYMBOLS) {
        // const symbol = getFinnhubSymbolFromYahoo(yahooSymbol);
        let finnhubSymbol = FINNHUB_SYMBOLS.filter(x => x.type === "Common Stock").find(x => x.symbol === yahooSymbol)?.symbol;

        if (!finnhubSymbol) {
            finnhubSymbol = PATCH_FINNHUB[yahooSymbol];
        }

        if (!finnhubSymbol) {
            const yahooDesc = getDescriptionFromSymbol(yahooSymbol);
            const query1 = yahooDesc.split(" (")[0];
            const query2 = query1.split(" ").slice(0, 2).join(" ");
            finnhubSymbol =
                FINNHUB_SYMBOLS.find(x => x.description === query1)?.symbol ||
                FINNHUB_SYMBOLS.find(x => x.description.includes(query1)?.symbol) ||
                FINNHUB_SYMBOLS.find(x => x.description.includes(query2)?.symbol) ||
                "?";
            notFound.push({ yahooSymbol, desc: yahooDesc, finnhubSymbol, query: query1 });
        }
        mapping = { ...mapping, [yahooSymbol]: finnhubSymbol };
    }

    console.table(notFound);


    console.table(Object.entries(mapping).filter(([k, v]) => v === "?").map(([k, v]) => ({ k, v, title: getDescriptionFromSymbol(k) })));

    fs.writeFileSync("../output/yahoo-finnhub-mapping.json", JSON.stringify(mapping, null, 2));
};

missingSymbols();