import fs from "fs";
import path from "path";

export const saveDataToFile = async (filePath, data) => {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

export const readDataFromFile = async (filePath, encoding = "utf8") => {
    if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, encoding);
        return JSON.parse(raw);
    } else {
        console.log('File does not exist: ' + filePath);
    }
};

