import BigNumber from 'bignumber.js';
import { expect } from "chai";
import { toWei } from "../scripts/utils"

import "./helper";
import {
    createContract,
} from '../scripts/utils';

const _0 = toWei('0')

const params = {
    state: 2,
    unitAccumulativeFunding: toWei('1.9'),
    openSlippageFactor: toWei('1'),
    ammMaxLeverage: toWei('5'),
    maxClosePriceDiscount: toWei('0.05'),
    indexPrice: toWei('100'),
    fundingRateLimit: toWei('0.01'),
    negFundingRateLimit: toWei('-0.01'),
    fundingRateFactor: toWei("0.005")
}

describe('Funding', () => {
    let oracle1;
    let oracle2;
    let liquidityPool;

    beforeEach(async () => {
        const CollateralModule = await createContract("CollateralModule")
        const PerpetualModule = await createContract("PerpetualModule");
        const AMMModule = await createContract("AMMModule");
        const LiquidityPoolModule = await createContract("LiquidityPoolModule", [], {
            AMMModule,
            CollateralModule,
            PerpetualModule
        });
        const LiquidityPoolModule2 = await createContract("LiquidityPoolModule2", [], {
            CollateralModule,
            PerpetualModule,
            LiquidityPoolModule
        });
        liquidityPool = await createContract("TestLiquidityPool", [], {
            LiquidityPoolModule,
            LiquidityPoolModule2,
            CollateralModule,
            PerpetualModule
        });
        oracle1 = await createContract("OracleAdaptor", ["USD", "ETH"]);
        oracle2 = await createContract("OracleAdaptor", ["USD", "ETH"]);
    });

    describe('updateFundingState', function () {

        const cases = [
            {
                name: 'state != NORMAL',
                state: 1,
                unitAccumulativeFunding: params.unitAccumulativeFunding,
                indexPrice1: toWei('100'),
                indexPrice2: toWei('200'),
                fundingRate: toWei('0.002'),
                timeElapsed: '1000',
                targetUnitAccumulativeFunding1: params.unitAccumulativeFunding,
                targetUnitAccumulativeFunding2: params.unitAccumulativeFunding,
                targetFundingTime: '1000'
            },
            {
                name: 'init',
                state: params.state,
                unitAccumulativeFunding: _0,
                indexPrice1: toWei('100'),
                indexPrice2: toWei('200'),
                fundingRate: toWei('0'),
                timeElapsed: '1000',
                targetUnitAccumulativeFunding1: _0,
                targetUnitAccumulativeFunding2: _0,
                targetFundingTime: '1000'
            },
            {
                name: 'current time = liquidityPool time',
                state: params.state,
                unitAccumulativeFunding: params.unitAccumulativeFunding,
                indexPrice1: toWei('100'),
                indexPrice2: toWei('200'),
                fundingRate: toWei('0.002'),
                timeElapsed: '0',
                targetUnitAccumulativeFunding1: params.unitAccumulativeFunding,
                targetUnitAccumulativeFunding2: params.unitAccumulativeFunding,
                targetFundingTime: '1000'
            },
            {
                name: 'normal',
                state: params.state,
                unitAccumulativeFunding: params.unitAccumulativeFunding,
                indexPrice1: toWei('100'),
                indexPrice2: toWei('200'),
                fundingRate: toWei('0.002'),
                timeElapsed: '1000',
                targetUnitAccumulativeFunding1: toWei('1.906944444444444444'),
                targetUnitAccumulativeFunding2: toWei('1.913888888888888888'),
                targetFundingTime: '2000'
            },
            {
                name: 'normal',
                state: params.state,
                unitAccumulativeFunding: params.unitAccumulativeFunding,
                indexPrice1: toWei('100'),
                indexPrice2: toWei('200'),
                fundingRate: toWei('0.002'),
                timeElapsed: '100',
                targetUnitAccumulativeFunding1: toWei('1.900694444444444444'),
                targetUnitAccumulativeFunding2: toWei('1.901388888888888888'),
                targetFundingTime: '2000'
            }
        ]

        cases.forEach(element => {
            it(element.name, async () => {

                var now = Math.floor(Date.now() / 1000);
                await oracle1.setIndexPrice(element.indexPrice1, now);
                await oracle1.setMarkPrice(element.indexPrice1, now);
                await oracle2.setIndexPrice(element.indexPrice2, now);
                await oracle2.setMarkPrice(element.indexPrice2, now);

                await liquidityPool.createPerpetual(
                    oracle1.address,
                    [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("1")],
                    [toWei("0.01"), params.openSlippageFactor, params.openSlippageFactor, params.fundingRateLimit, params.ammMaxLeverage, params.maxClosePriceDiscount, params.fundingRateFactor, toWei("1")],
                )
                await liquidityPool.createPerpetual(
                    oracle2.address,
                    [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("1")],
                    [toWei("0.01"), params.openSlippageFactor, params.openSlippageFactor, params.fundingRateLimit, params.ammMaxLeverage, params.maxClosePriceDiscount, params.fundingRateFactor, toWei("1")],
                )

                await liquidityPool.runLiquidityPool();

                await liquidityPool.updatePrice(0);
                await liquidityPool.updatePrice(1);

                await liquidityPool.setMarginAccount(0, liquidityPool.address, 0, 0);
                await liquidityPool.setFundingRate(0, element.fundingRate);
                await liquidityPool.setUnitAccumulativeFunding(0, element.unitAccumulativeFunding);
                await liquidityPool.setState(0, element.state);

                await liquidityPool.setMarginAccount(1, liquidityPool.address, 0, 0);
                await liquidityPool.setFundingRate(1, element.fundingRate);
                await liquidityPool.setUnitAccumulativeFunding(1, element.unitAccumulativeFunding);
                await liquidityPool.setState(1, element.state);

                await liquidityPool.updateFundingStateP(element.timeElapsed);
                expect(await liquidityPool.getUnitAccumulativeFunding(0)).approximateBigNumber(element.targetUnitAccumulativeFunding1)
                expect(await liquidityPool.getUnitAccumulativeFunding(1)).approximateBigNumber(element.targetUnitAccumulativeFunding2)
            })
        })
    })

    describe('updateFundingRate', function () {

        const successCases = [
            {
                name: 'state != NORMAL',
                state: 1,
                cash: toWei('10100'),
                positionAmount1: toWei('-10'),
                positionAmount2: toWei('10'),
                targetFundingRate1: _0,
                targetFundingRate2: _0
            },
            {
                name: 'init',
                state: params.state,
                cash: _0,
                positionAmount1: _0,
                positionAmount2: _0,
                targetFundingRate1: _0,
                targetFundingRate2: _0
            },
            {
                name: 'unsafe',
                state: params.state,
                cash: toWei('17692'),
                positionAmount1: toWei('-80'),
                positionAmount2: toWei('10'),
                targetFundingRate1: toWei("0.004"),
                targetFundingRate2: params.negFundingRateLimit
            },
            {
                name: 'normal',
                state: params.state,
                cash: toWei('10100'),
                positionAmount1: toWei('-10'),
                positionAmount2: toWei('10'),
                targetFundingRate1: toWei('0.0005'),
                targetFundingRate2: toWei('-0.0005')
            },
            {
                name: 'exceed limit',
                state: params.state,
                cash: toWei('10099'),
                positionAmount1: toWei('60'),
                positionAmount2: toWei('-50'),
                targetFundingRate1: toWei('-0.004'),
                targetFundingRate2: toWei('0.004182195596258372')
            },
        ]

        successCases.forEach(element => {
            it(element.name, async () => {

                var now = Math.floor(Date.now() / 1000);
                await oracle1.setIndexPrice(params.indexPrice, now);
                await oracle1.setMarkPrice(params.indexPrice, now);
                await oracle2.setIndexPrice(params.indexPrice, now);
                await oracle2.setMarkPrice(params.indexPrice, now);

                await liquidityPool.createPerpetual(
                    oracle1.address,
                    [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("1")],
                    [toWei("0.01"), params.openSlippageFactor, params.openSlippageFactor, toWei("0.004"), params.ammMaxLeverage, params.maxClosePriceDiscount, params.fundingRateFactor, toWei("1")],
                )
                await liquidityPool.createPerpetual(
                    oracle2.address,
                    [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("1")],
                    [toWei("0.01"), params.openSlippageFactor, params.openSlippageFactor, params.fundingRateLimit, params.ammMaxLeverage, params.maxClosePriceDiscount, params.fundingRateFactor, toWei("1")],
                )

                await liquidityPool.runLiquidityPool();

                await liquidityPool.updatePrice(0);
                await liquidityPool.updatePrice(1);

                await liquidityPool.setMarginAccount(0, liquidityPool.address, 0, element.positionAmount1);
                await liquidityPool.setFundingRate(0, 0);
                await liquidityPool.setUnitAccumulativeFunding(0, params.unitAccumulativeFunding);
                await liquidityPool.setState(0, element.state);

                await liquidityPool.setMarginAccount(1, liquidityPool.address, 0, element.positionAmount2);
                await liquidityPool.setFundingRate(1, 0);
                await liquidityPool.setUnitAccumulativeFunding(1, params.unitAccumulativeFunding);
                await liquidityPool.setState(1, element.state);

                await liquidityPool.setPoolCash(element.cash);

                await liquidityPool.updateFundingRateP();
                expect(await liquidityPool.getFundingRate(0)).approximateBigNumber(element.targetFundingRate1)
                expect(await liquidityPool.getFundingRate(1)).approximateBigNumber(element.targetFundingRate2)
            })
        })

        const failCases = [
            {
                name: 'margin < 0',
                cash: toWei('10000'),
                positionAmount1: toWei('-50'),
                positionAmount2: toWei('-52'),
                errorMsg: 'AMM is mm unsafe'
            }
        ]

        failCases.forEach(element => {

            it(element.name, async () => {
                var now = Math.floor(Date.now() / 1000);
                await oracle1.setIndexPrice(params.indexPrice, now);
                await oracle1.setMarkPrice(params.indexPrice, now);
                await oracle2.setIndexPrice(params.indexPrice, now);
                await oracle2.setMarkPrice(params.indexPrice, now);

                await liquidityPool.createPerpetual(
                    oracle1.address,
                    [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("1")],
                    [toWei("0.01"), params.openSlippageFactor, params.openSlippageFactor, params.fundingRateLimit, params.ammMaxLeverage, params.maxClosePriceDiscount, params.fundingRateFactor, toWei("1")],
                )
                await liquidityPool.createPerpetual(
                    oracle2.address,
                    [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("1")],
                    [toWei("0.01"), params.openSlippageFactor, params.openSlippageFactor, params.fundingRateLimit, params.ammMaxLeverage, params.maxClosePriceDiscount, params.fundingRateFactor, toWei("1")],
                )

                await liquidityPool.runLiquidityPool();

                await liquidityPool.updatePrice(0);
                await liquidityPool.updatePrice(1);

                await liquidityPool.setMarginAccount(0, liquidityPool.address, 0, element.positionAmount1);
                await liquidityPool.setFundingRate(0, 0);
                await liquidityPool.setUnitAccumulativeFunding(0, params.unitAccumulativeFunding);
                await liquidityPool.setState(0, params.state);

                await liquidityPool.setMarginAccount(1, liquidityPool.address, 0, element.positionAmount2);
                await liquidityPool.setFundingRate(1, 0);
                await liquidityPool.setUnitAccumulativeFunding(1, params.unitAccumulativeFunding);
                await liquidityPool.setState(1, params.state);

                await liquidityPool.setPoolCash(element.cash);

                await expect(liquidityPool.updateFundingRateP()).to.be.revertedWith(element.errorMsg)
            })
        })
    })

})

