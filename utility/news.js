import { askAi } from "../connectors/hugging-ai.js";
import finnhub from "../connectors/finnhub.js";
import { parseDate } from "./parsers.js";


export const Sentiment = {
    Low: "negative",
    Medium: "neutral",
    High: "positive",
};

const analyzeSentiment = async (text) => {
    const result = await askAi(text);

    const labelMap = {
        'LABEL_0': 'negative',
        'LABEL_1': 'neutral',
        'LABEL_2': 'positive'
    };
    const sentiment = labelMap[result[0].label];
    const score = result[0].score;

    return { sentiment, score };
};

const generateSignalFromNews = (sentiment, score, threshold = 0.85) => {
    if (sentiment === 'positive' && score > threshold) {
        return Sentiment.High;
    } else if (sentiment === 'negative' && score > threshold) {
        return Sentiment.Low;
    }
    return Sentiment.Medium;
};

export const getNews = async (symbol, last = 3) => {
    const getFromDate = () => {
        const _fromDate = new Date();
        _fromDate.setMonth(new Date().getMonth() - 3);
        return parseDate(_fromDate);
    };

    const fromDate = getFromDate();
    const toDate = parseDate(new Date());

    try {
        const data = await new Promise((resolve, reject) => {
            finnhub.companyNews(symbol, parseDate(fromDate), parseDate(toDate), (error, data, response) => {
                if (error) {
                    return reject(error);
                }
                resolve(data);
            });
        });

        if (data && data.length > 0) {
            return Promise.all(data.slice(0, last).map(async (news) => {
                const text = news.headline + '. ' + (news.summary || '');
                const { sentiment, score } = await analyzeSentiment(text);
                const signal = generateSignalFromNews(sentiment, score);
                return { ...news, sentiment: signal };
            }));
        } else {
            console.log(`${symbol} - No news found`);
            return [];
        }
    } catch (e) {
        console.error(`Error while fetching news for "${symbol}"`, e);
        return [];
    }
};

export const newsParser = (n) => `${parseDate(n.datetime)}* - ${n.sentiment} - ${n.headline}*\n${n.summary ? n.summary + "\n" : ""}${n.url}`;