const fs = require('fs');
const pino = require('pino');

const LOG_DIR = `${__dirname}/../../logs`;
const PINO_OPTS = {
    level: process.env.LOG_LEVEL || 'info',
    timestamp: () => `,"time":"${new Date().toLocaleString()}"`,
    useLevelLabels: true,
    base: null
};

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)){
    fs.mkdirSync(LOG_DIR);
}


module.exports = {
    'performance': pino(PINO_OPTS, pino.destination(`${LOG_DIR}/performance.log`)),
    'execution': pino(PINO_OPTS, pino.destination(`${LOG_DIR}/execution.log`))
};
