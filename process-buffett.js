import fs from "fs";
import PDFDocument from "pdfkit";

import { fetchCompanyDataFromFMP } from './connectors/fmp.js';
import { getDescriptionFromSymbol, LARGE_CAPS, MID_CAPS } from './symbols/gettex.js';
import { getFinnhubSymbolFromYahoo } from "./symbols/yahoo-to-finnhub.js";
import { parseDate } from "./utility/parsers.js";
import { sleep } from "./utility/promise.js";
import { sendFileViaTelegram } from "./connectors/telegram.js";

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
    const { overview, earnings, balanceSheet, incomeStatement, cashFlowStatement } = data;

    const reasons = {
        passed: [],
        failed: [],
        unavailable: []
    };

    let score = 0;
    const maxScore = 6;

    try {
        // EPS Growth (trend, non crescita costante)
        const epsList = (earnings?.annualEarnings || [])
            .map(e => parseFloat(e.reportedEPS))
            .filter(eps => !isNaN(eps));
        const hasEPS = epsList.length >= 3;
        if (!hasEPS) {
            reasons.unavailable.push("EPS data not sufficient");
        } else {
            const first = epsList[0];
            const last = epsList[epsList.length - 1];
            if (last > first) {
                reasons.passed.push("EPS shows upward trend");
                score++;
            } else {
                reasons.failed.push("EPS does not show upward trend");
            }
        }

        // ROE > 10%
        const roe = parseFloat(overview?.roe ?? "NaN");
        const hasROE = !isNaN(roe);
        if (!hasROE) {
            reasons.unavailable.push("ROE not available");
        } else if (roe >= 0.10) {
            reasons.passed.push(`ROE acceptable (${roe.toFixed(2)})`);
            score++;
        } else {
            reasons.failed.push(`ROE too low (${roe.toFixed(2)})`);
        }

        // P/E < 25
        const pe = parseFloat(overview?.peNormalizedAnnual ?? "NaN");
        const hasPE = !isNaN(pe);
        if (!hasPE) {
            reasons.unavailable.push("P/E ratio not available");
        } else if (pe < 25) {
            reasons.passed.push(`P/E is reasonable (${pe.toFixed(2)})`);
            score++;
        } else {
            reasons.failed.push(`P/E too high (${pe.toFixed(2)})`);
        }

        // Debt < 2x Equity
        const bs = balanceSheet?.annualReports?.[0];
        const debt = bs ? parseFloat(bs.totalLiabilities) : NaN;
        const equity = bs ? parseFloat(bs.totalShareholderEquity) : NaN;
        const hasDebtEquity = bs && !isNaN(debt) && !isNaN(equity) && equity !== 0;
        if (!hasDebtEquity) {
            reasons.unavailable.push("Debt or equity not available or invalid");
        } else if (debt / equity < 2) {
            reasons.passed.push("Debt < 2x Equity");
            score++;
        } else {
            reasons.failed.push("Debt is too high relative to equity");
        }

        // Operating Margin > 10%
        const inc = incomeStatement?.annualReports?.[0];
        const netIncome = inc ? parseFloat(inc.netIncome) : NaN;
        const revenue = inc ? parseFloat(inc.totalRevenue) : NaN;
        const hasMargin = inc && !isNaN(netIncome) && !isNaN(revenue) && revenue > 0;
        const operatingMargin = hasMargin ? netIncome / revenue : NaN;
        if (!hasMargin) {
            reasons.unavailable.push("Net income or revenue not available");
        } else if (operatingMargin > 0.10) {
            reasons.passed.push(`Operating margin > 10% (${(operatingMargin * 100).toFixed(1)}%)`);
            score++;
        } else {
            reasons.failed.push(`Operating margin too low (${(operatingMargin * 100).toFixed(1)}%)`);
        }

        // Free Cash Flow positive
        const cf = cashFlowStatement?.annualReports?.[0];
        const fcf = cf ? parseFloat(cf.freeCashFlow ?? cf.operatingCashflow) : NaN;
        if (isNaN(fcf)) {
            reasons.unavailable.push("Free Cash Flow not available");
        } else if (fcf > 0) {
            reasons.passed.push("Free Cash Flow is positive");
            score++;
        } else {
            reasons.failed.push("Free Cash Flow is negative");
        }

        // Final decision logic
        if (reasons.unavailable.length >= 3) {
            return {
                signal: Signal.None,
                reasons
            };
        }

        if (score >= 5) return { signal: Signal.Buy, reasons };
        if (score <= 2) return { signal: Signal.Sell, reasons };
        return { signal: Signal.None, reasons };

    } catch (error) {
        console.error("Error during fundamental analysis:", error);
        return {
            signal: Signal.None,
            reasons: { error: error.message }
        };
    }
}

const generateReport = async (data) => {
    const doc = new PDFDocument({ margin: 50 });
    const today = parseDate(new Date());
    const outputPath = `./output/${today}_fundamentals_report.pdf`;
    doc.pipe(fs.createWriteStream(outputPath));

    doc.fontSize(20).font('Helvetica-Bold').text('Value Investing Report', {
        align: 'center'
    });
    doc.fontSize(16).font('Helvetica-Bold').text(today, {
        align: 'center'
    });
    doc.moveDown(1);

    doc.fontSize(12).font('Helvetica').text(`This report was generated by an automated system that applies fundamental analysis rules based on value investing principles (inspired by Warren Buffett and Benjamin Graham). Below is a quick guide to interpreting the main metrics used in the evaluation.`, {
        align: 'left'
    });
    doc.moveDown(1.5);

    doc.font('Helvetica-Bold').text('P/E Ratio (Price-to-Earnings)');
    doc.font('Helvetica').text(`A low P/E ratio may indicate undervaluation, while a very high one could suggest overvaluation or high growth expectations. In value investing, P/E < 15 is often preferred.`, {
        paragraphGap: 10
    });

    doc.font('Helvetica-Bold').text('EPS (Earnings Per Share)');
    doc.font('Helvetica').text(`Consistent and growing EPS over time is a positive sign. It indicates the company is generating increasing profits for shareholders.`, {
        paragraphGap: 10
    });

    doc.font('Helvetica-Bold').text('Debt-to-Equity Ratio');
    doc.font('Helvetica').text(`A lower ratio is generally safer. A value under 0.5 is ideal in value investing. High debt can expose the company to risks during downturns.`, {
        paragraphGap: 10
    });

    doc.font('Helvetica-Bold').text('Operating Margin');
    doc.font('Helvetica').text(`Higher operating margins indicate operational efficiency. Stable or growing margins suggest that the business has pricing power and cost control.`, {
        paragraphGap: 10
    });

    doc.moveDown(1.5);
    doc.font('Helvetica-Oblique').fontSize(10).fillColor('gray').text('Note: Some data may be unavailable due to missing or unreliable inputs from financial data providers.');

    doc.addPage();

    const writeEntry = (entry) => {
        doc.fontSize(16).text(`${entry.name}`, { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(10).text(`Symbol: ${entry.symbol}`);
        doc.text(`Signal: ${entry.signal}`);
        doc.moveDown();

        const printList = (title, list) => {
            doc.font('Helvetica-Bold').text(title);
            doc.font('Helvetica');
            if (list.length === 0) {
                doc.text('- None');
            } else {
                list.forEach(item => doc.text(`- ${item}`));
            }
            doc.moveDown();
        };

        printList('Passed:', entry.reasons.passed);
        printList('Failed:', entry.reasons.failed);
        printList('Unavailable:', entry.reasons.unavailable);

        doc.moveDown(1);
        doc.strokeColor('#ccc').lineWidth(1)
            .moveTo(doc.page.margins.left, doc.y)
            .lineTo(doc.page.width - doc.page.margins.right, doc.y)
            .stroke();
        doc.moveDown(1);
    };

    let entryCountOnPage = 0;
    data.forEach((entry, i) => {
        if (entryCountOnPage === 3) {
            doc.addPage();
            entryCountOnPage = 0;
        }

        writeEntry(entry);
        entryCountOnPage++;
    });

    doc.end();
    console.log(`✅ PDF generato: ${outputPath}`);
    return outputPath;
}

const doAnalysis = async () => {
    const results = [];

    for (let symbol of SYMBOLS) {
        const commonSymbol = PATCH_FMP[symbol] || getFinnhubSymbolFromYahoo(symbol);
        if (commonSymbol === "?") continue;

        try {
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

    const toSell = results.filter(x => x.signal === Signal.Sell);
    const toBuy = results.filter(x => x.signal === Signal.Buy);
    console.log("\n\nCompanies to SELL")
    console.log(toSell.map(x => `${x.symbol}: ${JSON.stringify(x.reasons)}`).join("\n"));

    console.log("\n\nCompanies to BUY")
    console.log(toBuy.map(x => `${x.symbol}: ${JSON.stringify(x.reasons)}`).join("\n"));

    const filePath = await generateReport(results);
    await sendFileViaTelegram(filePath, `Value Investing Report\nBuy signals: ${toBuy.length}\nSell signals: ${toSell.length}`);

    fs.writeFileSync(`./output/report-buffet-analysis${Date.now()}.json`, JSON.stringify(results, null, 2));
}

doAnalysis();

// (async () => {
//     const rawData = fs.readFileSync('./output/report-buffet-analysis.json', 'utf8');
//     const data = JSON.parse(rawData);
//     const filePath = await generateReport(data);
//     await sendFileViaTelegram(filePath, `Value Investing Report\nBuy signals: ${data.filter(x => x.signal === Signal.Buy).length}\nSell signals: ${data.filter(x => x.signal === Signal.Sell).length}`);
// })();
