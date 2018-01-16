angular
    .module('directives')
    .directive('tradeDetails', Trade);

Trade.$inject = ['binanceService'];

function Trade(binanceService) {

    var directive = {
        restrict: 'E',
        templateUrl: '/html/trade-details.html',
        scope: {
            trade: '=',
            maxInvestment: '=',
            maxVolume: '=',
            minProfit: '='
        },
        link: link
    };

    function link(scope, element, attrs) {

        scope.calculated = {
            start: {
                total: 0,
                market: 0,
                dust: 0
            },
            ab: {
                total: 0,
                market: 0,
                dust: 0
            },
            bc: {
                total: 0,
                market: 0,
                dust: 0
            },
            ca: {
                total: 0,
                market: 0,
                dust: 0
            },
            a: 0,
            b: 0,
            c: 0
        };

        scope.balances = {};

        function init() {
            scope.investment = 100;
            binanceService.accountInformation()
                .then(function(information) {
                    scope.balances = information.balances;
                })
                .catch(console.error);

            scope.$watch('trade.id', function() {
                scope.executionTime = null;
                scope.optimize();
            });
        }


        scope.calculate = function(investment) {

            scope.calculated.start.total = investment / binanceService.convertRate(scope.trade.symbol.a, 'USDT');

            if (scope.trade.ab.method === 'Buy') {
                scope.calculated.ab.total = scope.calculated.start.total * binanceService.convertRate(scope.trade.symbol.a, scope.trade.symbol.b);
                scope.calculated.ab.market = binanceService.calculateDustless(scope.trade.ab.ticker, scope.calculated.ab.total);
                scope.calculated.ab.dust = scope.calculated.ab.total - scope.calculated.ab.market;

                scope.calculated.start.market = scope.calculated.ab.market * binanceService.convertRate(scope.trade.symbol.b, scope.trade.symbol.a);
                scope.calculated.ab.dust = 0;

                scope.calculated.b = scope.calculated.ab.market;
            } else {
                scope.calculated.ab.total = scope.calculated.start.total;
                scope.calculated.ab.market = binanceService.calculateDustless(scope.trade.ab.ticker, scope.calculated.ab.total);
                scope.calculated.ab.dust = scope.calculated.ab.total - scope.calculated.ab.market;

                scope.calculated.start.market = scope.calculated.ab.market;
                scope.calculated.ab.dust = 0;

                scope.calculated.b = scope.calculated.ab.market * binanceService.convertRate(scope.trade.symbol.a, scope.trade.symbol.b);
            }
            scope.calculated.ab.volume = scope.calculated.ab.market / (scope.trade.ab.volume / 24);


            if (scope.trade.bc.method === 'Buy') {
                scope.calculated.bc.total = scope.calculated.b * binanceService.convertRate(scope.trade.symbol.b, scope.trade.symbol.c);
                scope.calculated.bc.market = binanceService.calculateDustless(scope.trade.bc.ticker, scope.calculated.bc.total);
                scope.calculated.bc.dust = scope.calculated.bc.total - scope.calculated.bc.market;
                scope.calculated.c = scope.calculated.bc.market;
            } else {
                scope.calculated.bc.total = scope.calculated.b;
                scope.calculated.bc.market = binanceService.calculateDustless(scope.trade.bc.ticker, scope.calculated.bc.total);
                scope.calculated.bc.dust = scope.calculated.bc.total - scope.calculated.bc.market;
                scope.calculated.c = scope.calculated.bc.market * binanceService.convertRate(scope.trade.symbol.b, scope.trade.symbol.c);
            }
            scope.calculated.bc.volume = scope.calculated.bc.market / (scope.trade.bc.volume / 24);


            if (scope.trade.ca.method === 'Buy') {
                scope.calculated.ca.total = scope.calculated.c * binanceService.convertRate(scope.trade.symbol.c, scope.trade.symbol.a);
                scope.calculated.ca.market = binanceService.calculateDustless(scope.trade.ca.ticker, scope.calculated.ca.total);
                scope.calculated.ca.dust = scope.calculated.ca.total - scope.calculated.ca.market;
                scope.calculated.a = scope.calculated.ca.market;
            } else {
                scope.calculated.ca.total = scope.calculated.c;
                scope.calculated.ca.market = binanceService.calculateDustless(scope.trade.ca.ticker, scope.calculated.ca.total);
                scope.calculated.ca.dust = scope.calculated.ca.total - scope.calculated.ca.market;
                scope.calculated.a = scope.calculated.ca.market * binanceService.convertRate(scope.trade.symbol.c, scope.trade.symbol.a);
            }
            scope.calculated.ca.volume = scope.calculated.ca.market / (scope.trade.ca.volume / 24);

            scope.calculated.volume = Math.max(scope.calculated.ab.volume, scope.calculated.bc.volume, scope.calculated.ca.volume) * 100;

            scope.calculated.percent = (scope.calculated.a - scope.calculated.start.total) / scope.calculated.start.total * 100;
            if (!scope.calculated.percent) scope.calculated.percent = 0;

            return {
                percent: scope.calculated.percent,
                volume: scope.calculated.volume
            };
        };

        scope.refresh = function() {
            return binanceService.refreshPriceMap()
                .then(function() {
                    var rel = binanceService.relationships(scope.trade.symbol.a, scope.trade.symbol.b, scope.trade.symbol.c);
                    angular.extend(scope.trade, rel);
                    return scope.optimize();
                })
                .catch(console.error);
        };

        scope.execute = function() {
            var startTime = null;
            scope.executionTime = null;
            scope.refresh()
                .then(function(metrics) {
                    startTime = new Date();
                    if (metrics.percent < scope.minProfit) throw 'Percent ' + metrics.percent.toFixed(2) + '% is too low to execute trade.';
                    if (metrics.volume > scope.maxVolume) throw 'Volume ' + metrics.volume.toFixed(2) + '% is too high to execute trade.';
                    return performTradeAndVerify(scope.trade.ab.method, scope.calculated.ab.market, scope.trade.ab.ticker)
                        .then(function(execution) {
                            return performTradeAndVerify(scope.trade.bc.method, scope.calculated.bc.market, scope.trade.bc.ticker);
                        })
                        .then(function(execution) {
                            return performTradeAndVerify(scope.trade.ca.method, scope.calculated.ca.market, scope.trade.ca.ticker);
                })
                        .then(function(execution) {
                    scope.executionTime = new Date() - startTime;
                            console.log('DONE!');
                });
                })
                .then(binanceService.accountInformation)
                .then(updateBalancesAndCalculateDifference)
                .then(function(differences) {
                    return calculateGain(scope.trade.symbol.a, differences);
                })
                .catch(console.error);
        };

        function performTradeAndVerify(method, amount, ticker) {
            return binanceService.performMarketOrder(method, amount, ticker)
                .catch(function(error) {
                    throw error;
                });
        }

        function updateBalancesAndCalculateDifference(accountInformation) {
            var differences = [];
            console.log('Updating balances and calculating differences...');
            accountInformation.balances.forEach(function(balance) {
                var convertRate = binanceService.convertRate(balance.asset, 'USDT');
                // Assume we had none before
                var newBalance = parseFloat(balance.free) + parseFloat(balance.locked);
                var difference = {
                    asset: balance.asset,
                    change: newBalance,
                    changeUSD: convertRate * newBalance,
                    percentChange: 100.000
                };
                // Check if we did have some of this asset before
                scope.balances.forEach(function(previousBalance) {
                    var oldBalance = parseFloat(previousBalance.free) + parseFloat(previousBalance.locked);
                    if (previousBalance.asset === balance.asset) {
                        difference.change = newBalance - oldBalance;
                        difference.changeUSD = convertRate * (newBalance - oldBalance);
                        difference.percentChange = ((newBalance - oldBalance) / oldBalance * 100).toFixed(3);
                    }
                });
                if (difference.change !== 0) differences.push(difference);
            });
            console.log('Differences');
            console.log(differences);
            scope.balances = accountInformation.balances;
            return differences;
        }

        function calculateGain(symbol, differences) {
            var totalChange = 0;
            differences.forEach(function(difference) {
                totalChange += binanceService.convertRate(difference.asset, symbol) * difference.change;
            });
            console.log('Calculated total change of ' + totalChange + ' ' + symbol);
            console.log('Calculated total change of ' + binanceService.convertRate(symbol, 'USDT') * totalChange + ' (USD)');
            return totalChange;
        }

        scope.generateLink = function(a, b) {
            return binanceService.generateLink(a, b);
        };

        scope.apiKeyPresent = function() {
            return binanceService.API.KEY && binanceService.API.SECRET;
        };

        scope.optimize = function() {
            var best = {
                investment: 0,
                percent: -100,
                volume: 100
            };
            for (var dollars=1; dollars<scope.maxInvestment; dollars++) {
                var calculation = scope.calculate(dollars);
                if (calculation.percent > best.percent) {
                    best.investment = dollars;
                    best.percent = calculation.percent;
                    best.volume = calculation.volume;
                }
            }
            scope.investment = best.investment;
            return scope.calculate(scope.investment);
        };

        init();

    }

    return directive;

}
