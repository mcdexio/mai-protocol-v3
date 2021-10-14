import { expect } from "chai";
const { ethers } = require("hardhat");
import {
    toWei,
    fromWei,
    fromBytes32,
    toBytes32,
    getAccounts,
    createFactory,
    createContract,
} from '../scripts/utils';

import "./helper";

describe('LiquidityPool2', () => {
    let accounts;
    let user0;
    let user1;
    let user2;
    let user3;
    let user4;
    let user5;

    let liquidityPool;
    let oracle1;
    let oracle2;
    let ctk;
    let stk;

    before(async () => {
        accounts = await getAccounts();
    })

    beforeEach(async () => {
        user0 = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];
        user4 = accounts[4];
        user5 = accounts[5];

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

        stk = await createContract("TestShareToken");
        await stk.initialize("TEST", "TEST", liquidityPool.address);

        await liquidityPool.setShareToken(stk.address);

        ctk = await createContract("CustomERC20", ["collateral", "CTK", 18]);
        await liquidityPool.setCollateralToken(ctk.address, 18);

        let now = Math.floor(Date.now() / 1000);
        oracle1 = await createContract("OracleAdaptor", ["ctk", "ctk"]);
        await oracle1.setIndexPrice(toWei('100'), now);
        await oracle1.setMarkPrice(toWei('100'), now);
        await liquidityPool.createPerpetual(
            oracle1.address,
            // imr       mmr         operatorfr       lpfr             rebate      penalty         keeper      insur       oi
            [toWei("1"), toWei("1"), toWei("0.0001"), toWei("0.0007"), toWei("0"), toWei("0.005"), toWei("1"), toWei("0"), toWei("1")],
            [toWei("0.001"), toWei("1"), toWei("0.9"), toWei("5"), toWei("0.5"), toWei('0.2'), toWei("0.01"), toWei("1"), toWei("0")],
        )
        oracle2 = await createContract("OracleAdaptor", ["ctk", "ctk"]);
        await oracle2.setIndexPrice(toWei('100'), now);
        await oracle2.setMarkPrice(toWei('100'), now);
        await liquidityPool.createPerpetual(
            oracle2.address,
            // imr       mmr         operatorfr       lpfr             rebate      penalty         keeper      insur       oi
            [toWei("1"), toWei("1"), toWei("0.0001"), toWei("0.0007"), toWei("0"), toWei("0.005"), toWei("1"), toWei("0"), toWei("1")],
            [toWei("0.001"), toWei("1"), toWei("0.9"), toWei("5"), toWei("0.5"), toWei('0.2'), toWei("0.01"), toWei("1"), toWei("0")],
        )
        await liquidityPool.setState(0, 2);
        await liquidityPool.setState(1, 2);
        await liquidityPool.updatePrice(now);
    })

    describe('liquidity', function () {
        const successCases = [
            {
                name: 'init',
                amm: {
                    cash: 0,
                    position1: 0,
                    position2: 0,
                },
                totalShare: 0,
                marginToAdd: toWei('1000'),
                share: toWei('1000')
            },
            {
                name: 'before safe, after safe',
                amm: {
                    cash: toWei("10100"),
                    position1: toWei("-10"),
                    position2: toWei("10"),
                },
                totalShare: toWei('100'),
                marginToAdd: toWei('1000'),
                share: toWei('10.091666030631452052')
            },
            {
                name: 'short, before unsafe, after unsafe',
                amm: {
                    cash: toWei("17692"),
                    position1: toWei("-80"),
                    position2: toWei("10"),
                },
                totalShare: toWei('100'),
                marginToAdd: toWei('576'),
                share: toWei('5.321016166281755196')
            },
            {
                name: 'short, before unsafe, after safe',
                amm: {
                    cash: toWei("17692"),
                    position1: toWei("-80"),
                    position2: toWei("10"),
                },
                totalShare: toWei('100'),
                marginToAdd: toWei('577'),
                share: toWei('6.021800176340430529')
            },
            {
                name: 'long, before unsafe, after unsafe',
                amm: {
                    cash: toWei('1996'),
                    position1: toWei('80'),
                    position2: toWei('10'),
                },
                totalShare: toWei('100'),
                marginToAdd: toWei('576'),
                share: toWei('5.321016166281755196')
            },
            {
                name: 'long, before unsafe, after safe',
                amm: {
                    cash: toWei('1996'),
                    position1: toWei('80'),
                    position2: toWei('10'),
                },
                totalShare: toWei('100'),
                marginToAdd: toWei('577'),
                share: toWei('6.021800176340430529')
            }
        ]

        successCases.forEach(element => {
            it(element.name, async () => {
                await ctk.mint(user1.address, element.marginToAdd);
                await ctk.connect(user1).approve(liquidityPool.address, toWei("1000000"));
                await stk.debugMint(user2.address, element.totalShare);

                await liquidityPool.setPoolCash(element.amm.cash)
                await liquidityPool.setMarginAccount(0, liquidityPool.address, 0, element.amm.position1);
                await liquidityPool.setMarginAccount(1, liquidityPool.address, 0, element.amm.position2);
                await liquidityPool.setUnitAccumulativeFunding(0, toWei("1.9"));
                await liquidityPool.setUnitAccumulativeFunding(1, toWei("1.9"));

                await liquidityPool.addLiquidity(user1.address, element.marginToAdd);
                expect(await stk.balanceOf(user1.address)).approximateBigNumber(element.share);
                expect(await ctk.balanceOf(user1.address)).approximateBigNumber("0");
            })
        })

        const failCases = [
            {
                name: 'invalid margin to add',
                totalShare: toWei('100'),
                marginToAdd: toWei("0"),
                errorMsg: 'cash amount must be positive'
            },
            {
                name: 'poolMargin = 0 && totalShare != 0',
                totalShare: toWei('100'),
                marginToAdd: toWei('100'),
                errorMsg: 'share token has no value'
            }
        ]

        failCases.forEach(element => {
            it(element.name, async () => {
                await ctk.mint(user1.address, element.marginToAdd);
                await ctk.connect(user1).approve(liquidityPool.address, toWei("1000000"));
                await stk.debugMint(user2.address, element.totalShare);

                await liquidityPool.setUnitAccumulativeFunding(1, toWei("1.9"));

                await expect(liquidityPool.addLiquidity(user1.address, element.marginToAdd)).to.be.revertedWith(element.errorMsg);
            })
        })

        it('donate', async function () {
            await ctk.mint(user1.address, toWei('1000'));
            await ctk.connect(user1).approve(liquidityPool.address, toWei("1000000"));

            await liquidityPool.donateLiquidity(user1.address, toWei('1000'));
            expect(await stk.balanceOf(user1.address)).approximateBigNumber("0");
            expect(await ctk.balanceOf(user1.address)).approximateBigNumber("0");
            expect(await ctk.balanceOf(liquidityPool.address)).approximateBigNumber(toWei('1000'));
        })
    });


    describe('remove liquidity', function () {

        const successCases = [
            {
                name: 'no position',
                amm: {
                    cash: toWei('10000'),
                    position1: toWei("0"),
                    position2: toWei("0"),
                },
                shareLeft: toWei('90'), // total 100
                shareToRemove: toWei('10'),
                marginToRemove: toWei('1000'),
                state1: 2,
                state2: 2,
                insuranceFund: toWei('100'),
                donatedInsuranceFund: toWei('10')
            },
            {
                name: 'no position, remove all',
                amm: {
                    cash: toWei('10000'),
                    position1: toWei("0"),
                    position2: toWei("0"),
                },
                shareLeft: toWei("0"), // total 100
                shareToRemove: toWei('100'),
                marginToRemove: toWei('10000'),
                state1: 2,
                state2: 2,
                insuranceFund: toWei('100'),
                donatedInsuranceFund: toWei('10')
            },
            {
                name: 'short',
                amm: {
                    cash: toWei('10100'),
                    position1: toWei("-10"),
                    position2: toWei("10"),
                },
                shareLeft: toWei('90'), // total 100
                shareToRemove: toWei('10'),
                marginToRemove: toWei('988.888888888888888889'),
                state1: 2,
                state2: 2,
                insuranceFund: toWei('100'),
                donatedInsuranceFund: toWei('10')
            },
            {
                name: 'long',
                amm: {
                    cash: toWei('8138'),
                    position1: toWei("10"),
                    position2: toWei("10"),
                },
                shareLeft: toWei('90'), // total 100
                shareToRemove: toWei('10'),
                marginToRemove: toWei('988.888888888888888889'),
                state1: 2,
                state2: 2,
                insuranceFund: toWei('100'),
                donatedInsuranceFund: toWei('10')
            },
            {
                name: 'state != NORMAL',
                amm: {
                    cash: toWei('8138'),
                    position1: toWei("10"),
                    position2: toWei("10"),
                },
                shareLeft: toWei('90'), // total 100
                shareToRemove: toWei('10'),
                marginToRemove: toWei('900.254206888432336934'),
                state1: 2,
                state2: 3,
                insuranceFund: toWei('100'),
                donatedInsuranceFund: toWei('10')
            },
            {
                name: 'all states CLEARED ',
                amm: {
                    cash: toWei('8138'),
                    position1: toWei("10"),
                    position2: toWei("10"),
                },
                shareLeft: toWei('90'), // total 100
                shareToRemove: toWei('10'),
                marginToRemove: toWei('824.8'),
                state1: 4,
                state2: 4,
                insuranceFund: toWei('90'),
                donatedInsuranceFund: toWei('9')
            }
        ]

        successCases.forEach(element => {
            it(element.name, async () => {
                await ctk.mint(liquidityPool.address, element.marginToRemove);
                await ctk.connect(user1).approve(liquidityPool.address, toWei("1000000"));
                await stk.debugMint(user1.address, element.shareToRemove);
                await stk.debugMint(user2.address, element.shareLeft);

                await liquidityPool.setPoolCash(element.amm.cash)
                await liquidityPool.setMarginAccount(0, liquidityPool.address, 0, element.amm.position1);
                await liquidityPool.setMarginAccount(1, liquidityPool.address, 0, element.amm.position2);
                await liquidityPool.setUnitAccumulativeFunding(0, toWei("1.9"));
                await liquidityPool.setUnitAccumulativeFunding(1, toWei("1.9"));

                await liquidityPool.setState(0, element.state1)
                await liquidityPool.setState(1, element.state2)
                await liquidityPool.setInsuranceFund(toWei("100"))
                await liquidityPool.setDonatedInsuranceFund(toWei("10"))
                await ctk.mint(liquidityPool.address, toWei("110"));
                await liquidityPool.removeLiquidity(user1.address, element.shareToRemove, 0);
                expect(await liquidityPool.getInsuranceFund()).approximateBigNumber(element.insuranceFund)
                expect(await liquidityPool.getDonatedInsuranceFund()).approximateBigNumber(element.donatedInsuranceFund)
                expect(await ctk.balanceOf(user1.address)).approximateBigNumber(element.marginToRemove);
                expect(await stk.balanceOf(user1.address)).approximateBigNumber(toWei("0"));
                expect(await stk.totalSupply()).approximateBigNumber(element.shareLeft);

            })
        })

        successCases.forEach(element => {
            it(element.name, async () => {
                await ctk.mint(liquidityPool.address, element.marginToRemove);
                await ctk.connect(user1).approve(liquidityPool.address, toWei("1000000"));
                await stk.debugMint(user1.address, element.shareToRemove);
                await stk.debugMint(user2.address, element.shareLeft);

                await liquidityPool.setPoolCash(element.amm.cash)
                await liquidityPool.setMarginAccount(0, liquidityPool.address, 0, element.amm.position1);
                await liquidityPool.setMarginAccount(1, liquidityPool.address, 0, element.amm.position2);
                await liquidityPool.setUnitAccumulativeFunding(0, toWei("1.9"));
                await liquidityPool.setUnitAccumulativeFunding(1, toWei("1.9"));

                await liquidityPool.setState(0, element.state1)
                await liquidityPool.setState(1, element.state2)
                await liquidityPool.setInsuranceFund(toWei("100"))
                await liquidityPool.setDonatedInsuranceFund(toWei("10"))
                await ctk.mint(liquidityPool.address, toWei("110"));
                await liquidityPool.removeLiquidity(user1.address, 0, element.marginToRemove);
                expect(await liquidityPool.getInsuranceFund()).approximateBigNumber(element.insuranceFund)
                expect(await liquidityPool.getDonatedInsuranceFund()).approximateBigNumber(element.donatedInsuranceFund)
                expect(await ctk.balanceOf(user1.address)).approximateBigNumber(element.marginToRemove);
                expect(await stk.balanceOf(user1.address)).approximateBigNumber(toWei("0"));
                expect(await stk.totalSupply()).approximateBigNumber(element.shareLeft);
            })
        })

        const failCases = [
            {
                name: 'zero share to remove',
                amm: {
                    cash: toWei("0"),
                    position1: toWei("0"),
                    position2: toWei("0"),
                },
                shareLeft: toWei('100'), // total 100
                shareBalance: toWei("0"),
                shareToRemove: toWei("0"),
                marginToRemove: toWei("0"),
                ammMaxLeverage: toWei("5"),
                errorMsg: 'invalid parameter',
            },
            {
                name: 'short, before unsafe',
                amm: {
                    cash: toWei("17692"),
                    position1: toWei("-80"),
                    position2: toWei("10"),
                },
                shareLeft: toWei('90'), // total 100
                shareBalance: toWei('10'),
                shareToRemove: toWei('10'),
                marginToRemove: toWei('10'),
                ammMaxLeverage: toWei("5"),
                errorMsg: 'AMM is unsafe before removing liquidity',
            },
            {
                name: 'long, before unsafe',
                amm: {
                    cash: toWei("1996"),
                    position1: toWei("80"),
                    position2: toWei("10"),
                },
                shareLeft: toWei('90'), // total 100
                shareBalance: toWei('10'),
                shareToRemove: toWei('10'),
                marginToRemove: toWei('10'),
                ammMaxLeverage: toWei("5"),
                errorMsg: 'AMM is unsafe before removing liquidity',
            },
            {
                name: 'short, after unsafe',
                amm: {
                    cash: toWei('10100'),
                    position1: toWei("-10"),
                    position2: toWei("10"),
                },
                shareLeft: toWei('9.999'), // total 100
                shareBalance: toWei('90.001'),
                shareToRemove: toWei('90.001'),
                marginToRemove: toWei('8101'),
                ammMaxLeverage: toWei("5"),
                errorMsg: 'AMM is unsafe after removing liquidity',
            },
            {
                name: 'long, after unsafe',
                amm: {
                    cash: toWei('8138'),
                    position1: toWei("10"),
                    position2: toWei("10"),
                },
                shareLeft: toWei('9.999'), // total 100
                shareBalance: toWei('90.001'),
                shareToRemove: toWei('90.001'),
                marginToRemove: toWei('8101'),
                ammMaxLeverage: toWei("5"),
                errorMsg: 'AMM is unsafe after removing liquidity',
            },
            {
                name: 'long, after negative price',
                amm: {
                    cash: toWei('1664'),
                    position1: toWei("50"),
                    position2: toWei("10"),
                },
                shareLeft: toWei('99.999'), // total 100
                shareBalance: toWei('0.001'),
                shareToRemove: toWei('0.001'),
                marginToRemove: toWei('0.001'),
                ammMaxLeverage: toWei("5"),
                errorMsg: 'AMM is unsafe after removing liquidity',
            },
            {
                name: 'long, after exceed leverage',
                amm: {
                    cash: toWei('8138'),
                    position1: toWei("10"),
                    position2: toWei("10"),
                },
                shareLeft: toWei('99.999'), // total 100
                shareBalance: toWei('0.001'),
                shareToRemove: toWei('0.001'),
                marginToRemove: toWei('0.001'),
                ammMaxLeverage: toWei('0.1'),
                errorMsg: 'AMM exceeds max leverage after removing liquidity',
            }
        ]

        failCases.forEach(element => {
            it(element.name, async () => {
                await liquidityPool.setState(0, 2);
                await liquidityPool.setState(1, 2);
                await liquidityPool.setPerpetualRiskParameter(0, toBytes32("ammMaxLeverage"), element.ammMaxLeverage, element.ammMaxLeverage, element.ammMaxLeverage);
                await liquidityPool.setPerpetualRiskParameter(1, toBytes32("ammMaxLeverage"), element.ammMaxLeverage, element.ammMaxLeverage, element.ammMaxLeverage);

                await ctk.connect(user1).approve(liquidityPool.address, toWei("1000000"));
                await stk.debugMint(user2.address, element.shareLeft);
                await stk.debugMint(user1.address, element.shareBalance);

                await liquidityPool.setPoolCash(element.amm.cash)
                await liquidityPool.setMarginAccount(0, liquidityPool.address, 0, element.amm.position1);
                await liquidityPool.setMarginAccount(1, liquidityPool.address, 0, element.amm.position2);
                await liquidityPool.setUnitAccumulativeFunding(0, toWei("1.9"));
                await liquidityPool.setUnitAccumulativeFunding(1, toWei("1.9"));

                await expect(liquidityPool.removeLiquidity(user1.address, element.shareToRemove, 0)).to.be.revertedWith(element.errorMsg);
                await expect(liquidityPool.removeLiquidity(user1.address, 0, element.marginToRemove)).to.be.revertedWith(element.errorMsg);
            })
        })

        it('pool margin = 0', async () => {
            await liquidityPool.setPerpetualRiskParameter(0, toBytes32("ammMaxLeverage"), toWei("5"), toWei("5"), toWei("5"));
            await liquidityPool.setPerpetualRiskParameter(1, toBytes32("ammMaxLeverage"), toWei("5"), toWei("5"), toWei("5"));
            await ctk.connect(user1).approve(liquidityPool.address, toWei("1000000"));
            await stk.debugMint(user2.address, toWei('90'));
            await stk.debugMint(user1.address, toWei("10"));

            await liquidityPool.setPoolCash(0)
            await liquidityPool.setMarginAccount(0, liquidityPool.address, 0, 0);
            await liquidityPool.setMarginAccount(1, liquidityPool.address, 0, 0);

            await expect(liquidityPool.removeLiquidity(user1.address, toWei("1"), 0)).to.be.revertedWith('pool margin must be positive');
            await expect(liquidityPool.removeLiquidity(user1.address, 0, toWei("1"))).to.be.revertedWith('AMM is unsafe after removing liquidity');
        })

        it('zero supply of share token', async () => {
            await liquidityPool.setPerpetualRiskParameter(0, toBytes32("ammMaxLeverage"), toWei("5"), toWei("5"), toWei("5"));
            await liquidityPool.setPerpetualRiskParameter(1, toBytes32("ammMaxLeverage"), toWei("5"), toWei("5"), toWei("5"));
            await ctk.connect(user1).approve(liquidityPool.address, toWei("1000000"));
            await stk.debugMint(user2.address, toWei('0'));
            await stk.debugMint(user1.address, toWei("0"));

            await liquidityPool.setPoolCash(toWei("10"))
            await liquidityPool.setMarginAccount(0, liquidityPool.address, 0, 0);
            await liquidityPool.setMarginAccount(1, liquidityPool.address, 0, 0);

            await expect(liquidityPool.removeLiquidity(user1.address, toWei("1"), 0)).to.be.revertedWith('total supply of share token is zero when removing liquidity');
            await expect(liquidityPool.removeLiquidity(user1.address, 0, toWei("1"))).to.be.revertedWith('total supply of share token is zero when removing liquidity');
        })

    })
})
