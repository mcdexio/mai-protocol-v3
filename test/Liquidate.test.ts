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

describe('Liquidate', () => {
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
            const AMMModule = await createContract("MockAMMModule");
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

            let now = Math.floor(Date.now() / 1000);
            await oracle.setMarkPrice(toWei("1000"), now);
            await oracle.setIndexPrice(toWei("1000"), now);

            await testTrade.createPerpetual(
                oracle.address,
                // imr         mmr            operatorfr       lpfr             rebate      penalty         keeper      insur       oi
                [toWei("0.1"), toWei("0.05"), toWei("0.0001"), toWei("0.0007"), toWei("0"), toWei("0.005"), toWei("1"), toWei("0.1"), toWei("1")],
                [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.2"), toWei("0.01"), toWei("1"), toWei("0")],
            )
            await testTrade.setOperator(user0.address)
            await testTrade.setVault(user4.address, toWei("0.0002"))
            await testTrade.setCollateralToken(ctk.address, 18);
            await ctk.mint(testTrade.address, toWei("10000000000"));

            mocker = await createContract("MockAMMPriceEntries");
            await testTrade.setGovernor(mocker.address);
            await testTrade.setState(0, 2);
            await testTrade.updatePrice(now);
        })

        it("liquidateByAMM", async () => {
            await testTrade.setInsuranceFundCap(toWei("10000"));

            await mocker.setPrice(toWei("1000"));
            await ctk.mint(testTrade.address, toWei("1000"));
            await testTrade.setTotalCollateral(0, toWei("1000"));

            await testTrade.setMarginAccount(0, user2.address, toWei("5000"), toWei("0"));

            await testTrade.setMarginAccount(0, user1.address, toWei("-949"), toWei("1")); // 100 / 50
            await testTrade.setMarginAccount(0, testTrade.address, toWei("10000"), toWei("0"));
            await expect(testTrade.liquidateByAMM(0, user2.address, user1.address)).to.be.revertedWith("trader is safe");

            await testTrade.setMarginAccount(0, user1.address, toWei("-960"), toWei("1")); // im = 100 / magin = 40 / safe = 51
            await testTrade.setMarginAccount(0, testTrade.address, toWei("10000"), toWei("0"));
            await testTrade.liquidateByAMM(0, user2.address, user1.address);
            var { cash, position } = await testTrade.getMarginAccount(0, user1.address);
            expect(cash).to.equal(toWei("33.8")) // value = 1000, penalty = 1000 * 0.005,  || margin = 40  penalty = -5 -1 || vault = 0.2
            expect(position).to.equal(toWei("0"))
            expect(await ctk.balanceOf(user2.address)).to.equal(toWei("1"));
            expect(await testTrade.getInsuranceFund()).to.equal(toWei("0.5")) // insurance fund = penalty * 0.1
        })

        it("liquidateByAMM - bankrupt", async () => {
            await mocker.setPrice(toWei("1000"));
            await ctk.mint(testTrade.address, toWei("1000"));
            await testTrade.setTotalCollateral(0, toWei("13800"));

            await testTrade.setMarginAccount(0, user2.address, toWei("5000"), toWei("0"));

            await testTrade.setMarginAccount(0, user1.address, toWei("-1200"), toWei("1")); // im = 100 / magin = 40 / safe = 51
            await testTrade.setMarginAccount(0, testTrade.address, toWei("10000"), toWei("0"));
            await testTrade.liquidateByAMM(0, user2.address, user1.address);
            var { cash, position } = await testTrade.getMarginAccount(0, user1.address);
            expect(cash).to.equal(toWei("-201")) // margin = -200, keeper gas reward = 1, no penalty, no vault fee
            expect(position).to.equal(toWei("0"))
            expect(await ctk.balanceOf(user2.address)).to.equal(toWei("1"));
        })

        it("liquidateByAMM - vault fee", async () => {
            await testTrade.setInsuranceFundCap(toWei("10000"));

            await mocker.setPrice(toWei("1000"));
            await ctk.mint(testTrade.address, toWei("1000"));
            await testTrade.setTotalCollateral(0, toWei("1000"));

            await testTrade.setMarginAccount(0, user2.address, toWei("5000"), toWei("0"));

            await testTrade.setMarginAccount(0, user1.address, toWei("-949"), toWei("1")); // 100 / 50
            await testTrade.setMarginAccount(0, testTrade.address, toWei("10000"), toWei("0"));
            await expect(testTrade.liquidateByAMM(0, user2.address, user1.address)).to.be.revertedWith("trader is safe");

            expect(await ctk.balanceOf(user4.address)).to.equal(toWei("0"))

            await testTrade.setMarginAccount(0, user1.address, toWei("-960"), toWei("1")); // im = 100 / magin = 40 / safe = 51
            await testTrade.setMarginAccount(0, testTrade.address, toWei("10000"), toWei("0"));
            await testTrade.liquidateByAMM(0, user2.address, user1.address);
            var { cash, position } = await testTrade.getMarginAccount(0, user1.address);
            expect(cash).to.equal(toWei("33.8")) // value = 1000, penalty = 1000 * 0.005,  || margin = 40  penalty = -5 -1 || vault = 0.2
            expect(position).to.equal(toWei("0"))
            expect(await ctk.balanceOf(user2.address)).to.equal(toWei("1"));
            expect(await ctk.balanceOf(user4.address)).to.equal(toWei("0.2"))
            expect(await testTrade.getInsuranceFund()).to.equal(toWei("0.5")) // insurance fund = penalty * 0.1
        })


        it("liquidateByAMM - vault fee / bankrupt", async () => {
            await mocker.setPrice(toWei("1000"));
            await ctk.mint(testTrade.address, toWei("1000"));
            await testTrade.setTotalCollateral(0, toWei("13800"));
            await testTrade.setMarginAccount(0, user2.address, toWei("5000"), toWei("0"));

            expect(await ctk.balanceOf(user4.address)).to.equal(toWei("0"))

            await testTrade.setMarginAccount(0, user1.address, toWei("-1200"), toWei("1")); // im = 100 / magin = 40 / safe = 51
            await testTrade.setMarginAccount(0, testTrade.address, toWei("10000"), toWei("0"));
            await testTrade.liquidateByAMM(0, user2.address, user1.address);
            var { cash, position } = await testTrade.getMarginAccount(0, user1.address);
            expect(cash).to.equal(toWei("-201")) // margin = -200, keeper gas reward = 1, no penalty, no vault fee
            expect(position).to.equal(toWei("0"))
            expect(await ctk.balanceOf(user2.address)).to.equal(toWei("1"));

            expect(await ctk.balanceOf(user4.address)).to.equal(toWei("0"))
        })

        it("liquidateByAMM - vault fee / not bankrupt", async () => {
            await testTrade.setInsuranceFundCap(toWei("10000"));

            await mocker.setPrice(toWei("1000"));
            await ctk.mint(testTrade.address, toWei("2000"));
            await testTrade.setTotalCollateral(0, toWei("2000"));

            await testTrade.setMarginAccount(0, user2.address, toWei("5000"), toWei("0"));

            expect(await ctk.balanceOf(user4.address)).to.equal(toWei("0"))
            // marginbalance = 0 when cash = -994
            await testTrade.setMarginAccount(0, user1.address, toWei("-993.9"), toWei("1")); // im = 100 / magin = 40 / safe = 51
            await testTrade.setMarginAccount(0, testTrade.address, toWei("10000"), toWei("0"));
            await testTrade.liquidateByAMM(0, user2.address, user1.address);

            var { cash, position } = await testTrade.getMarginAccount(0, user1.address);
            expect(cash).to.equal(toWei("0")) // value = 1000, penalty = 1000 * 0.005,  || margin = 40  penalty = -5 -1
            expect(position).to.equal(toWei("0"))
            expect(await ctk.balanceOf(user2.address)).to.equal(toWei("1"));
            expect(await ctk.balanceOf(user4.address)).to.equal(toWei("0.1"))
            expect(await testTrade.getInsuranceFund()).to.equal(toWei("0.5")) // insurance fund = penalty * 0.1
        })
    })
})