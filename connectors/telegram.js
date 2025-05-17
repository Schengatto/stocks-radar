import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

export const sendViaTelegram = async (message) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (botToken && chatId) {
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown',
        });
    } else {
        console.warn("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are not defined.")
    }
};