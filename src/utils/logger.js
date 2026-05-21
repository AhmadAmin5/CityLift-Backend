import chalk from "chalk";
import "dotenv/config";

const logsEnabled = process.env.ENABLE_LOGS === "true";

if (process.env.COLOR_LOGS === "false") {
    chalk.level = 0;
}

const getTime = () => chalk.gray(`[${new Date().toLocaleTimeString()}]`);

const levels = {
    ERROR: 0,
    WARN: 1,
    SUCCESS: 2,
    INFO: 3,
    DEBUG: 4
};

const currentLevel = levels[process.env.LOG_LEVEL] ?? levels.INFO;

const logger = {
    shouldLog: (levelName) => logsEnabled && levels[levelName] <= currentLevel,

    error: (msg) => {
        if (levels.ERROR <= currentLevel) {
            console.log(`${getTime()} ` + chalk.red.bold("✖ ") + chalk.red(msg));
        }
    },

    warn: (msg) => {
        if (logger.shouldLog("WARN")) {
            console.log(`${getTime()} ` + chalk.yellow("⚠ ") + msg);
        }
    },

    success: (msg) => {
        if (logger.shouldLog("SUCCESS")) {
            console.log(`${getTime()} ` + chalk.green("✔ ") + msg);
        }
    },

    info: (msg) => {
        if (logger.shouldLog("INFO")) {
            console.log(`${getTime()} ` + chalk.blue("ℹ ") + msg);
        }
    },

    debug: (msg) => {
        if (logger.shouldLog("DEBUG")) {
            console.log(`${getTime()} ` + chalk.magenta("⚙ ") + chalk.gray(msg));
        }
    }
};

export default logger;
