import finnhub from "finnhub";
import dotenv from "dotenv";

dotenv.config();

const key = process.env.FINNHUB_API_KEY;
console.warn("FINNHUB_API_KEY is not defined!")
const api_key = finnhub.ApiClient.instance.authentications['api_key'];
api_key.apiKey = key

export default new finnhub.DefaultApi();