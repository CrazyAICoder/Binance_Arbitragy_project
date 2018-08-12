const threads = require('threads');
threads.config.set({
    basepath: {
        node: __dirname
    }
});
const MarketCache = require('./MarketCache');
const ArbDisplay = require('./ArbDisplay');
const BinanceApi = require('./BinanceApi');
const MarketCalculation = require('./MarketCalculation');
const CONFIG = require('../../config/live.config');
const API_CONFIG = require('../../config/api');
const binance = require('node-binance-api')().options({
    APIKEY: API_CONFIG.BINANCE_API_KEY,
    APISECRET: API_CONFIG.BINANCE_API_SECRET,
    useServerTime: true,
    test: true
});

// Set up symbols and tickers
BinanceApi.exchangeInfo()
    .then((data) => {
        let symbols = new Set();
        let tickers = [];

        // Extract Symbols and Tickers
        data.symbols.forEach(function (symbolObj) {
            if (symbolObj.status !== 'TRADING') return;
            symbols.add(symbolObj.baseAsset);
            symbolObj.dustQty = parseFloat(symbolObj.filters[1].minQty);
            tickers[symbolObj.symbol] = symbolObj;
        });

        // Initialize market cache
        MarketCache.symbols = symbols;
        MarketCache.tickers = tickers;
        MarketCache.relationships = MarketCalculation.getRelationshipsFromSymbol(CONFIG.BASE_SYMBOL);

        // Listen for depth updates
        return BinanceApi.depthCache(MarketCache.getTickerArray(), CONFIG.DEPTH_SIZE, CONFIG.DEPTH_OPEN_INTERVAL);
    })
    .then(() => {
        calculateArbitrage();
        CONFIG.HUD_REFRESH_INTERVAL && setInterval(refreshDisplay, CONFIG.HUD_REFRESH_INTERVAL);
    })
    .catch(console.error);



function calculateArbitrage() {
    MarketCache.pruneDepthsAboveThreshold(CONFIG.DEPTH_SIZE);

    const pool = new threads.Pool();
    const job = pool
        .run('CalculationNode.js')
        .on('error',  console.error)
        .on('done', (job, calculated) => {
            if (calculated) {
                MarketCache.arbs[calculated.id] = calculated;
            }
        });

    MarketCache.relationships.forEach(relationship => {
        job.send({
            trade: relationship,
            minInvestment: CONFIG.INVESTMENT.MIN,
            maxInvestment: CONFIG.INVESTMENT.MAX,
            stepSize: CONFIG.INVESTMENT.STEP,
            MarketCache: MarketCache.getSubsetFromTickers([relationship.ab.ticker, relationship.bc.ticker, relationship.ca.ticker])
        })
    });

    pool.on('finished', () => {
        pool.killAll();
        setTimeout(calculateArbitrage, CONFIG.SCAN_DELAY);
    });
}

function refreshDisplay() {
    const arbsToDisplay = MarketCache.getTopProfitableArbs(CONFIG.HUD_ARB_COUNT);
    ArbDisplay.displayArbs(arbsToDisplay);
}
