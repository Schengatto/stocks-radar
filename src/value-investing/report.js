import fs from "fs";
import PDFDocument from "pdfkit-table";
import yahooFinance from "yahoo-finance2";
import puppeteer from "puppeteer";

import { FUNDAMENTALS_CONFIG, Signal } from "./index.js";
import { parseDate, parseInUSD } from "../utility/parsers.js";
import { readDataFromFile } from "../utility/file.js";

async function getMonthlyData(symbol) {
    const to = new Date();
    const from = new Date();
    from.setFullYear(to.getFullYear() - 10); // ultimi 10 anni

    const result = await yahooFinance.historical(symbol, {
        period1: parseDate(from),
        period2: parseDate(to),
        interval: '1mo',
    });

    return result.map(row => ({
        date: parseDate(row.date),
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close
    }));
}

function aggregateAnnual(data) {
    const yearlyData = {};

    data.forEach(d => {
        const year = new Date(d.date).getFullYear();

        if (!yearlyData[year]) {
            yearlyData[year] = {
                date: `${year}-12-31`,
                open: d.open,
                high: d.high,
                low: d.low,
                close: d.close
            };
        } else {
            yearlyData[year].high = Math.max(yearlyData[year].high, d.high);
            yearlyData[year].low = Math.min(yearlyData[year].low, d.low);
            yearlyData[year].close = d.close; // ultima chiusura dell'anno
        }
    });

    return Object.values(yearlyData).sort((a, b) => new Date(a.date) - new Date(b.date));
}

const generateCandlestickChart = async (symbol) => {
    const monthlyData = await getMonthlyData(symbol);
    const data = aggregateAnnual(monthlyData);

    const trace = {
        x: data.map(d => (new Date(d.date)).getFullYear().toString()),
        open: data.map(d => d.open),
        high: data.map(d => d.high),
        low: data.map(d => d.low),
        close: data.map(d => d.close),
        type: 'candlestick',
        name: symbol,
        increasing: { line: { color: 'green' } },
        decreasing: { line: { color: 'red' } }
    };

    const layout = {
        title: `${symbol} - Price last 10 years`,
        xaxis: { type: 'category', tickangle: -45, tickformat: '%Y', rangeslider: { visible: false } },
        yaxis: { title: 'Price' },
        margin: {
            t: 50,   // top
            b: 100,   // bottom
            l: 50,   // left
            r: 20    // right
        }
    };

    const htmlContent = `
        <html>
            <head>
                <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
            </head>
            <body>
                <div id="chart" style="width:800px;height:500px;"></div>
                <script>
                    const data = ${JSON.stringify([trace])};
                    const layout = ${JSON.stringify(layout)};
                    Plotly.newPlot('chart', data, layout).then(() => {
                        window.setTimeout(() => window.callPhantom('ready'), 500);
                    });
                </script>
            </body>
        </html>
    `;

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const chartElement = await page.$('#chart');
    const buffer = await chartElement.screenshot({ encoding: 'base64' });

    await browser.close();

    return buffer; // base64 string (PNG)
}

export const generateReport = async (_data) => {
    let data = _data || readDataFromFile(FUNDAMENTALS_CONFIG.dataFilePath);
    data.sort((a, b) => a.name.localeCompare(b.name));

    const buySignals = data.filter(x => x.signal === Signal.Positive);
    const sellSignals = data.filter(x => x.signal === Signal.Negative);
    const noneSignals = data.filter(x => x.signal === Signal.None);

    const doc = new PDFDocument({ margin: 50 });
    const today = parseDate(new Date());
    const outputPath = FUNDAMENTALS_CONFIG.reportFilePath;
    doc.pipe(fs.createWriteStream(outputPath));

    // --- Cover Page ---
    doc.fontSize(20).font('Helvetica-Bold').text('Value Investing Report', { align: 'center' });
    doc.fontSize(16).font('Helvetica-Bold').text(today, { align: 'center' });
    doc.moveDown(1.5);

    doc.fontSize(12).font('Helvetica').text(
        `This report is generated using a modernized Value Investing methodology inspired by Warren Buffett and Benjamin Graham. ` +
        `Each company is evaluated based on its financial strength, profitability, operational efficiency, and whether the stock appears undervalued relative to its intrinsic value.`,
        { align: 'left' }
    );
    doc.moveDown();

    doc.text(`The scoring model is based on the following key criteria:`);
    doc.moveDown(0.5);
    doc.list([
        "Consistent growth in Earnings Per Share (EPS), indicating durable earning power.",
        "Return on Invested Capital (ROIC) above 10%, reflecting efficient capital allocation.",
        "Gross profit margin above 60%, which may suggest a durable competitive advantage.",
        "Price-to-Free-Cash-Flow (P/FCF) below 15, signaling valuation relative to cash generation.",
        "Positive Free Cash Flow (FCF), confirming the ability to generate excess cash.",
        "Low capital expenditure relative to FCF, indicating scalable business operations.",
        "Dividend payout ratio below 60%, balancing shareholder return and reinvestment.",
        "Debt-to-Equity ratio below 2, reflecting a conservative capital structure.",
        "Operating margin above 10%, indicating operational efficiency.",
        "Current ratio above 1.5, demonstrating short-term financial health.",
        "Interest coverage above 3, ensuring ability to service debt obligations.",
        "Debt/EBITDA ratio below 3, supporting sustainable leverage.",
        "Return on tangible assets, assessing real asset productivity.",
        "Low proportion of intangibles to total assets (below 20%), favoring asset quality.",
        "Market price below the Graham Number, a classical fair value benchmark.",
        "Intrinsic value (based on DCF) above current price, indicating undervaluation.",
        "EPS compound annual growth rate (CAGR) above 10%.",
        "Overall balance sheet clarity and consistency."
    ], {
        bulletRadius: 1.5,
        textIndent: 10,
        bulletIndent: 0,
        align: 'left'
    });
    doc.moveDown();

    doc.text(
        `Each company is assigned a score based on how many of these criteria are met. A score of 14 or more results in a POSITIVE signal (potential opportunity), ` +
        `while a score of 5 or fewer results in a NEGATIVE signal. Intermediate scores are considered NEUTRAL.`
    );
    doc.moveDown();

    doc.font('Helvetica-Oblique').fillColor('gray').fontSize(10).text(
        `Note: The analysis depends on the availability of up-to-date financial data. Missing data can reduce the completeness of the evaluation.`
    );
    doc.moveDown();
    doc.text(
        `This report is for informational purposes only and should not be considered financial advice or a recommendation to buy or sell any securities.`
    );
    doc.fillColor('black');

    if (buySignals.length) {
        // --- Buy Signals Page ---
        doc.addPage();
        doc.font('Helvetica-Bold').text("Positive Outlook");
        doc.font('Helvetica');
        buySignals.forEach(ticker => {
            doc
                .fontSize(10)
                .fillColor('blue')
                .text(`${ticker.name}`, {
                    goTo: `${ticker.symbol}-detail`,
                    underline: true
                });
        });
    }

    if (sellSignals.length) {
        // --- Sell Signals Page ---
        doc.addPage();
        doc.font('Helvetica-Bold').text("Negative Outlook");
        doc.font('Helvetica');
        sellSignals.forEach(ticker => {
            doc
                .fontSize(10)
                .fillColor('blue')
                .text(`${ticker.name}`, {
                    goTo: `${ticker.symbol}-detail`,
                    underline: true,
                });
        });
    }

    // --- Detailed Company Analysis ---
    doc.addPage();

    const writeEntry = async (entry) => {
        const startX = doc.x;
        const companySummary = entry.companySummary;
        doc.fontSize(16).text(`${entry.name} (${entry.symbol})`, { underline: true, destination: `${entry.symbol}-detail` });
        doc.fontSize(8).text(`Sector: ${companySummary?.sector} | Industry: ${companySummary?.industry}`);
        doc.moveDown(0.3);
        doc.fontSize(6).text(companySummary?.longBusinessSummary);
        doc.moveDown(1);

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
                prepareHeader: () => doc.font('Helvetica-Bold').fontSize(7),
                prepareRow: (row, i) => {
                    doc.font('Helvetica').fontSize(7);
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
                    ["Revenue", f.revenue ? parseInUSD(f.revenue) : 'N/A'],
                    ["Net Income", f.netIncome ? parseInUSD(f.netIncome) : 'N/A'],
                    ["Free Cash Flow", f.freeCashFlow ? parseInUSD(f.freeCashFlow) : 'N/A'],
                    ["Total Liabilities", f.totalLiabilities ? parseInUSD(f.totalLiabilities) : 'N/A'],
                    ["Total Equity", f.totalEquity ? parseInUSD(f.totalEquity) : 'N/A'],
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
                prepareHeader: () => doc.font('Helvetica-Bold').fontSize(7),
                prepareRow: (row, i) => {
                    doc.font('Helvetica').fontSize(7);
                    row.options = { padding: 2 };
                },
            });

            const chartWidth = 280;
            const chartHeight = 150;

            try {
                const base64 = await generateCandlestickChart(entry.symbol);
                const chartBuffer = Buffer.from(base64, 'base64');
                doc.image(chartBuffer, xRight, startY, { fit: [chartWidth, chartHeight] });
            } catch (e) {
                console.error(e);
            }

            const yAfterChart = startY + 140;
            const epsList = f.eps ?? [];
            if (epsList.length > 0) {
                doc.font('Helvetica-Bold').fontSize(7).text('EPS (Annual):', xRight, yAfterChart);
                doc.font('Helvetica').fontSize(7);
                const eps = epsList.reverse().map((e) => `${e.year.split("-")[0] ?? 'N/A'}: ${e.value ? Number(e.value).toFixed(2) : 'N/A'}`);
                doc.text(eps.join("  |  "), xRight, yAfterChart + 10);
            }

            doc.moveDown(1);
        }

        doc.moveDown(1);
        doc.font('Helvetica-Bold').fontSize(10).text(`Score: ${entry.score} | Signal: ${entry.signal.toUpperCase()} | Current Price: $ ${entry.currentPrice} | RSI (Monthly timeframe): ${entry.rsi}`, startX);
        doc.moveDown(2);

        if (entry.news?.length) {
            doc.font('Helvetica-Bold').fontSize(8).text('Latest news:', startX);
            doc.moveDown(0.5);

            entry.news.forEach((item, idx) => {
                doc.font('Helvetica-Bold', 7)
                    .text(`• ${parseDate(item.datetime)} | [${item.sentiment.toUpperCase()}] | ${item.headline}`);
                doc.font('Helvetica').fontSize(7);
                // if (item.summary) doc.text(item.summary);
                if (item.url) doc.fillColor('blue').text(item.url, { underline: true });
                doc.fillColor('black');

                if (idx < entry.news.length - 1) doc.moveDown(1);
            });

            doc.moveDown(1);
        }
    };
    doc.moveDown(2);

    let entryCountOnPage = 0;
    for (let entry of [...buySignals, ...sellSignals, ...noneSignals]) {
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
