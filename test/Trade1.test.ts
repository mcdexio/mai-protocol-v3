import { expect } from "chai";
const { ethers } = require("hardhat");
import {
    toWei,
    fromWei,
    fromBytes32,
    toBytes32,
    getAccounts,
    createContract,
} from '../scripts/utils';

import "./helper";

describe('TradeModule1', () => {
    let accounts;

    before(async () => {
        accounts = await getAccounts();
    })

    describe('basic', async () => {
        let user0;
        let user1;
        let user2;
        let user3;
        let user4;
        let user5;
        let none = "0x0000000000000000000000000000000000000000";

        let testTrade;
        let ctk;
        let oracle;

        beforeEach(async () => {
            user0 = accounts[0];
            user1 = accounts[1];
            user2 = accounts[2];
            user3 = accounts[3];
            user4 = accounts[4];
            user5 = accounts[5];

            ctk = await createContract("CustomERC20", ["collateral", "CTK", 18]);
            oracle = await createContract("OracleAdaptor", ["ctk", "ctk"]);
            let now = Math.floor(Date.now() / 1000);
            await oracle.setMarkPrice(toWei("6965"), now);
            await oracle.setIndexPrice(toWei("7000"), now);
            const AMMModule = await createContract("AMMModule");
            const CollateralModule = await createContract("CollateralModule")
            const PerpetualModule = await createContract("PerpetualModule");
            const OrderModule = await createContract("OrderModule");
            const LiquidityPoolModule = await createContract("LiquidityPoolModule", [], { CollateralModule, AMMModule, PerpetualModule });
            const LiquidityPoolModule2 = await createContract("LiquidityPoolModule2", [], { CollateralModule, PerpetualModule, LiquidityPoolModule });
            const TradeModule = await createContract("TradeModule", [], { AMMModule, LiquidityPoolModule, LiquidityPoolModule2 });
            testTrade = await createContract("TestTrade", [], {
                PerpetualModule,
                CollateralModule,
                LiquidityPoolModule,
                LiquidityPoolModule2,
                OrderModule,
                TradeModule,
            });
            await testTrade.createPerpetual(
                oracle.address,
                // imr         mmr            operatorfr       lpfr             rebate      penalty         keeper      insur       oi
                [toWei("0.1"), toWei("0.05"), toWei("0.0001"), toWei("0.0007"), toWei("0"), toWei("0.005"), toWei("1"), toWei("0"), toWei("10")],
                [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.2"), toWei("0.01"), toWei("1")],
            )
            await testTrade.setOperator(user1.address)
            await testTrade.setVault(user4.address, toWei("0.0002"))
            await testTrade.setCollateralToken(ctk.address, 18);
            await ctk.mint(testTrade.address, toWei("10000000000"));
        })

        it('getFees', async () => {
            // lp = 0.0007, op = 0.0001, vault = 0.0002
            await testTrade.setMarginAccount(0, user0.address, toWei("1000"), toWei("0"));
            var { lpFee, operatorFee, vaultFee, referralRebate } = await testTrade.getFees(0, user0.address, none, toWei("100"), false);
            expect(lpFee).to.equal(toWei("0.07"));
            expect(operatorFee).to.equal(toWei("0.01"));
            expect(vaultFee).to.equal(toWei("0.02"));
            expect(referralRebate).to.equal(toWei("0"));
            // total 0.1

            await testTrade.setMarginAccount(0, user0.address, toWei("0.05"), toWei("0"));
            var { lpFee, operatorFee, vaultFee, referralRebate } = await testTrade.getFees(0, user0.address, none, toWei("100"), false);
            expect(lpFee).to.equal(toWei("0.035"));
            expect(operatorFee).to.equal(toWei("0.005"));
            expect(vaultFee).to.equal(toWei("0.01"));
            expect(referralRebate).to.equal(toWei("0"));

            await testTrade.setMarginAccount(0, user0.address, toWei("0"), toWei("0"));
            var { lpFee, operatorFee, vaultFee, referralRebate } = await testTrade.getFees(0, user0.address, none, toWei("100"), false);
            expect(lpFee).to.equal(toWei("0"));
            expect(operatorFee).to.equal(toWei("0"));
            expect(vaultFee).to.equal(toWei("0"));
            expect(referralRebate).to.equal(toWei("0"));

            await testTrade.setMarginAccount(0, user0.address, toWei("-1"), toWei("0"));
            var { lpFee, operatorFee, vaultFee, referralRebate } = await testTrade.getFees(0, user0.address, none, toWei("100"), false);
            expect(lpFee).to.equal(toWei("0"));
            expect(operatorFee).to.equal(toWei("0"));
            expect(vaultFee).to.equal(toWei("0"));
            expect(referralRebate).to.equal(toWei("0"));
        })

        it('getFees - rebate', async () => {
            await testTrade.setPerpetualBaseParameter(0, toBytes32("referralRebateRate"), toWei("0"));
            await testTrade.setMarginAccount(0, user0.address, toWei("1000"), toWei("0"));
            var { lpFee, operatorFee, vaultFee, referralRebate } = await testTrade.getFees(0, user0.address, user2.address, toWei("100"), false);
            expect(lpFee).to.equal(toWei("0.07"));
            expect(operatorFee).to.equal(toWei("0.01"));
            expect(vaultFee).to.equal(toWei("0.02"));
            expect(referralRebate).to.equal(toWei("0"));

            await testTrade.setPerpetualBaseParameter(0, toBytes32("referralRebateRate"), toWei("0.5"));
            await testTrade.setMarginAccount(0, user0.address, toWei("1000"), toWei("0"));
            var { lpFee, operatorFee, vaultFee, referralRebate } = await testTrade.getFees(0, user0.address, user2.address, toWei("100"), false);
            expect(lpFee).to.equal(toWei("0.035"));
            expect(operatorFee).to.equal(toWei("0.005"));
            expect(vaultFee).to.equal(toWei("0.02"));
            expect(referralRebate).to.equal(toWei("0.04"));

            await testTrade.setMarginAccount(0, user0.address, toWei("0.1"), toWei("0"));
            var { lpFee, operatorFee, vaultFee, referralRebate } = await testTrade.getFees(0, user0.address, user2.address, toWei("100"), false);
            expect(lpFee).to.equal(toWei("0.035"));
            expect(operatorFee).to.equal(toWei("0.005"));
            expect(vaultFee).to.equal(toWei("0.02"));
            expect(referralRebate).to.equal(toWei("0.04"));

            await testTrade.setMarginAccount(0, user0.address, toWei("0.05"), toWei("0"));
            var { lpFee, operatorFee, vaultFee, referralRebate } = await testTrade.getFees(0, user0.address, user2.address, toWei("100"), false);
            expect(lpFee).to.equal(toWei("0.0175"));
            expect(operatorFee).to.equal(toWei("0.0025"));
            expect(vaultFee).to.equal(toWei("0.01"));
            expect(referralRebate).to.equal(toWei("0.02"));

            await testTrade.setMarginAccount(0, user0.address, toWei("0"), toWei("0"));
            var { lpFee, operatorFee, vaultFee, referralRebate } = await testTrade.getFees(0, user0.address, user2.address, toWei("100"), false);
            expect(lpFee).to.equal(toWei("0"));
            expect(operatorFee).to.equal(toWei("0"));
            expect(vaultFee).to.equal(toWei("0"));
            expect(referralRebate).to.equal(toWei("0"));

            await testTrade.setMarginAccount(0, user0.address, toWei("-1"), toWei("0"));
            var { lpFee, operatorFee, vaultFee, referralRebate } = await testTrade.getFees(0, user0.address, user2.address, toWei("100"), false);
            expect(lpFee).to.equal(toWei("0"));
            expect(operatorFee).to.equal(toWei("0"));
            expect(vaultFee).to.equal(toWei("0"));
            expect(referralRebate).to.equal(toWei("0"));
        })

        it('getFees - open', async () => {
            await testTrade.setMarginAccount(0, user0.address, toWei("0.1"), toWei("0"));
            var { lpFee, operatorFee, vaultFee, referralRebate } = await testTrade.getFees(0, user0.address, none, toWei("100"), true);
            expect(lpFee).to.equal(toWei("0.07"));
            expect(operatorFee).to.equal(toWei("0.01"));
            expect(vaultFee).to.equal(toWei("0.02"));
            expect(referralRebate).to.equal(toWei("0"));

            await testTrade.setPerpetualBaseParameter(0, toBytes32("referralRebateRate"), toWei("0.5"));
            await testTrade.setMarginAccount(0, user0.address, toWei("0.1"), toWei("0"));
            var { lpFee, operatorFee, vaultFee, referralRebate } = await testTrade.getFees(0, user0.address, user2.address, toWei("100"), true);
            expect(lpFee).to.equal(toWei("0.035"));
            expect(operatorFee).to.equal(toWei("0.005"));
            expect(vaultFee).to.equal(toWei("0.02"));
            expect(referralRebate).to.equal(toWei("0.04"));

            await testTrade.setMarginAccount(0, user0.address, toWei("0.09"), toWei("0"));
            var { lpFee, operatorFee, vaultFee, referralRebate } = await testTrade.getFees(0, user0.address, none, toWei("100"), true);
            expect(lpFee).to.equal(toWei("0.07"));
            expect(operatorFee).to.equal(toWei("0.01"));
            expect(vaultFee).to.equal(toWei("0.02"));
            expect(referralRebate).to.equal(toWei("0"));
        })

        describe('postTrade', async () => {

            beforeEach(async () => {
                await ctk.mint(testTrade.address, toWei("100"));
                await testTrade.setTotalCollateral(0, toWei("100"));
            })

            it("hasOpenedPosition", async () => {
                expect(await testTrade.hasOpenedPosition(10, -11)).to.be.false; // 21 => 10
                expect(await testTrade.hasOpenedPosition(10, -1)).to.be.false;  // 11 => 10
                expect(await testTrade.hasOpenedPosition(10, 1)).to.be.true;    // 9 => 10
                expect(await testTrade.hasOpenedPosition(10, 2)).to.be.true;    // 8 => 10
                expect(await testTrade.hasOpenedPosition(10, 10)).to.be.true;   // 0 => 10
                expect(await testTrade.hasOpenedPosition(10, 11)).to.be.true;   //-1 => 10

                expect(await testTrade.hasOpenedPosition(-10, -11)).to.be.true; // 1  => -10
                expect(await testTrade.hasOpenedPosition(-10, -10)).to.be.true; // 0  => -10
                expect(await testTrade.hasOpenedPosition(-10, -1)).to.be.true;  // -9 => -10
                expect(await testTrade.hasOpenedPosition(-10, 1)).to.be.false;  //-11 => -10
                expect(await testTrade.hasOpenedPosition(-10, 2)).to.be.false;  //-12 => -10
                expect(await testTrade.hasOpenedPosition(-10, 10)).to.be.false; //-20 => -10
                expect(await testTrade.hasOpenedPosition(-10, 11)).to.be.false; //-21 => -10

                expect(await testTrade.hasOpenedPosition(0, 1)).to.be.false; //-21 => -10
                expect(await testTrade.hasOpenedPosition(0, 0)).to.be.false; //-21 => -10
                expect(await testTrade.hasOpenedPosition(0, -1)).to.be.false; //-21 => -10
            })

            it("postTrade - 1", async () => {
                await testTrade.setPerpetualBaseParameter(0, toBytes32("referralRebateRate"), toWei("0.5"));
                await testTrade.setMarginAccount(0, user0.address, toWei("1.1"), toWei("1"));
                await testTrade.postTrade(0, user0.address, user2.address, toWei("100"), toWei("-1"), 0) // close
                var { cash } = await testTrade.getMarginAccount(0, testTrade.address);
                expect(cash).to.equal(toWei("0.035")); // lp
                expect(await ctk.balanceOf(user2.address)).to.equal(toWei("0.04")); // referrer
                expect(await ctk.balanceOf(user4.address)).to.equal(toWei("0.02")); // vault
                expect(await ctk.balanceOf(user1.address)).to.equal(toWei("0.005")); // operator
                expect(await testTrade.getTotalCollateral(0)).to.equal(toWei("99.935"));  //
                expect(await ctk.balanceOf(testTrade.address)).to.equal(toWei("10000000099.935")); // op + lp
            });

            it("postTrade - 2", async () => {
                await testTrade.setMarginAccount(0, user0.address, toWei("1.1"), toWei("1"));
                await testTrade.postTrade(0, user0.address, user2.address, toWei("100"), toWei("-1"), 0) // close
                var { cash } = await testTrade.getMarginAccount(0, testTrade.address);
                expect(cash).to.equal(toWei("0.07")); // lp
                expect(await ctk.balanceOf(user2.address)).to.equal(toWei("0")); // referrer
                expect(await ctk.balanceOf(user4.address)).to.equal(toWei("0.02")); // vault
                expect(await ctk.balanceOf(user1.address)).to.equal(toWei("0.01")); // operator
                expect(await testTrade.getTotalCollateral(0)).to.equal(toWei("99.97"));  //
                expect(await ctk.balanceOf(testTrade.address)).to.equal(toWei("10000000099.97")); // op + lp
            });

            it("postTrade - 3", async () => {
                await testTrade.setMarginAccount(0, user0.address, toWei("1.05"), toWei("1"));
                await testTrade.postTrade(0, user0.address, user2.address, toWei("100"), toWei("1"), 0) // close
                var { cash } = await testTrade.getMarginAccount(0, testTrade.address);
                expect(cash).to.equal(toWei("0.035")); // lp
                expect(await ctk.balanceOf(user2.address)).to.equal(toWei("0")); // referrer
                expect(await ctk.balanceOf(user4.address)).to.equal(toWei("0.01")); // vault
                expect(await ctk.balanceOf(user1.address)).to.equal(toWei("0.005")); // operator
                expect(await testTrade.getTotalCollateral(0)).to.equal(toWei("99.985"));  //
                expect(await ctk.balanceOf(testTrade.address)).to.equal(toWei("10000000099.985")); // op + lp
            });
        })

        it('validatePrice', async () => {
            await testTrade.validatePrice(true, toWei("100"), toWei("100"));
            await testTrade.validatePrice(true, toWei("90"), toWei("100"));
            await testTrade.validatePrice(false, toWei("110"), toWei("100"));

            await expect(testTrade.validatePrice(true, toWei("-1"), toWei("100"))).to.be.revertedWith("price must be positive")
            await expect(testTrade.validatePrice(true, toWei("100.1"), toWei("100"))).to.be.revertedWith("price exceeds limit");
            await expect(testTrade.validatePrice(false, toWei("99.9"), toWei("100"))).to.be.revertedWith("price exceeds limit");
        })

        describe("trade", async () => {
            let user0;
            let user1;
            let user2;
            let user3;
            let user4;
            let user5;
            let testTrade;
            let oracle;

            beforeEach(async () => {
                user0 = accounts[0];
                user1 = accounts[1];
                user2 = accounts[2];
                user3 = accounts[3];
                user4 = accounts[4];
                user5 = accounts[5];

                ctk = await createContract("CustomERC20", ["collateral", "CTK", 18]);
                oracle = await createContract("OracleAdaptor", ["ctk", "ctk"]);
                let now = Math.floor(Date.now() / 1000);
                await oracle.setMarkPrice(toWei("6965"), now);
                await oracle.setIndexPrice(toWei("7000"), now);
                const AMMModule = await createContract("AMMModule");
                const CollateralModule = await createContract("CollateralModule")
                const PerpetualModule = await createContract("PerpetualModule");
                const OrderModule = await createContract("OrderModule");
                const LiquidityPoolModule = await createContract("LiquidityPoolModule", [], { CollateralModule, AMMModule, PerpetualModule });
                const LiquidityPoolModule2 = await createContract("LiquidityPoolModule2", [], { CollateralModule, PerpetualModule, LiquidityPoolModule });
                const TradeModule = await createContract("TradeModule", [], { AMMModule, LiquidityPoolModule, LiquidityPoolModule2 });
                testTrade = await createContract("TestTrade", [], {
                    PerpetualModule,
                    CollateralModule,
                    OrderModule,
                    LiquidityPoolModule,
                    LiquidityPoolModule2,
                    TradeModule,
                });
                await testTrade.createPerpetual(
                    oracle.address,
                    // imr         mmr            operatorfr       lpfr             rebate      penalty         keeper      insur            oi
                    [toWei("0.1"), toWei("0.05"), toWei("0.0001"), toWei("0.0008"), toWei("0"), toWei("0.005"), toWei("2"), toWei("0.0001"), toWei("1")],
                    [toWei("0.001"), toWei("0.014285714285714285"), toWei("0.012857142857142857"), toWei("0.005"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1")],
                )
                await testTrade.setOperator(user3.address)
                await testTrade.setVault(user4.address, toWei("0.0001"))
                await testTrade.setCollateralToken(ctk.address, 18);
                await testTrade.setState(0, 2);
                await testTrade.setUnitAccumulativeFunding(0, toWei("9.9059375"))
                await testTrade.setTotalCollateral(0, toWei("10000000000"));
                await ctk.mint(testTrade.address, toWei("10000000000"));
            })

            const testCases = [
                {
                    name: "sell",
                    marginAccount: {
                        cash: toWei('7698.86'),
                        position: toWei('2.3'),
                    },
                    input: {
                        amount: toWei("-0.5"),
                        limitPrice: toWei("0"),
                    },
                    expectOutput: {
                        cash: toWei("11178.8766232"),
                    }
                },
                {
                    name: "buy without cross 0",
                    marginAccount: {
                        cash: toWei('7698.86'),
                        position: toWei('2.3'),
                    },
                    input: {
                        amount: toWei("0.5"),
                        limitPrice: toWei("99999999999999"),
                    },
                    expectOutput: {
                        cash: toWei("4204.068831565497225683"),
                    }
                },
                {
                    name: "buy cross 0",
                    marginAccount: {
                        cash: toWei('7698.86'),
                        position: toWei('2.3'),
                    },
                    input: {
                        amount: toWei("3.3"),
                        limitPrice: toWei("99999999999999"),
                    },
                    expectOutput: {
                        cash: toWei("-15378.373986752065535528"),
                    }
                },
            ]

            testCases.forEach((testCase) => {
                it(testCase.name, async () => {
                    let now = Math.floor(Date.now() / 1000);
                    await testTrade.updatePrice(now);

                    await testTrade.setMarginAccount(0, user1.address, testCase.marginAccount.cash, testCase.marginAccount.position);
                    await testTrade.setMarginAccount(0, testTrade.address, toWei('83941.29865625'), toWei('2.3'));

                    await testTrade.connect(user1).trade(0, user1.address, testCase.input.amount, testCase.input.limitPrice, user5.address, 0);
                    var { cash } = await testTrade.callStatic.getMarginAccount(0, user1.address);
                    expect(cash).approximateBigNumber(testCase.expectOutput.cash);
                })
            })
        })
    })
})