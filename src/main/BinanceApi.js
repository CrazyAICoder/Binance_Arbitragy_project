const CONFIG = require('../../config/config');
const logger = require('./Loggers');
const Util = require('./Util');
const Binance = require('node-binance-api');
const binance = new Binance().options(Object.assign({
    APIKEY: CONFIG.KEYS.API,
    APISECRET: CONFIG.KEYS.SECRET,
    test: !CONFIG.EXECUTION.ENABLED,
    log: (...args) => logger.binance.info(args.length > 1 ? args : args[0]),
    verbose: true
}, CONFIG.BINANCE_OPTIONS));

const BinanceApi = {

    exchangeInfo() {
        return new Promise((resolve, reject) => {
            binance.exchangeInfo((error, data) => {
                if (error) return reject(error);
                return resolve(data);
            });
        });
    },

    getBalances() {
        return new Promise((resolve, reject) => {
            binance.balance((error, balances) => {
                if (error) return reject(error);
                Object.values(balances).forEach(balance => {
                    balance.available = parseFloat(balance.available);
                    balance.onOrder = parseFloat(balance.onOrder);
                });
                return resolve(balances);
            });
        });
    },

    getDepthSnapshots(tickers, maxDepth=CONFIG.SCANNING.DEPTH) {
        const depthSnapshot = {};
        tickers.forEach((ticker) => {
            depthSnapshot[ticker] = { ...BinanceApi.getDepthCacheSorted(ticker, maxDepth) };
        });
        return depthSnapshot;
    },

    marketBuy(ticker, quantity) {
        logger.execution.info(`${binance.getOption('test') ? 'Test: Buying' : 'Buying'} ${quantity} ${ticker} @ market price`);
        const before = Date.now();
        return new Promise((resolve, reject) => {
            binance.marketBuy(ticker, quantity, (error, response) => {
                if (error) return BinanceApi.handleBuyOrSellError(error, reject);
                if (binance.getOption('test')) {
                    logger.execution.info(`Test: Successfully bought ${ticker} @ market price`);
                } else {
                    logger.execution.info(`Successfully bought ${response.executedQty} ${ticker} @ a quote of ${response.cummulativeQuoteQty} in ${Util.millisecondsSince(before)} ms`);
                }
                return resolve(response);
            });
        });
    },

    marketSell(ticker, quantity) {
        logger.execution.info(`${binance.getOption('test') ? 'Test: Selling' : 'Selling'} ${quantity} ${ticker} @ market price`);
        const before = Date.now();
        return new Promise((resolve, reject) => {
            binance.marketSell(ticker, quantity, (error, response) => {
                if (error) return BinanceApi.handleBuyOrSellError(error, reject);
                if (binance.getOption('test')) {
                    logger.execution.info(`Test: Successfully sold ${ticker} @ market price`);
                } else {
                    logger.execution.info(`Successfully sold ${response.executedQty} ${ticker} @ a quote of ${response.cummulativeQuoteQty} in ${Util.millisecondsSince(before)} ms`);
                }
                return resolve(response);
            });
        });
    },

    marketBuyOrSell(method) {
        return method === 'BUY' ? BinanceApi.marketBuy : BinanceApi.marketSell;
    },

    handleBuyOrSellError(error, reject) {
        try {
            return reject(new Error(JSON.parse(error.body).msg));
        } catch (e) {
            logger.execution.error(error);
            return reject(new Error(error.body));
        }
    },

    time() {
        return new Promise((resolve, reject) => {
            binance.time((error, response) => {
                if (error) return reject(error);
                return resolve(response);
            });
        });
    },

    depthCacheStaggered(tickers, limit, stagger, cb) {
        return binance.websockets.depthCacheStaggered(tickers, BinanceApi.depthWSCallback(cb), limit, stagger);
    },

    depthCacheCombined(tickers, limit, groupSize, stagger, cb) {
        let chain = null;

        for (let i=0; i < tickers.length; i += groupSize) {
            const tickerGroup = tickers.slice(i, i + groupSize);
            let promise = () => new Promise( resolve => {
                binance.websockets.depthCache( tickerGroup, BinanceApi.depthWSCallback(cb), limit );
                setTimeout( resolve, stagger );
            } );
            chain = chain ? chain.then( promise ) : promise();
        }

        return chain;
    },

    depthWSCallback(cb) {
        if (CONFIG.SCANNING.TIMEOUT === 0) {
            // 'context' exists when processing a websocket update NOT when first populating via snapshot
            return (ticker, depth, context) => context && cb(ticker);
        } else {
            return null;
        }
    },

    getDepthCacheSorted(ticker, max=CONFIG.SCANNING.DEPTH) {
        let depthCache = binance.depthCache(ticker);
        depthCache.bids = binance.sortBids(depthCache.bids, max);
        depthCache.asks = binance.sortAsks(depthCache.asks, max);
        return depthCache;
    },

    getDepthCacheUnsorted(ticker) {
        return binance.depthCache(ticker);
    }

};

module.exports = BinanceApi;
