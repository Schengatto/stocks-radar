
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const AUTH = [
    process.env.HUGGINGFACE_API_KEY1,
    process.env.HUGGINGFACE_API_KEY2,
    process.env.HUGGINGFACE_API_KEY3,
    process.env.HUGGINGFACE_API_KEY4,
    process.env.HUGGINGFACE_API_KEY5,
].filter(k => !!k);

const doAskAi = async (query, key) => {
    return await axios.post(
        'https://api-inference.huggingface.co/models/cardiffnlp/twitter-roberta-base-sentiment',
        { inputs: query },
        {
            headers: {
                Authorization: `Bearer ${key}`
            }
        }
    );
};

export const askAi = async (text) => {
    let lastError = null;

    for (const key of AUTH) {
        try {
            const response = await doAskAi(text, key);
            return response.data[0]; // Return on success
        } catch (e) {
            if (e.response && e.response.status === 402) {
                console.warn(`Quota exceeded for key ${key}. Trying the next one...`);
                lastError = e;
                continue;
            } else {
                // Re-throw any other kind of error (e.g. 500, 401, network)
                throw e;
            }
        }
    }

    // If all keys failed due to quota limits
    throw lastError || new Error('All Hugging Face API keys failed.');
};