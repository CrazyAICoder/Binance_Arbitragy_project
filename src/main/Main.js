const os = require('os');
const version = require('../../package.json').version;
const Pool = require('threads').Pool;
const pool = new Pool();
let MarketCache = require('./MarketCache');
let BinanceApi = require('./BinanceApi');
let MarketCalculation = require('./MarketCalculation');
let CONFIG = require('../../config/live.config');

let relationships = [];

// Set up symbols and tickers
BinanceApi.exchangeInfo().then((data) => {

    let symbols = new Set();
    let tickers = [];
    const CACHE_INIT_DELAY = 20000;

    // Extract Symbols and Tickers
    data.symbols.forEach(function(symbolObj) {
        if (symbolObj.status !== 'TRADING') return;
        symbols.add(symbolObj.baseAsset);
        symbolObj.dustQty = parseFloat(symbolObj.filters[1].minQty);
        tickers[symbolObj.symbol] = symbolObj;
    });

    // Initialize market cache
    MarketCache.symbols = symbols;
    MarketCache.tickers = tickers;
    relationships = MarketCalculation.allRelationships().filter(relationship => relationship.symbol.a === CONFIG.BASE_SYMBOL.toUpperCase());

    // Listen for depth updates
    console.log(`Opening websocket connections for ${MarketCache.getTickerArray().length} tickers`);
    MarketCache.getTickerArray().forEach(ticker => {
        BinanceApi.listenForDepthCache(ticker, (ticker, depth) => {
            MarketCache.depths[ticker] = depth;
        }, CONFIG.DEPTH_SIZE);
    });

    console.log(`\nWaiting ${CACHE_INIT_DELAY / 1000} seconds to populate market caches`);

    setTimeout(function() {
        console.log(`\nInitiated calculation cycle:
            App Version:     ${version}
            CPU Cores:       ${os.cpus().length}
            Cycle Delay:     ${CONFIG.SCAN_DELAY / 1000} seconds
            Relationships:   ${relationships.length}
            Investments:     [${CONFIG.INVESTMENT.MIN} - ${CONFIG.INVESTMENT.MAX}] by ${CONFIG.INVESTMENT.STEP} ${CONFIG.BASE_SYMBOL}
            Profit Logging:  > ${CONFIG.MIN_PROFIT_PERCENT}%\n`);
        calculateArbitrage();
    }, CACHE_INIT_DELAY);
})
    .catch((error) => {
        console.error(error);
        console.log(error.message);
    });

// Setup Pool
let before = new Date();
let remaining = 0;

pool
    .run('CalculationNode.js')
    .on('done', (job, calculated) => {
        remaining--;
        if (calculated && calculated.percent >= CONFIG.MIN_PROFIT_PERCENT) console.log(`${new Date()}: Profit of ${calculated.percent.toFixed(5)}% on ${calculated.symbol.a}${calculated.symbol.b}${calculated.symbol.c}`);
        if (remaining === 0) {
            //console.log(`Completed calculations in ${(new Date() - before)/1000} seconds`);
            setTimeout(calculateArbitrage, CONFIG.SCAN_DELAY);
        }
    })
    .on('error', (job, error) => {
        console.error(error);
    });

function calculateArbitrage() {
    MarketCache.pruneDepthsAboveThreshold(CONFIG.DEPTH_SIZE);

    remaining = relationships.length;
    before = new Date();

    relationships.forEach(relationship => {
        pool.send({
            trade: relationship,
            minInvestment: CONFIG.INVESTMENT.MIN,
            maxInvestment: CONFIG.INVESTMENT.MAX,
            stepSize: CONFIG.INVESTMENT.STEP,
            MarketCache: MarketCache.getSubsetFromTickers([relationship.ab.ticker, relationship.bc.ticker, relationship.ca.ticker])
        });
    });
}
