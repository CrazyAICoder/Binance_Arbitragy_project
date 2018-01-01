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
            refresh: '&',
            maxInvestment: '='
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

        function init() {
            scope.investment = 100;

            scope.$watch('[investment, trade]', function () {
                calculate();
            });

            scope.optimize();
        }


        function calculate(investment) {
            if (investment === undefined) investment = scope.investment;

            scope.calculated.start.total = investment / binanceService.convertRate(scope.trade.a, 'USDT');

            if (scope.trade.ab.method === 'Buy') {
                scope.calculated.ab.total = scope.calculated.start.total * binanceService.convertRate(scope.trade.a, scope.trade.b);
                scope.calculated.ab.dust = binanceService.calculateDust(scope.trade.ab.ticker, scope.calculated.ab.total);
                scope.calculated.ab.market = scope.calculated.ab.total - scope.calculated.ab.dust;

                scope.calculated.start.market = scope.calculated.ab.market * binanceService.convertRate(scope.trade.b, scope.trade.a);
                scope.calculated.ab.dust = 0;

                scope.calculated.b = scope.calculated.ab.market;
            } else {
                scope.calculated.ab.total = scope.calculated.start.total;
                scope.calculated.ab.market = scope.calculated.ab.total;

                scope.calculated.start.market = scope.calculated.ab.market;
                scope.calculated.ab.dust = 0;

                scope.calculated.b = scope.calculated.ab.market * binanceService.convertRate(scope.trade.a, scope.trade.b);
            }


            if (scope.trade.bc.method === 'Buy') {
                scope.calculated.bc.total = scope.calculated.b * binanceService.convertRate(scope.trade.b, scope.trade.c);
                scope.calculated.bc.dust = binanceService.calculateDust(scope.trade.bc.ticker, scope.calculated.bc.total);
                scope.calculated.bc.market = scope.calculated.bc.total - scope.calculated.bc.dust;
                scope.calculated.c = scope.calculated.bc.market;
            } else {
                scope.calculated.bc.total = scope.calculated.b;
                scope.calculated.bc.dust = binanceService.calculateDust(scope.trade.bc.ticker, scope.calculated.bc.total);
                scope.calculated.bc.market = scope.calculated.bc.total - scope.calculated.bc.dust;
                scope.calculated.c = scope.calculated.bc.market * binanceService.convertRate(scope.trade.b, scope.trade.c);
            }


            if (scope.trade.ca.method === 'Buy') {
                scope.calculated.ca.total = scope.calculated.c * binanceService.convertRate(scope.trade.c, scope.trade.a);
                scope.calculated.ca.dust = binanceService.calculateDust(scope.trade.ca.ticker, scope.calculated.ca.total);
                scope.calculated.ca.market = scope.calculated.ca.total - scope.calculated.ca.dust;
                scope.calculated.a = scope.calculated.ca.market;
            } else {
                scope.calculated.ca.total = scope.calculated.c;
                scope.calculated.ca.dust = binanceService.calculateDust(scope.trade.ca.ticker, scope.calculated.ca.total);
                scope.calculated.ca.market = scope.calculated.ca.total - scope.calculated.ca.dust;
                scope.calculated.a = scope.calculated.ca.market * binanceService.convertRate(scope.trade.c, scope.trade.a);
            }

            scope.percent = (scope.calculated.a - scope.calculated.start.total) / scope.calculated.start.total * 100;

            return scope.percent;
        }

        scope.generateLink = function(a, b) {
            return binanceService.generateLink(a, b);
        };

        scope.optimize = function() {
            var best = {
                investment: 0,
                percent: 0
            };
            for (var dollars=0; dollars<scope.maxInvestment; dollars++) {
                var percent = calculate(dollars);
                if (percent > best.percent) {
                    best.investment = dollars;
                    best.percent = percent;
                }
            }
            scope.investment = best.investment;
            calculate(best.investment);
        };

        init();

    }

    return directive;

}
