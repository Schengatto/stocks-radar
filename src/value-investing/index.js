import fs from "fs";

import { parseDate } from "../utility/parsers.js";
import { analyzeFundamentals } from "./analysis.js";
import { generateReport } from "./report.js";

const FUNDAMENTALS_CONFIG = {
    dataFilePath: `./output/report-buffet-analysis-${parseDate(new Date())}.json`,
    reportFilePath: `./output/${parseDate(new Date())}_fundamentals_report.pdf`,
};

const Signal = {
    Positive: "positive",
    Negative: "negative",
    None: "none",
}

const saveToFile = async (results) => {
    fs.writeFileSync(FUNDAMENTALS_CONFIG.dataFilePath, JSON.stringify(results, null, 2));
};

export {
    FUNDAMENTALS_CONFIG,
    Signal,
    analyzeFundamentals,
    generateReport,
    saveToFile,
};