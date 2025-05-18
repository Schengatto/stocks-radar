import finnhub from "finnhub";
import dotenv from "dotenv";

dotenv.config();

const AUTH_KEYS = [
    process.env.FINNHUB_API_KEY1,
    process.env.FINNHUB_API_KEY2,
    process.env.FINNHUB_API_KEY3
].filter(Boolean);

if (AUTH_KEYS.length === 0) {
    console.warn("⚠️ No API keys defined for FINNHUB_API!");
}

let currentKeyIndex = 0;
const finnhubClient = new finnhub.DefaultApi();
const apiKeyAuth = finnhub.ApiClient.instance.authentications['api_key'];
apiKeyAuth.apiKey = AUTH_KEYS[currentKeyIndex];

function setApiKey(index) {
    const key = AUTH_KEYS[index];
    apiKeyAuth.apiKey = key;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function promisify(method, ...args) {
    const maxAttempts = AUTH_KEYS.length;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        setApiKey(currentKeyIndex);
        try {
            return await new Promise((resolve, reject) => {
                method(...args, (error, data, response) => {
                    if (error) {
                        const status = error.status || error.response?.statusCode;
                        if (status === 429) return reject({ type: "RATE_LIMIT", error });
                        return reject({ type: "OTHER", error });
                    }
                    resolve(data);
                });
            });
        } catch (err) {
            if (err.type === "RATE_LIMIT") {
                console.warn(`⚠️ Rate limit hit for key #${currentKeyIndex + 1}. Rotating...`);
                currentKeyIndex = (currentKeyIndex + 1) % AUTH_KEYS.length;
                await sleep(1000);
            } else {
                throw err.error;
            }
        }
    }

    throw new Error("❌ All API keys exhausted due to rate limits.");
}

export const fetchCompanyData = async (symbol) => {
    try {
        // 1. Fundamental metrics
        const fundamentals = await promisify(finnhubClient.companyBasicFinancials.bind(finnhubClient), symbol, 'all');
        if (!fundamentals?.metric) throw new Error('Fundamental metrics not available');
        const overview = fundamentals.metric;

        // 2. Historical EPS
        const earningsData = await promisify(finnhubClient.companyEarnings.bind(finnhubClient), symbol, {});
        const earnings = {
            annualEarnings: (earningsData || []).map(e => ({ reportedEPS: e.eps }))
        };

        // 3. Annual report
        const annualReport = await new Promise((resolve, reject) => {
            finnhubClient.financialsReported({ symbol }, (error, data, response) => {
                if (error) return reject(error);
                const report = data?.data.find(r => r.form === '10-K' || r.form === '20-F');
                resolve(report);
            });
        });

        if (!annualReport) {
            console.warn(`No annual report found for ${symbol}. Trying fallback with 'financials'...`);

            const finData = await new Promise((resolve, reject) => {
                finnhubClient.financials(symbol, "ic", "annual", (error, data, response) => {
                    if (error) return reject(error);
                    resolve(data);
                });
            });

            if (!finData?.financials?.length) return { overview, earnings };

            const last = finData.financials[0]; // più recente

            const incomeStatement = {
                annualReports: [{
                    netIncome: parseFloat(last.netIncome || 0),
                    totalRevenue: parseFloat(last.revenue || 0)
                }]
            };
            const balanceSheet = {
                annualReports: [{
                    totalLiabilities: parseFloat(last.totalLiabilities || 0),
                    totalShareholderEquity: parseFloat(last.totalEquity || 0)
                }]
            };

            return { overview, earnings, incomeStatement, balanceSheet };
        } else {
            const bs = annualReport.report.bs;
            const ic = annualReport.report.ic;

            const incomeStatement = {
                annualReports: [{
                    netIncome: ic ? parseFloat(ic['NetIncome']?.value || 0) : 0,
                    totalRevenue: ic ? parseFloat(ic['Revenue']?.value || 0) : 0,
                }]
            };

            const balanceSheet = {
                annualReports: [{
                    totalLiabilities: bs ? parseFloat(bs['TotalLiabilities']?.value || 0) : 0,
                    totalShareholderEquity: bs ? parseFloat(bs['TotalEquity']?.value || 0) : 0,
                }]
            };

            return { overview, earnings, incomeStatement, balanceSheet };
        }
    } catch (err) {
        console.error(`❌ Error while fetching data for ${symbol}:`, err.message);
        return null;
    }
};

export default finnhubClient;
