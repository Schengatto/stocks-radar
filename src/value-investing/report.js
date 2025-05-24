import fs from "fs";
import PDFDocument from "pdfkit-table";
import { parseDate } from "../utility/parsers.js";
import { FUNDAMENTALS_CONFIG, Signal } from "./index.js";

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

export const generateReport = async (_data) => {
    let data = _data;
    if (data) {
        const rawData = fs.readFileSync(FUNDAMENTALS_CONFIG.dataFilePath, 'utf8');
        data = JSON.parse(rawData);
    }

    data.sort((a, b) => a.name.localeCompare(b.name));

    const buySignals = data.filter(x => x.signal === Signal.Positive);
    const sellSignals = data.filter(x => x.signal === Signal.Negative);

    const doc = new PDFDocument({ margin: 50 });
    const today = parseDate(new Date());
    const outputPath = FUNDAMENTALS_CONFIG.reportFilePath;
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

    doc.text(`The methodology follows these core principles:`);
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

    const writeEntry = async (entry) => {
        doc.fontSize(16).text(`${entry.name}`, { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(10).text(`Symbol: ${entry.symbol} | Signal: ${entry.signal.toUpperCase()} | RSI (Monthly timeframe): ${entry.rsi}`);
        doc.moveDown();

        if (entry.reasons) {
            const maxLen = Math.max(
                entry.reasons.passed?.length || 0,
                entry.reasons.failed?.length || 0,
                entry.reasons.unavailable?.length || 0
            );

            const tableData = {
                headers: ["Passed", "Failed", "Unavailable"],
                rows: Array.from({ length: maxLen }).map((_, i) => [
                    entry.reasons.passed?.[i] ?? "",
                    entry.reasons.failed?.[i] ?? "",
                    entry.reasons.unavailable?.[i] ?? ""
                ])
            };

            await doc.table(tableData, {
                width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
                columnSpacing: 3,
                prepareHeader: () => doc.font('Helvetica-Bold').fontSize(9),
                prepareRow: (row, i) => {
                    doc.font('Helvetica').fontSize(9);
                    row.options = { padding: 2 };
                },
            });

            doc.moveDown();
        }

        if (entry.fundamentals) {
            const f = entry.fundamentals;

            doc.font('Helvetica-Bold').text('Key Financials & EPS', { underline: true });
            doc.moveDown(0.5);

            const xLeft = doc.x;
            const xRight = doc.page.width / 2 + doc.page.margins.left / 2;
            const startY = doc.y;

            const tableData = {
                headers: ["Metric", "Value"],
                rows: [
                    ["P/E Ratio", f.pe?.toFixed(2) ?? 'N/A'],
                    ["ROE", f.roe?.toFixed(2) ?? 'N/A'],
                    ["Revenue", f.revenue?.toLocaleString() ?? 'N/A'],
                    ["Net Income", f.netIncome?.toLocaleString() ?? 'N/A'],
                    ["Free Cash Flow", f.freeCashFlow?.toLocaleString() ?? 'N/A'],
                    ["Total Liabilities", f.totalLiabilities?.toLocaleString() ?? 'N/A'],
                    ["Total Equity", f.totalEquity?.toLocaleString() ?? 'N/A'],
                    ["Current Ratio", f.currentRatio?.toFixed(2) ?? 'N/A'],
                    ["Interest Coverage", f.interestCoverage?.toFixed(2) ?? 'N/A'],
                    ["Debt/EBITDA", !f.debtToEBITDA || isNaN(f.debtToEBITDA) ? "N/A" : f.debtToEBITDA.toFixed(2)]
                ],
            };

            const tableStartY = doc.y;

            await doc.table(tableData, {
                x: xLeft,
                y: tableStartY,
                width: (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2 - 10,
                columnSpacing: 3,
                prepareHeader: () => doc.font('Helvetica-Bold').fontSize(9),
                prepareRow: (row, i) => {
                    doc.font('Helvetica').fontSize(9);
                    row.options = { padding: 2 };
                },
            });

            if (entry.news?.length) {
                doc.font('Helvetica-Bold').fontSize(10).text('Latest news:');
                doc.moveDown(0.5);

                entry.news.forEach((item, idx) => {
                    doc.font('Helvetica-Bold', 9)
                        .text(`• ${parseDate(item.datetime)} | [${item.sentiment.toUpperCase()}] | ${item.headline}`);
                    doc.font('Helvetica').fontSize(9);

                    if (item.summary) doc.text(item.summary);
                    if (item.url) doc.fillColor('blue').text(item.url, { underline: true });
                    doc.fillColor('black');

                    if (idx < entry.news.length - 1) doc.moveDown(1);
                });

                doc.moveDown(1);
            }

            const epsList = f.eps ?? [];
            if (epsList.length > 0) {
                const epsX = xRight;
                const epsY = tableStartY;

                doc.font('Helvetica-Bold').fontSize(9).text('EPS (Annual):', epsX, epsY);
                doc.font('Helvetica').fontSize(9);
                epsList.forEach((e, i) => {
                    const line = `• ${e.year ?? 'N/A'}: ${e.value ?? 'N/A'}`;
                    doc.text(line, epsX, epsY + 15 + i * 12);
                });
            }

            doc.moveDown(1);
        }
    };
    doc.moveDown(2);

    let entryCountOnPage = 0;
    for (let entry of data) {
        if (entryCountOnPage === 1) {
            doc.addPage();
            entryCountOnPage = 0;
        }
        await writeEntry(entry);
        entryCountOnPage++;
    }

    doc.end();
    console.log(`✅ PDF created: ${outputPath}`);
    return outputPath;
};
