import fs from "fs";
import PDFDocument from "pdfkit";

import { fetchCompanyDataFromFMP } from './connectors/fmp.js';
import { sendFileViaTelegram } from "./connectors/telegram.js";
import { getDescriptionFromSymbol, LARGE_CAPS, MID_CAPS } from './symbols/gettex.js';
import { getFinnhubSymbolFromYahoo } from "./symbols/yahoo-to-finnhub.js";
import { getRSI } from "./tech-indicators/rsi.js";
import { getNews } from "./utility/news.js";
import { parseDate } from "./utility/parsers.js";

const Signal = {
    Buy: "buy",
    Sell: "sell",
    None: "none",
}

const SYMBOLS = [
    ...new Set([
        ...LARGE_CAPS,
        ...MID_CAPS,
    ])
].sort();

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
    const {
        overview,
        earnings,
        balanceSheet,
        incomeStatement,
        cashFlowStatement,
        metrics
    } = data;

    const reasons = {
        passed: [],
        failed: [],
        unavailable: []
    };

    let score = 0;
    const maxScore = 9;

    try {
        // EPS trend (non costante)
        const epsList = (earnings?.annualEarnings || [])
            .map(e => parseFloat(e.reportedEPS))
            .filter(eps => !isNaN(eps));
        const hasEPS = epsList.length >= 3;
        if (!hasEPS) {
            reasons.unavailable.push("EPS data insufficient");
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
        if (isNaN(roe)) {
            reasons.unavailable.push("ROE not available");
        } else if (roe >= 0.10) {
            reasons.passed.push(`ROE acceptable (${roe.toFixed(2)})`);
            score++;
        } else {
            reasons.failed.push(`ROE too low (${roe.toFixed(2)})`);
        }

        // P/E < 25
        const pe = parseFloat(overview?.peNormalizedAnnual ?? "NaN");
        if (isNaN(pe)) {
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
        if (!bs || isNaN(debt) || isNaN(equity) || equity === 0) {
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
        if (!inc || isNaN(netIncome) || isNaN(revenue) || revenue <= 0) {
            reasons.unavailable.push("Net income or revenue not available");
        } else {
            const operatingMargin = netIncome / revenue;
            if (operatingMargin > 0.10) {
                reasons.passed.push(`Operating margin > 10% (${(operatingMargin * 100).toFixed(1)}%)`);
                score++;
            } else {
                reasons.failed.push(`Operating margin too low (${(operatingMargin * 100).toFixed(1)}%)`);
            }
        }

        // Free Cash Flow > 0
        const cf = cashFlowStatement?.annualReports?.[0];
        const fcf = cf ? parseFloat(cf.freeCashFlow) : NaN;
        if (isNaN(fcf)) {
            reasons.unavailable.push("Free Cash Flow not available");
        } else if (fcf > 0) {
            reasons.passed.push("Free Cash Flow is positive");
            score++;
        } else {
            reasons.failed.push("Free Cash Flow is negative");
        }

        // Current Ratio > 1.5
        const currentRatio = parseFloat(metrics?.currentRatio ?? "NaN");
        if (isNaN(currentRatio)) {
            reasons.unavailable.push("Current Ratio not available");
        } else if (currentRatio > 1.5) {
            reasons.passed.push(`Current Ratio > 1.5 (${currentRatio.toFixed(2)})`);
            score++;
        } else {
            reasons.failed.push(`Current Ratio too low (${currentRatio.toFixed(2)})`);
        }

        // Interest Coverage > 3
        const interestCoverage = parseFloat(metrics?.interestCoverage ?? "NaN");
        if (isNaN(interestCoverage)) {
            reasons.unavailable.push("Interest Coverage not available");
        } else if (interestCoverage > 3) {
            reasons.passed.push(`Interest Coverage > 3 (${interestCoverage.toFixed(2)})`);
            score++;
        } else {
            reasons.failed.push(`Interest Coverage too low (${interestCoverage.toFixed(2)})`);
        }

        // Debt/EBITDA < 3
        const debtToEBITDA = parseFloat(metrics?.debtToEBITDA ?? "NaN");
        if (isNaN(debtToEBITDA)) {
            reasons.unavailable.push("Debt/EBITDA not available");
        } else if (debtToEBITDA < 3) {
            reasons.passed.push(`Debt/EBITDA < 3 (${debtToEBITDA.toFixed(2)})`);
            score++;
        } else {
            reasons.failed.push(`Debt/EBITDA too high (${debtToEBITDA.toFixed(2)})`);
        }

        // Final decision logic
        if (reasons.unavailable.length >= 3) {
            return {
                signal: Signal.None,
                reasons
            };
        }

        if (score >= 7) return { signal: Signal.Buy, reasons };
        if (score <= 3) return { signal: Signal.Sell, reasons };
        return { signal: Signal.None, reasons };

    } catch (error) {
        console.error("Error during fundamental analysis:", error);
        return {
            signal: Signal.None,
            reasons: { error: error.message }
        };
    }
}

const printList = (doc, title, list) => {
    doc.font('Helvetica-Bold').text(title);
    doc.font('Helvetica');
    if (list.length === 0) {
        doc.text('- None');
    } else {
        list.forEach(item => doc.text(`- ${item}`));
    }
    doc.moveDown();
};

const generateReport = async (data) => {
    data.sort((a, b) => a.name.localeCompare(b.name));

    const buySignals = data.filter(x => x.signal === Signal.Buy);
    const sellSignals = data.filter(x => x.signal === Signal.Sell);

    const doc = new PDFDocument({ margin: 50 });
    const today = parseDate(new Date());
    const outputPath = `./output/${today}_fundamentals_report.pdf`;
    doc.pipe(fs.createWriteStream(outputPath));

    // --- Cover Page ---
    doc.fontSize(20).font('Helvetica-Bold').text('Value Investing Report', {
        align: 'center'
    });
    doc.fontSize(16).font('Helvetica-Bold').text(today, {
        align: 'center'
    });
    doc.moveDown(1.5);

    doc.fontSize(12).font('Helvetica').text(
        `This report is automatically generated using a Value Investing approach inspired by Warren Buffett and Benjamin Graham. ` +
        `The analysis evaluates large and mid-cap companies based on a set of fundamental criteria to identify potentially undervalued opportunities with strong financial health.`,
        { align: 'left' }
    );
    doc.moveDown();

    doc.text(
        `The methodology follows these core principles:`
    );
    doc.moveDown(0.5);
    doc.list([
        "A consistent and upward trend in Earnings Per Share (EPS), indicating sustainable growth.",
        "A Return on Equity (ROE) above 10%, showing efficient use of shareholder capital.",
        "A Price-to-Earnings (P/E) ratio below 25, favoring reasonably priced stocks.",
        "A Debt-to-Equity ratio below 2, ensuring a manageable financial structure.",
        "An operating margin above 10%, reflecting operational efficiency.",
        "Positive Free Cash Flow (FCF), confirming the ability to generate excess cash.",
        "A Current Ratio above 1.5, indicating liquidity and short-term financial strength.",
        "An Interest Coverage ratio above 3, showing the ability to meet debt obligations.",
        "A Debt/EBITDA ratio below 3, highlighting manageable leverage."
    ]);
    doc.moveDown();

    doc.text(
        `Each company receives a score based on the number of criteria met. A score of 7 or more triggers a BUY signal, ` +
        `while 3 or fewer triggers a SELL signal. Intermediate scores are classified as HOLD or No Signal.`
    );
    doc.moveDown();

    doc.font('Helvetica-Oblique').fillColor('gray').fontSize(10).text(
        `Note: Data availability may vary depending on the financial sources used. Absence of key data can prevent a full assessment.`
    );
    doc.moveDown();
    doc.text(
        `This report is intended for informational purposes and does not constitute financial advice.`
    );
    doc.fillColor('black');

    // --- Buy Signals Page ---
    doc.addPage();
    printList(doc, "Positive Outlook", buySignals.map(s => s.name));

    // --- Sell Signals Page ---
    doc.addPage();
    printList(doc, "Negative Outlook", sellSignals.map(s => s.name));

    // --- Detailed Company Analysis ---
    doc.addPage();

    const writeEntry = (entry) => {
        doc.fontSize(16).text(`${entry.name}`, { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(10).text(`Symbol: ${entry.symbol}`);
        doc.text(`Signal: ${entry.signal.toUpperCase()}`);
        doc.text(`RSI: ${entry.rsi}`);
        doc.moveDown();

        if (entry.reasons.passed?.length) printList(doc, 'Passed:', entry.reasons.passed);
        if (entry.reasons.failed?.length) printList(doc, 'Failed:', entry.reasons.failed);
        if (entry.reasons.unavailable?.length) printList(doc, 'Unavailable:', entry.reasons.unavailable);

        if (entry.news?.length) {
            doc.font('Helvetica-Bold').text('Latest news:');
            doc.moveDown(0.5);
            entry.news.forEach((item, idx) => {
                doc.font('Helvetica-Bold', 10).text(`• ${parseDate(item.datetime)} | [${item.sentiment.toUpperCase()}] | ${item.headline}`);
                doc.fontSize(10).font('Helvetica');
                if (item.summary) doc.text(`${item.summary}`);
                if (item.url) doc.text(`${item.url}`, { underline: true })
                if (idx < entry.news.length - 1) doc.moveDown(1);
            });
            doc.moveDown(2);
        }

        doc.moveDown(1);
        doc.strokeColor('#ccc').lineWidth(1)
            .moveTo(doc.page.margins.left, doc.y)
            .lineTo(doc.page.width - doc.page.margins.right, doc.y)
            .stroke();
        doc.moveDown(1);
    };

    let entryCountOnPage = 0;
    data.forEach((entry, i) => {
        if (entryCountOnPage === 1) {
            doc.addPage();
            entryCountOnPage = 0;
        }

        writeEntry(entry);
        entryCountOnPage++;
    });

    doc.end();
    console.log(`✅ PDF created: ${outputPath}`);
    return outputPath;
}

const saveToFile = async (results) => {
    fs.writeFileSync(`./output/report-buffet-analysis-${parseDate(new Date())}.json`, JSON.stringify(results, null, 2));
};

const doAnalysis = async () => {
    const results = [];
    const elementToProcess = SYMBOLS.length;
    let counter = 1;

    for (let symbol of SYMBOLS) {
        const finnhubSymbol = getFinnhubSymbolFromYahoo(symbol);
        const commonSymbol = PATCH_FMP[symbol] || finnhubSymbol;
        if (commonSymbol === "?") continue;
        console.log(`${counter}/${elementToProcess}| Processing ${symbol} (${commonSymbol})`);

        try {
            const data = await fetchCompanyDataFromFMP(commonSymbol);

            const stockResult = data
                ? analyzeFundamentals(data)
                : { signal: Signal.None, reasons: { unavailable: "Error fetching data" } };

            const rsi = await getRSI(symbol);
            const newsList = await getNews(finnhubSymbol) || [];
            const news = newsList;

            results.push({ symbol, name: getDescriptionFromSymbol(symbol), ...stockResult, rsi, news });
        } catch (e) {
            console.error(`Errore su ${symbol} (${commonSymbol}):`, e.message);
        }
        counter += 1;
        await saveToFile(results);
    }

    console.log(`Analizzati ${results.length}/${elementToProcess}`);

    const toSell = results.filter(x => x.signal === Signal.Sell);
    const toBuy = results.filter(x => x.signal === Signal.Buy);
    console.log("\n\nCompanies to SELL")
    console.log(toSell.map(x => `${x.symbol}: ${JSON.stringify(x.reasons)}`).join("\n"));

    console.log("\n\nCompanies to BUY")
    console.log(toBuy.map(x => `${x.symbol}: ${JSON.stringify(x.reasons)}`).join("\n"));

    const filePath = await generateReport(results);
    await sendFileViaTelegram(filePath, `Value Investing Report\nBuy signals: ${toBuy.length}\nSell signals: ${toSell.length}`);
}

doAnalysis();

// (async () => {
//     const rawData = fs.readFileSync('./output/report-buffet-analysis-2025-05-20.json', 'utf8');
//     const data = JSON.parse(rawData);
//     const filePath = await generateReport(data);
//     await sendFileViaTelegram(filePath, `Value Investing Report\nBuy signals: ${data.filter(x => x.signal === Signal.Buy).length}\nSell signals: ${data.filter(x => x.signal === Signal.Sell).length}`);
// })();
