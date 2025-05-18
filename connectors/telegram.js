import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import FormData from "form-data"

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

export const sendFileViaTelegram = async (filePath, caption = '') => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (botToken && chatId) {
        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('caption', caption);
        formData.append('document', fs.createReadStream(filePath));

        try {
            await axios.post(`https://api.telegram.org/bot${botToken}/sendDocument`, formData, {
                headers: formData.getHeaders(),
            });
        } catch (e) {
            console.error(e);
        }

    } else {
        console.warn("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are not defined.");
    }
};