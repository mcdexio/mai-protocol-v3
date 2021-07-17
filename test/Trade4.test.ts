import { expect } from "chai";
const { ethers } = require("hardhat");
import {
    toWei,
    fromWei,
    fromBytes32,
    toBytes32,
    getAccounts,
    createContract,
    deployPoolCreator,
} from '../scripts/utils';

import "./helper";

describe('TradeModule4 - auto deposit/withdraw with targetLeverage', () => {
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
        let USE_TARGET_LEVERAGE = 0x8000000;
        let IS_CLOSE_ONLY = 0x80000000;

        let testTrade;
        let ctk;
        let oracle;
        let mocker;

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
            await oracle.setMarkPrice(toWei("1000"), now);
            await oracle.setIndexPrice(toWei("1000"), now);
            const AMMModule = await createContract("AMMModule");
            const CollateralModule = await createContract("CollateralModule")
            const PerpetualModule = await createContract("PerpetualModule");
            const OrderModule = await createContract("OrderModule");
            const LiquidityPoolModule = await createContract("LiquidityPoolModule", [], { CollateralModule, AMMModule, PerpetualModule });
            const LiquidityPoolModule2 = await createContract("LiquidityPoolModule2", [], { CollateralModule, PerpetualModule, LiquidityPoolModule });

            const MockAMMModule = await createContract("MockAMMModule");
            const TradeModule = await createContract("TradeModule", [], { AMMModule: MockAMMModule, LiquidityPoolModule, LiquidityPoolModule2 });
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
                [toWei("0.1"), toWei("0.05"), toWei("0.0001"), toWei("0.0007"), toWei("0"), toWei("0.005"), toWei("1"), toWei("0"), toWei("1")],
                [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0"), toWei("5"), toWei("0.2"), toWei("0.01"), toWei("1")],
            )
            await testTrade.setOperator(user0.address)
            await testTrade.setVault(user4.address, toWei("0.0002"))
            await testTrade.setCollateralToken(ctk.address, 18);
            await ctk.mint(testTrade.address, toWei("10000000000"));

            mocker = await createContract("MockAMMPriceEntries");
            await testTrade.setGovernor(mocker.address);
            await testTrade.setState(0, 2);
        })

        it("regular - 1x", async () => {
            let now = Math.floor(Date.now() / 1000);
            await testTrade.updatePrice(now);

            await mocker.setPrice(toWei("1000"));

            await ctk.mint(user1.address, toWei("10000"));
            await ctk.connect(user1).approve(testTrade.address, toWei("10000"))

            await ctk.mint(testTrade.address, toWei("1000"));
            await testTrade.setTotalCollateral(0, toWei("1000"));

            await testTrade.setTargetLeverage(0, user1.address, toWei("1")); // 1x target leverage
            await testTrade.setMarginAccount(0, testTrade.address, toWei("10000"), toWei("0"));

            // deposit 1000 * 1 / 1 + 1000 * 1 * 0.1% + 1gas = 1002
            await testTrade.connect(user1).trade(0, user1.address, toWei("1"), toWei("20000"), none, USE_TARGET_LEVERAGE);
            var { cash, position } = await testTrade.getMarginAccount(0, user1.address);
            expect(cash).approximateBigNumber(toWei("1"))
            expect(position).to.equal(toWei("1"))
            expect(await ctk.balanceOf(user1.address)).approximateBigNumber(toWei("8998"))
        })

        it("close", async () => {
            let now = Math.floor(Date.now() / 1000);
            await testTrade.updatePrice(now);
            await mocker.setPrice(toWei("1000"));

            await ctk.mint(testTrade.address, toWei("100000"));
            await testTrade.setTotalCollateral(0, toWei("100000"));

            await testTrade.setMarginAccount(0, user1.address, toWei("10000"), toWei("10")); // (10000 + 10 * 1000 - 1) / 10000 = 2:1
            await testTrade.setMarginAccount(0, testTrade.address, toWei("10000"), toWei("0"));

            // close only
            await expect(testTrade.connect(user1).trade(0, user1.address, toWei("1"), toWei("20000"), none, IS_CLOSE_ONLY)).to.be.revertedWith("trader must be close only");
            await testTrade.connect(user1).trade(0, user1.address, toWei("-1"), toWei("0"), none, USE_TARGET_LEVERAGE + IS_CLOSE_ONLY);
            var { cash, position } = await testTrade.getMarginAccount(0, user1.address);
            expect(cash).to.equal(toWei("9000.1"))  // margin = 1800.1 because (1800.1 - 1) / 9 = (20000 - 1) / 10
            expect(position).to.equal(toWei("9"))
            expect(await ctk.balanceOf(user1.address)).to.equal(toWei("1998.9"))

            var { cash, position } = await testTrade.getMarginAccount(0, testTrade.address);
            expect(position).to.equal(toWei("1"))
            expect(cash).to.equal(toWei("-899.3")) // rebalance. margin = 1 * 1000 * 10% = 100. cash = margin - 1 * 1000 + 0.07%(lpfee)
            expect(await testTrade.getPoolCash()).to.equal(toWei("9900"))
        })
    })
})
