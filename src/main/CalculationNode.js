const CONFIG = require('../../config/config');
const binance = require('node-binance-api')();
const MarketCache = require('./MarketCache');

const CalculationNode = {

    optimize(trade) {
        let quantity, calculation;
        let bestCalculation = null;

        for (quantity = CONFIG.INVESTMENT.MIN || CONFIG.INVESTMENT.STEP; quantity <= CONFIG.INVESTMENT.MAX; quantity += CONFIG.INVESTMENT.STEP) {
            calculation = CalculationNode.calculate(quantity, trade);
            if (!bestCalculation || calculation.percent > bestCalculation.percent) {
                bestCalculation = calculation;
            }
        }

        return bestCalculation;
    },

    calculate(investmentA, trade) {
        let calculated = {
            id: `${trade.symbol.a}-${trade.symbol.b}-${trade.symbol.c}`,
            trade: trade,
            start: {
                total: investmentA,
                market: 0
            },
            ab: {
                total: 0,
                market: 0
            },
            bc: {
                total: 0,
                market: 0
            },
            ca: {
                total: 0,
                market: 0
            },
            times: {
                ab: binance.depthCache(trade.ab.ticker).time,
                bc: binance.depthCache(trade.bc.ticker).time,
                ca: binance.depthCache(trade.ca.ticker).time
            },
            a: 0,
            b: 0,
            c: 0
        };
    
        if (trade.ab.method === 'Buy') {
            calculated.ab.total = CalculationNode.orderBookConversion(calculated.start.total, trade.symbol.a, trade.symbol.b, trade.ab.ticker);
            calculated.ab.market = CalculationNode.calculateDustless(trade.ab.ticker, calculated.ab.total);
            calculated.b = calculated.ab.market;
            calculated.start.market = CalculationNode.orderBookConversion(calculated.ab.market, trade.symbol.b, trade.symbol.a, trade.ab.ticker);
        } else {
            calculated.ab.total = calculated.start.total;
            calculated.ab.market = CalculationNode.calculateDustless(trade.ab.ticker, calculated.ab.total);
            calculated.b = CalculationNode.orderBookConversion(calculated.ab.market, trade.symbol.a, trade.symbol.b, trade.ab.ticker);
            calculated.start.market = calculated.ab.market;
        }
    
        if (trade.bc.method === 'Buy') {
            calculated.bc.total = CalculationNode.orderBookConversion(calculated.b, trade.symbol.b, trade.symbol.c, trade.bc.ticker);
            calculated.bc.market = CalculationNode.calculateDustless(trade.bc.ticker, calculated.bc.total);
            calculated.c = calculated.bc.market;
        } else {
            calculated.bc.total = calculated.b;
            calculated.bc.market = CalculationNode.calculateDustless(trade.bc.ticker, calculated.bc.total);
            calculated.c = CalculationNode.orderBookConversion(calculated.bc.market, trade.symbol.b, trade.symbol.c, trade.bc.ticker);
        }
    
        if (trade.ca.method === 'Buy') {
            calculated.ca.total = CalculationNode.orderBookConversion(calculated.c, trade.symbol.c, trade.symbol.a, trade.ca.ticker);
            calculated.ca.market = CalculationNode.calculateDustless(trade.ca.ticker, calculated.ca.total);
            calculated.a = calculated.ca.market;
        } else {
            calculated.ca.total = calculated.c;
            calculated.ca.market = CalculationNode.calculateDustless(trade.ca.ticker, calculated.ca.total);
            calculated.a = CalculationNode.orderBookConversion(calculated.ca.market, trade.symbol.c, trade.symbol.a, trade.ca.ticker);
        }
    
        calculated.percent = (calculated.a - calculated.start.total) / calculated.start.total * 100;
        if (!calculated.percent) calculated.percent = 0;
    
        return calculated;
    },
    
    orderBookConversion(amountFrom, symbolFrom, symbolTo, ticker) {
        let i, j, rates, rate, quantity, exchangeableAmount;
        let orderBook = binance.depthCache(ticker) || {};
        let amountTo = 0;
    
        if (amountFrom === 0) return 0;
    
        if (ticker === symbolFrom + symbolTo) {
            rates = Object.keys(orderBook.bids || {});
            for (i=0; i<rates.length; i++) {
                rate = parseFloat(rates[i]);
                quantity = orderBook.bids[rates[i]];
                if (quantity < amountFrom) {
                    amountFrom -= quantity;
                    amountTo += quantity * rate;
                } else {
                    // Last fill
                    return amountTo + amountFrom * rate;
                }
            }
        } else {
            rates = Object.keys(orderBook.asks || {});
            for (j=0; j<rates.length; j++) {
                rate = parseFloat(rates[j]);
                quantity = orderBook.asks[rates[j]];
                exchangeableAmount = quantity * rate;
                if (exchangeableAmount < amountFrom) {
                    amountFrom -= quantity * rate;
                    amountTo += quantity;
                } else {
                    // Last fill
                    return amountTo + amountFrom / rate;
                }
            }
        }
    
        throw new Error(`Depth (${rates.length}) too shallow to convert ${amountFrom} ${symbolFrom} to ${symbolTo} using ${ticker}`);
    },
    
    calculateDustless(ticker, amount) {
        if (Number.isInteger(amount)) return amount;
        const amountString = amount.toFixed(12);
        const decimals = MarketCache.tickers[ticker].dustDecimals;
        const decimalIndex = amountString.indexOf('.');
        return parseFloat(amountString.slice(0, decimalIndex + decimals + 1));
    }

};

module.exports = CalculationNode;
