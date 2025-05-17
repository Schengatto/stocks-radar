import finnhub from "./connectors/finnhub.js";
import { sendViaTelegram } from "./connectors/telegram.js";
import { parseDate } from "./utility/parsers.js";

const fromDate = new Date();
const toDate = new Date();
toDate.setMonth(toDate.getMonth() + 3);

const getIPOs = async () => {
    const data = await new Promise((resolve, reject) => {
        finnhub.ipoCalendar(parseDate(fromDate), parseDate(toDate), async (error, data, response) => {
            if (error) {
                return reject(error);
            }
            resolve(data);
        });
    });

    if (data && data.ipoCalendar) {
        return Array.from(data.ipoCalendar);
    } else {
        return [];
    }
};

const getIpoCalendar = async () => {
    const ipos = await getIPOs();

    if (ipos.length) {
        const ipoParser = (i) => `*${parseDate(i.date)}* | ${i.name} (${i.symbol}) | Exchange: ${i.exchange} | price: ${i.price}`;
        let message = `*IPO NEXT 3 MONTHS*:\n${ipos.map(i => ipoParser(i)).join("\n\n")}`;
        await sendViaTelegram(message);
        console.log(message);
    }
};

getIpoCalendar();
