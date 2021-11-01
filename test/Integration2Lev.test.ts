const { ethers } = require("hardhat");
import { expect } from "chai";

import "./helper";
import {
    toWei,
    createFactory,
    createContract,
    createLiquidityPoolFactory,
    deployPoolCreator
} from "../scripts/utils";

describe("integration2 - 2 perps. trade with targetLeverage", () => {
    // 200 << 7 = 25600
    let USE_2x_TARGET_LEVERAGE = 25600;
    let IS_CLOSE_ONLY = 0x80000000;

    let user0;
    let user1;
    let user2;
    let user3;
    let vault;
    const none = "0x0000000000000000000000000000000000000000";
    let perp;
    let ctk;
    let stk;
    let oracle1;
    let oracle2;

    let updatePrice = async (price1, price2) => {
        let now = Math.floor(Date.now() / 1000);
        await oracle1.setMarkPrice(price1, now);
        await oracle1.setIndexPrice(price1, now);
        await oracle2.setMarkPrice(price2, now);
        await oracle2.setIndexPrice(price2, now);
    }

    beforeEach(async () => {
        // users
        const accounts = await ethers.getSigners();
        user0 = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];
        vault = accounts[9];
        const LiquidityPoolFactory = await createLiquidityPoolFactory();

        // create components
        var symbol = await createContract("SymbolService");
        await symbol.initialize(10000);
        ctk = await createContract("CustomERC20", ["collateral", "CTK", 18]);
        var perp0Template = await LiquidityPoolFactory[0].deploy();
        var perp1Template = await LiquidityPoolFactory[1].deploy();
        var govTemplate = await createContract("TestLpGovernor");
        var poolCreator = await deployPoolCreator(symbol, vault, toWei("0.001"));
        await poolCreator.addVersion([perp0Template.address, perp1Template.address], govTemplate.address, 0, "initial version");
        await symbol.addWhitelistedFactory(poolCreator.address);

        const { liquidityPool, governor } = await poolCreator.callStatic.createLiquidityPool(
            ctk.address,
            18,
            998,
            ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1]),
        );
        await poolCreator.createLiquidityPool(
            ctk.address,
            18,
            998,
            ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1]),
        );
        perp = await ethers.getContractAt("LiquidityPoolAllHops", liquidityPool);

        // oracle
        oracle1 = await createContract("OracleAdaptor", ["USD", "ETH"]);
        oracle2 = await createContract("OracleAdaptor", ["USD", "ETH"]);
        await updatePrice(toWei("1000"), toWei("1000"))

        // create perpetual
        await perp.createPerpetual(oracle1.address,
            // imr         mmr            operatorfr       lpfr             rebate      penalty         keeper      insur       oi
            [toWei("0.01"), toWei("0.005"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.002"), toWei("0.5"), toWei("0.5"), toWei("4")],
            // alpha        beta1         beta2          frLimit     lev         maxClose       frFactor
            [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1"), toWei("0")],
            [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
            [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1"), toWei("0")],
        )
        await perp.createPerpetual(oracle2.address,
            // imr         mmr            operatorfr       lpfr             rebate      penalty         keeper      insur       oi
            [toWei("0.01"), toWei("0.005"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.002"), toWei("0.5"), toWei("0.5"), toWei("4")],
            [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1"), toWei("0")],
            [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
            [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1"), toWei("0")],
        )

        // share token
        const info = await perp.getLiquidityPoolInfo();
        stk = await (await createFactory("LpGovernor")).attach(info[2][4]);

        // get initial coins
        await ctk.mint(user1.address, toWei("10000"));
        await ctk.mint(user2.address, toWei("10000"));
        await ctk.mint(user3.address, toWei("10000"));
        await ctk.connect(user1).approve(perp.address, toWei("100000"));
        await ctk.connect(user2).approve(perp.address, toWei("100000"));
        await ctk.connect(user3).approve(perp.address, toWei("100000"));
    });

    it("get default target leverage", async () => {
        await perp.runLiquidityPool();

        const margin = await perp.getMarginAccount(0, user2.address);
        expect(margin.targetLeverage).to.equal(toWei("1"));
    })

    it("addLiq + tradeWithLev long 3, short 2, short 2, long 1", async () => {
        await perp.runLiquidityPool();

        // add liquidity
        await perp.connect(user2).addLiquidity(toWei("1000"));
        expect(await ctk.balanceOf(user2.address)).to.equal(toWei("9000"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1000")); // poolCash
        var { nums } = await perp.getPerpetualInfo(0);
        expect(nums[0]).to.equal(toWei("0")); // total collateral of perpetual
        var { nums } = await perp.getPerpetualInfo(1);
        expect(nums[0]).to.equal(toWei("0")); // total collateral of perpetual

        // long 3 (open)
        var activateAccounts = await perp.listActiveAccounts(0, 0, 10);
        // no active account
        expect(activateAccounts.length).to.equal(0);
        let now = Math.floor(Date.now() / 1000);
        {
            let { tradePrice, totalFee, cost } = await perp.callStatic.queryTrade(0, user1.address, toWei("3"), none, USE_2x_TARGET_LEVERAGE);
            expect(tradePrice).to.equal(toWei("1150"));
            expect(totalFee).to.equal(toWei("10.35"));
            expect(cost).to.equal(toWei("1960.85"));
        }
        await perp.connect(user1).trade(0, user1.address, toWei("3"), toWei("1150"), now + 999999, none, USE_2x_TARGET_LEVERAGE);
        // active account user1
        activateAccounts = await perp.listActiveAccounts(0, 0, 10);
        expect(activateAccounts[0]).to.equal(user1.address);
        var { cash, position, margin, isMaintenanceMarginSafe } = await perp.getMarginAccount(0, user1.address);
        // amm deltaCash = 3450
        // margin = cash + positionValue = 0.5 + | positionValue | / 2xLev = 1500.5. so cash = -1499.5
        // cash = deposit - 3450 - 3450 * 0.003(fee). so deposit = 1960.85
        expect(cash).to.equal(toWei("-1499.5"));
        expect(await ctk.balanceOf(user1.address)).to.equal(toWei("8039.15")); // 10000 - 1960.85
        expect(position).to.equal(toWei("3"));
        expect(margin).to.equal(toWei("1500.5"));
        expect(isMaintenanceMarginSafe).to.be.true;
        var { cash, position, margin } = await perp.getMarginAccount(0, perp.address); // AMM account
        expect(cash).to.equal(toWei("3453.45")); // 3450 - 3450 * 0.001(lpfee)
        expect(position).to.equal(toWei("-3"));
        expect(margin).to.equal(toWei("453.45"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1000")); // no rebalance, not changed
        expect(await ctk.balanceOf(user0.address)).to.equal(toWei("3.45")); // operator fee = 3.45
        expect(await ctk.balanceOf(vault.address)).to.equal(toWei("3.45")); // vault fee = 3.45

        // short 2 (partial close)
        {
            let { tradePrice, totalFee, cost } = await perp.callStatic.queryTrade(0, user1.address, toWei("-2"), none, USE_2x_TARGET_LEVERAGE);
            expect(tradePrice).to.equal(toWei("1050"));
            expect(totalFee).to.equal(toWei("6.3"));
            expect(cost).to.equal(toWei("-1093.7"));
        }
        await perp.connect(user1).trade(0, user1.address, toWei("-2"), toWei("950"), now + 999999, none, USE_2x_TARGET_LEVERAGE);
        // active account user1
        activateAccounts = await perp.listActiveAccounts(0, 0, 10);
        expect(activateAccounts[0]).to.equal(user1.address);
        // amm deltaCash = -2100
        // (margin - 0.5) / 1 = (1500.5 - 0.5) / 3, margin = 500.5, so cash = -499.5
        // newCash = oldCash - withdraw + 2100 - 2100 * 0.003(fee). so withdraw = 1093.7
        var { cash, position, margin, isMaintenanceMarginSafe } = await perp.getMarginAccount(0, user1.address);
        expect(cash).approximateBigNumber(toWei("-499.5"));
        expect(await ctk.balanceOf(user1.address)).to.equal(toWei("9132.85")); // 8039.15 + 1093.7
        expect(position).to.equal(toWei("1"));
        expect(margin).approximateBigNumber(toWei("500.5"));
        expect(isMaintenanceMarginSafe).to.be.true;
        // AMM rebalance. margin = 1000 * 1 * 1% = 10
        // amm cash + mark pos. so cash = 10 + 1000 * 1
        // final transferFee, cash += 2100 * 0.001(fee)
        var { cash, position, margin } = await perp.getMarginAccount(0, perp.address); // AMM account
        expect(cash).to.equal(toWei("1012.1")); // rebalance. margin = im + lpfee
        expect(position).to.equal(toWei("-1"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1343.45")); // rebalance. 1000 + (3453.45 - 2100 + 2100 * 0.001(lpfee) - 1012.1)
        expect(await ctk.balanceOf(user0.address)).to.equal(toWei("5.55")); // operator fee = 2.1
        expect(await ctk.balanceOf(vault.address)).to.equal(toWei("5.55")); // vault fee = 2.1

        // short 2 (close all + open)
        {
            let { tradePrice, totalFee, cost } = await perp.callStatic.queryTrade(0, user1.address, toWei("-2"), none, USE_2x_TARGET_LEVERAGE);
            expect(tradePrice).to.equal(toWei("992.498378537341251"));
            expect(totalFee).to.equal(toWei("5.954990271224047506"));
            expect(cost).to.equal(toWei("20.958233196541545506"));
        }
        await perp.connect(user1).trade(0, user1.address, toWei("-2"), toWei("950"), now + 999999, none, USE_2x_TARGET_LEVERAGE);
        // active account user1
        activateAccounts = await perp.listActiveAccounts(0, 0, 10);
        expect(activateAccounts[0]).to.equal(user1.address);
        // amm deltaCash = -1984.996757074682502
        // margin = cash + positionValue = 0.5 + | positionValue | / 2xLev = 500.5. so cash = 1500.5
        // idealMargin = oldCash + deltaCash + deposit - fee + mark newPos. idealMargin = 500.5
        // so deposit = 500.5 - (-499.5) - (1984...) + 1984... * 0.003 - (-1000) = 20.958233196541545506
        var { cash, position, margin, isMaintenanceMarginSafe } = await perp.getMarginAccount(0, user1.address);
        expect(cash).approximateBigNumber(toWei("1500.5"));
        expect(await ctk.balanceOf(user1.address)).to.equal(toWei("9111.891766803458454494")); // 9132.85 - deposit
        expect(position).to.equal(toWei("-1"));
        expect(margin).approximateBigNumber(toWei("500.5"));
        expect(isMaintenanceMarginSafe).to.be.true;
        var { cash, position, margin } = await perp.getMarginAccount(0, perp.address); // AMM account
        expect(cash).to.equal(toWei("-970.911760317607819498")); // 1012.1 + amm deltaCash + fee
        expect(position).to.equal(toWei("1"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1343.45")); // no rebalance, not changed
        expect(await ctk.balanceOf(user0.address)).to.equal(toWei("7.534996757074682502")); // operator fee = 1.984996757074682502
        expect(await ctk.balanceOf(vault.address)).to.equal(toWei("7.534996757074682502")); // vault fee = 1.984996757074682502

        // long 1 (close all)
        {
            let { tradePrice, totalFee, cost } = await perp.callStatic.queryTrade(0, user1.address, toWei("1"), none, USE_2x_TARGET_LEVERAGE);
            expect(tradePrice).to.equal(toWei("977.783065493367778000"));
            expect(totalFee).to.equal(toWei("2.933349196480103334"));
            expect(cost).to.equal(toWei("-519.783585310152118666"));
        }
        await perp.connect(user1).trade(0, user1.address, toWei("1"), toWei("1150"), now + 999999, none, USE_2x_TARGET_LEVERAGE);
        // no active account
        activateAccounts = await perp.listActiveAccounts(0, 0, 10);
        expect(activateAccounts.length).to.equal(0);
        // amm deltaCash = 977.783065493367778000
        var { cash, position, margin, isMaintenanceMarginSafe } = await perp.getMarginAccount(0, user1.address);
        expect(cash).approximateBigNumber(toWei("0"));
        expect(await ctk.balanceOf(user1.address)).to.equal(toWei("9631.67535211361057316")); // oldCtk + (oldCash - 977...) - 977... * 0.003
        expect(position).to.equal(toWei("0"));
        expect(margin).approximateBigNumber(toWei("0"));
        expect(isMaintenanceMarginSafe).to.be.true;
        // AMM rebalance. margin = 1000 * 1 * 1% = 10
        // amm cash + mark pos. so cash = 10 + 1000 * 1
        // final transferFee, cash += 2100 * 0.001(fee)
        var { cash, position, margin } = await perp.getMarginAccount(0, perp.address); // AMM account
        expect(cash).to.equal(toWei("0.977783065493367778")); // rebalance. im + lpfee
        expect(position).to.equal(toWei("0"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1350.321305175759958502")); // rebalance. oldPoolCash + (oldPerpCash + deltaCash) = 1343.45 + (-970... + 977...)
        expect(await ctk.balanceOf(user0.address)).to.equal(toWei("8.51277982256805028")); // operator fee = 0.977783065493367778
        expect(await ctk.balanceOf(vault.address)).to.equal(toWei("8.51277982256805028")); // vault fee = 0.977783065493367778
    });

    it("deposit + long 3(auto deposit on demand)", async () => {
        await perp.runLiquidityPool();

        // add liquidity
        await perp.connect(user2).addLiquidity(toWei("1000"));
        expect(await ctk.balanceOf(user2.address)).to.equal(toWei("9000"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1000")); // poolCash
        var { nums } = await perp.getPerpetualInfo(0);
        expect(nums[0]).to.equal(toWei("0")); // total collateral of perpetual
        var { nums } = await perp.getPerpetualInfo(1);
        expect(nums[0]).to.equal(toWei("0")); // total collateral of perpetual

        // deposit
        await perp.connect(user1).deposit(0, user1.address, toWei("500"));
        expect(await ctk.balanceOf(user1.address)).to.equal(toWei("9500")); // oldCtk - 500
        var { cash, position, margin, isMaintenanceMarginSafe } = await perp.getMarginAccount(0, user1.address);
        expect(cash).to.equal(toWei("500"));

        // long 3 (open)
        let now = Math.floor(Date.now() / 1000);
        {
            let { tradePrice, totalFee, cost } = await perp.callStatic.queryTrade(0, user1.address, toWei("3"), none, USE_2x_TARGET_LEVERAGE);
            expect(tradePrice).to.equal(toWei("1150"));
            expect(totalFee).to.equal(toWei("10.35"));
            expect(cost).to.equal(toWei("1460.85"));
        }
        await perp.connect(user1).trade(0, user1.address, toWei("3"), toWei("1150"), now + 999999, none, USE_2x_TARGET_LEVERAGE);
        var { cash, position, margin, isMaintenanceMarginSafe } = await perp.getMarginAccount(0, user1.address);
        // amm deltaCash = 3450
        // margin = cash + positionValue = 0.5 + | positionValue | / 2xLev = 1500.5. so cash = -1499.5
        // newCash = oldCash + deposit - 3450 - 3450 * 0.003(fee). so deposit = 1460.85
        expect(cash).to.equal(toWei("-1499.5"));
        expect(await ctk.balanceOf(user1.address)).to.equal(toWei("8039.15")); // oldCtk - 1460.85
        expect(position).to.equal(toWei("3"));
        expect(margin).to.equal(toWei("1500.5"));
        expect(isMaintenanceMarginSafe).to.be.true;
        var { cash, position, margin } = await perp.getMarginAccount(0, perp.address); // AMM account
        expect(cash).to.equal(toWei("3453.45")); // oldCash + deltaCash + fee
        expect(position).to.equal(toWei("-3"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1000")); // no rebalance, not changed
        expect(await ctk.balanceOf(user0.address)).to.equal(toWei("3.45")); // operator fee = 3.45
        expect(await ctk.balanceOf(vault.address)).to.equal(toWei("3.45")); // vault fee = 3.45
    });

    it("short 1 when MM < margin < IM, normal fees", async () => {
        await perp.runLiquidityPool();

        // add liquidity
        await perp.connect(user2).addLiquidity(toWei("1000"));
        expect(await ctk.balanceOf(user2.address)).to.equal(toWei("9000"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1000")); // poolCash
        var { nums } = await perp.getPerpetualInfo(0);
        expect(nums[0]).to.equal(toWei("0")); // total collateral of perpetual
        var { nums } = await perp.getPerpetualInfo(1);
        expect(nums[0]).to.equal(toWei("0")); // total collateral of perpetual

        // long 3 (open)
        let now = Math.floor(Date.now() / 1000);
        {
            let { tradePrice, totalFee, cost } = await perp.callStatic.queryTrade(0, user1.address, toWei("3"), none, USE_2x_TARGET_LEVERAGE);
            expect(tradePrice).to.equal(toWei("1150"));
            expect(totalFee).to.equal(toWei("10.35"));
            expect(cost).to.equal(toWei("1960.85"));
        }
        await perp.connect(user1).trade(0, user1.address, toWei("3"), toWei("1150"), now + 999999, none, USE_2x_TARGET_LEVERAGE);
        var { cash, position, margin, isMaintenanceMarginSafe } = await perp.getMarginAccount(0, user1.address);
        // amm deltaCash = 3450
        // margin = cash + positionValue = 0.5 + | positionValue | / 2xLev = 1500.5. so cash = -1499.5
        // newCash = deposit - 3450 - 3450 * 0.003(fee). so deposit = 1960.85
        expect(cash).to.equal(toWei("-1499.5"));
        expect(await ctk.balanceOf(user1.address)).to.equal(toWei("8039.15")); // oldCtk - 1960.85
        expect(position).to.equal(toWei("3"));
        expect(margin).to.equal(toWei("1500.5"));
        expect(isMaintenanceMarginSafe).to.be.true;
        var { cash, position, margin } = await perp.getMarginAccount(0, perp.address); // AMM account
        expect(cash).to.equal(toWei("3453.45")); // oldCash + deltaCash + fee
        expect(position).to.equal(toWei("-3"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1000")); // no rebalance, not changed
        expect(await ctk.balanceOf(user0.address)).to.equal(toWei("3.45")); // operator fee = 3.45
        expect(await ctk.balanceOf(vault.address)).to.equal(toWei("3.45")); // vault fee = 3.45

        // close when MM < margin < IM, normal fees
        await updatePrice(toWei("505"), toWei("1000"))
        await perp.forceToSyncState();
        var { margin, isInitialMarginSafe, isMaintenanceMarginSafe } = await perp.getMarginAccount(0, user1.address);
        expect(isInitialMarginSafe).to.be.false;
        expect(isMaintenanceMarginSafe).to.be.true;
        {
            let { tradePrice, totalFee, cost } = await perp.callStatic.queryTrade(0, user1.address, toWei("-1"), none, USE_2x_TARGET_LEVERAGE);
            expect(tradePrice).to.equal(toWei("515.541132467602916841"));
            expect(totalFee).to.equal(toWei("1.546623397402808751"));
            expect(cost).to.equal(toWei("-13.894509070200108090"));
        }
        await perp.connect(user1).trade(0, user1.address, toWei("-1"), toWei("500"), now + 999999, none, USE_2x_TARGET_LEVERAGE);
        var { cash, position, margin, isInitialMarginSafe, isMaintenanceMarginSafe } = await perp.getMarginAccount(0, user1.address);
        // amm deltaCash = -515.541132467602916841
        // newMargin = newCash + 505 * 2 = 505 * 2 * 0.01 + 0.5. so cash = -999.4
        // newCash = oldCash - withdraw + 515... - 515... * 0.003(fee). so withdraw = 13.894509070200108090477
        expect(cash).to.equal(toWei("-999.4"));
        expect(await ctk.balanceOf(user1.address)).to.equal(toWei("8053.044509070200108090")); // oldCtk + withdraw
        expect(position).to.equal(toWei("2"));
        expect(isInitialMarginSafe).to.be.true;
        var { cash, position, margin } = await perp.getMarginAccount(0, perp.address); // AMM account
        expect(cash).to.equal(toWei("1020.615541132467602917")); // rebalance. margin = im + lpfee
        expect(position).to.equal(toWei("-2"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("2917.808867532397083159")); // rebalance. old + (oldCash + deltaCash + lpfee - cash)
        expect(await ctk.balanceOf(user0.address)).to.equal(toWei("3.965541132467602917")); // operator fee = 0.515541132467602917
        expect(await ctk.balanceOf(vault.address)).to.equal(toWei("3.965541132467602917")); // vault fee = 0.515541132467602917
    });

    it("short 1 when margin < mm, the profit is large enough, normal fees", async () => {
        await perp.runLiquidityPool();

        // add liquidity
        await perp.connect(user2).addLiquidity(toWei("1000"));
        expect(await ctk.balanceOf(user2.address)).to.equal(toWei("9000"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1000")); // poolCash
        var { nums } = await perp.getPerpetualInfo(0);
        expect(nums[0]).to.equal(toWei("0")); // total collateral of perpetual
        var { nums } = await perp.getPerpetualInfo(1);
        expect(nums[0]).to.equal(toWei("0")); // total collateral of perpetual

        // long 3 (open)
        let now = Math.floor(Date.now() / 1000);
        {
            let { tradePrice, totalFee, cost } = await perp.callStatic.queryTrade(0, user1.address, toWei("3"), none, USE_2x_TARGET_LEVERAGE);
            expect(tradePrice).to.equal(toWei("1150"));
            expect(totalFee).to.equal(toWei("10.35"));
            expect(cost).to.equal(toWei("1960.85"));
        }
        await perp.connect(user1).trade(0, user1.address, toWei("3"), toWei("1150"), now + 999999, none, USE_2x_TARGET_LEVERAGE);
        var { cash, position, margin, isMaintenanceMarginSafe } = await perp.getMarginAccount(0, user1.address);
        // amm deltaCash = 3450
        // margin = cash + positionValue = 0.5 + | positionValue | / 2xLev = 1500.5. so cash = -1499.5
        // newCash = deposit - 3450 - 3450 * 0.003(fee). so deposit = 1960.85
        expect(cash).to.equal(toWei("-1499.5"));
        expect(await ctk.balanceOf(user1.address)).to.equal(toWei("8039.15")); // oldCtk - 1960.85
        expect(position).to.equal(toWei("3"));
        expect(margin).to.equal(toWei("1500.5"));
        expect(isMaintenanceMarginSafe).to.be.true;
        var { cash, position, margin } = await perp.getMarginAccount(0, perp.address); // AMM account
        expect(cash).to.equal(toWei("3453.45")); // no rebalance, oldCash + deltaCash + lpfee
        expect(position).to.equal(toWei("-3"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1000")); // no rebalance, not changed
        expect(await ctk.balanceOf(user0.address)).to.equal(toWei("3.45")); // operator fee = 3.45
        expect(await ctk.balanceOf(vault.address)).to.equal(toWei("3.45")); // vault fee = 3.45

        // oracle
        await updatePrice(toWei("501"), toWei("1000"))
        await perp.forceToSyncState();

        // user 2 longs. make a higher price
        await perp.connect(user2).trade(0, user2.address, toWei("2"), toWei("1000"), now + 999999, none, USE_2x_TARGET_LEVERAGE);
        // amm deltaCash = 1070.964429859700685024
        var { cash, position, margin } = await perp.getMarginAccount(0, perp.address); // AMM account
        expect(cash).to.equal(toWei("4525.485394289560385709")); // oldCash + deltaCash + lpfee
        expect(position).to.equal(toWei("-5"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1000")); // no rebalance, not changed
        expect(await ctk.balanceOf(user0.address)).to.equal(toWei("4.520964429859700685")); // operator fee = 1.070964429859700685024
        expect(await ctk.balanceOf(vault.address)).to.equal(toWei("4.520964429859700685")); // vault fee = 1.070964429859700685024

        // close when margin < MM, but profit is large, normal fees
        var { isMaintenanceMarginSafe, isMarginSafe } = await perp.getMarginAccount(0, user1.address);
        expect(isMaintenanceMarginSafe).to.be.false;
        expect(isMarginSafe).to.be.true;
        {
            let { tradePrice, totalFee, cost } = await perp.callStatic.queryTrade(0, user1.address, toWei("-1"), none, USE_2x_TARGET_LEVERAGE);
            expect(tradePrice).to.equal(toWei("521.201994206724030199"));
            expect(totalFee).to.equal(toWei("1.563605982620172090"));
            expect(cost).to.equal(toWei("-11.618388224103858109"));
        }
        await perp.connect(user1).trade(0, user1.address, toWei("-1"), toWei("500"), now + 999999, none, USE_2x_TARGET_LEVERAGE);
        var { cash, position, margin, isInitialMarginSafe, isMaintenanceMarginSafe } = await perp.getMarginAccount(0, user1.address);
        // amm deltaCash = -521.201994206724030199
        // old lev = 501x, margin = 501 * 2 * 1% = cash + 501 * 2 + 0.5
        // cash = oldCash + deltaCash - fee - withdraw. so withdraw = 11.618388224103858108403
        expect(cash).to.equal(toWei("-991.48")); // 501 * 2 * 1% - 501 * 2 + 0.5
        expect(await ctk.balanceOf(user1.address)).to.equal(toWei("8050.768388224103858109")); // + withdraw
        expect(position).to.equal(toWei("2"));
        expect(isInitialMarginSafe).to.be.true;
        expect(isMaintenanceMarginSafe).to.be.true;
        var { cash, position, margin } = await perp.getMarginAccount(0, perp.address); // AMM account
        expect(cash).to.equal(toWei("2024.561201994206724030")); // rebalance. margin = im + lpfee
        expect(position).to.equal(toWei("-4"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("2980.243400082836355510")); // rebalance. old + (oldCash + deltaCash + fee - cash)
        expect(await ctk.balanceOf(user0.address)).to.equal(toWei("5.042166424066424715")); // operator fee = 0.52120199420672403
        expect(await ctk.balanceOf(vault.address)).to.equal(toWei("5.042166424066424715")); // vault fee = 0.52120199420672403
    });

    it("short 1 when mmUnsafe (close positions will cause profit), reduced fees", async () => {
        await perp.runLiquidityPool();

        // add liquidity
        await perp.connect(user2).addLiquidity(toWei("1000"));
        expect(await ctk.balanceOf(user2.address)).to.equal(toWei("9000"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1000")); // poolCash
        var { nums } = await perp.getPerpetualInfo(0);
        expect(nums[0]).to.equal(toWei("0")); // total collateral of perpetual
        var { nums } = await perp.getPerpetualInfo(1);
        expect(nums[0]).to.equal(toWei("0")); // total collateral of perpetual

        // long 3 (open)
        let now = Math.floor(Date.now() / 1000);
        {
            let { tradePrice, totalFee, cost } = await perp.callStatic.queryTrade(0, user1.address, toWei("3"), none, USE_2x_TARGET_LEVERAGE);
            expect(tradePrice).to.equal(toWei("1150"));
            expect(totalFee).to.equal(toWei("10.35"));
            expect(cost).to.equal(toWei("1960.85"));
        }
        await perp.connect(user1).trade(0, user1.address, toWei("3"), toWei("1150"), now + 999999, none, USE_2x_TARGET_LEVERAGE);
        var { cash, position, margin, isMaintenanceMarginSafe } = await perp.getMarginAccount(0, user1.address);
        // amm deltaCash = 3450
        // margin = cash + positionValue = 0.5 + | positionValue | / 2xLev = 1500.5. so cash = -1499.5
        // newCash = deposit - 3450 - 3450 * 0.003(fee). so deposit = 1960.85
        expect(cash).to.equal(toWei("-1499.5"));
        expect(await ctk.balanceOf(user1.address)).to.equal(toWei("8039.15")); // oldCtk - 1960.85
        expect(position).to.equal(toWei("3"));
        expect(margin).to.equal(toWei("1500.5"));
        expect(isMaintenanceMarginSafe).to.be.true;
        var { cash, position, margin } = await perp.getMarginAccount(0, perp.address); // AMM account
        expect(cash).to.equal(toWei("3453.45")); // oldCash + deltaCash + lpfee
        expect(position).to.equal(toWei("-3"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1000")); // no rebalance, not changed
        expect(await ctk.balanceOf(user0.address)).to.equal(toWei("3.45")); // operator fee = 3.45
        expect(await ctk.balanceOf(vault.address)).to.equal(toWei("3.45")); // vault fee = 3.45

        // oracle
        await updatePrice(toWei("500.3"), toWei("1000"))
        await perp.forceToSyncState();

        // close when margin < MM, reduces fees. margin should be IM
        var { isMaintenanceMarginSafe } = await perp.getMarginAccount(0, user1.address);
        expect(isMaintenanceMarginSafe).to.be.false;
        {
            let { tradePrice, totalFee, cost } = await perp.callStatic.queryTrade(0, user1.address, toWei("-1"), none, USE_2x_TARGET_LEVERAGE);
            expect(tradePrice).to.equal(toWei("510.522727823788730153"));
            expect(totalFee).to.equal(toWei("1.116727823788730153"));
            expect(cost).to.equal(toWei("0"));
        }
        await perp.connect(user1).trade(0, user1.address, toWei("-1"), toWei("500"), now + 999999, none, USE_2x_TARGET_LEVERAGE);
        var { cash, position, margin, isInitialMarginSafe, isMaintenanceMarginSafe } = await perp.getMarginAccount(0, user1.address);
        // amm deltaCash = -510.522727823788730153
        // fee = 1.116727823788730153 (72% of normal fees)
        // withdraw = 0
        // margin = cash + positionValue = im + 0.5 = 10.506. so cash = -990.094
        expect(cash).to.equal(toWei("-990.094"));
        expect(await ctk.balanceOf(user1.address)).to.equal(toWei("8039.15")); // not changed
        expect(position).to.equal(toWei("2"));
        expect(margin).to.equal(toWei("10.506"));
        expect(isInitialMarginSafe).to.be.true;
        expect(isMaintenanceMarginSafe).to.be.true;
        var { cash, position, margin } = await perp.getMarginAccount(0, perp.address); // AMM account
        expect(cash).to.equal(toWei("2943.299514784140846566")); // no rebalance. old + deltaCash + lpfee
        expect(position).to.equal(toWei("-2"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1000")); // no rebalance, not changed
        expect(await ctk.balanceOf(user0.address)).to.equal(toWei("3.822242607929576717")); // operator fee = 0.372242607929576717
        expect(await ctk.balanceOf(vault.address)).to.equal(toWei("3.822242607929576717")); // vault fee = 0.372242607929576717
    });

    it("short 1 when safe (close positions will cause loss), fees = 0", async () => {
        await perp.runLiquidityPool();

        // add liquidity
        await perp.connect(user2).addLiquidity(toWei("1000"));
        expect(await ctk.balanceOf(user2.address)).to.equal(toWei("9000"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1000")); // poolCash
        var { nums } = await perp.getPerpetualInfo(0);
        expect(nums[0]).to.equal(toWei("0")); // total collateral of perpetual
        var { nums } = await perp.getPerpetualInfo(1);
        expect(nums[0]).to.equal(toWei("0")); // total collateral of perpetual

        // long 3 (open)
        let now = Math.floor(Date.now() / 1000);
        {
            let { tradePrice, totalFee, cost } = await perp.callStatic.queryTrade(0, user1.address, toWei("3"), none, USE_2x_TARGET_LEVERAGE);
            expect(tradePrice).to.equal(toWei("1150"));
            expect(totalFee).to.equal(toWei("10.35"));
            expect(cost).to.equal(toWei("1960.85"));
        }
        await perp.connect(user1).trade(0, user1.address, toWei("3"), toWei("1150"), now + 999999, none, USE_2x_TARGET_LEVERAGE);
        var { cash, position, margin, isMaintenanceMarginSafe } = await perp.getMarginAccount(0, user1.address);
        // amm deltaCash = 3450
        // margin = cash + positionValue = 0.5 + | positionValue | / 2xLev = 1500.5. so cash = -1499.5
        // newCash = deposit - 3450 - 3450 * 0.003(fee). so deposit = 1960.85
        expect(cash).to.equal(toWei("-1499.5"));
        expect(await ctk.balanceOf(user1.address)).to.equal(toWei("8039.15")); // oldCtk - 1960.85
        expect(position).to.equal(toWei("3"));
        expect(margin).to.equal(toWei("1500.5"));
        expect(isMaintenanceMarginSafe).to.be.true;
        var { cash, position, margin } = await perp.getMarginAccount(0, perp.address); // AMM account
        expect(cash).to.equal(toWei("3453.45")); // oldCash + deltaCash + fee
        expect(position).to.equal(toWei("-3"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1000")); // no rebalance, not changed
        expect(await ctk.balanceOf(user0.address)).to.equal(toWei("3.45")); // operator fee = 3.45
        expect(await ctk.balanceOf(vault.address)).to.equal(toWei("3.45")); // vault fee = 3.45

        // oracle
        await updatePrice(toWei("506"), toWei("1000"))
        await perp.forceToSyncState();

        // user 2 sells. make a lower price
        await perp.connect(user2).trade(0, user2.address, toWei("-4"), toWei("0"), now + 999999, none, USE_2x_TARGET_LEVERAGE);
        // amm deltaCash = -2043.345318849321722334
        var { cash, position, margin } = await perp.getMarginAccount(0, perp.address); // AMM account
        expect(cash).to.equal(toWei("1412.148026469527599388")); // oldCash + deltaCash + lpfee
        expect(position).to.equal(toWei("1"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1000")); // no rebalance, not changed
        expect(await ctk.balanceOf(user0.address)).to.equal(toWei("5.493345318849321722")); // operator fee = 2.043345318849321722
        expect(await ctk.balanceOf(vault.address)).to.equal(toWei("5.493345318849321722")); // vault fee = 2.043345318849321722

        // close when margin < MM, reduces fees
        var { isInitialMarginSafe } = await perp.getMarginAccount(0, user1.address);
        expect(isInitialMarginSafe).to.be.true;
        {
            let { tradePrice, totalFee, cost } = await perp.callStatic.queryTrade(0, user1.address, toWei("-1"), none, USE_2x_TARGET_LEVERAGE);
            expect(tradePrice).to.equal(toWei("492.240720624875890864"));
            expect(totalFee).to.equal(toWei("0"));
            expect(cost).to.equal(toWei("0"));
        }
        await perp.connect(user1).trade(0, user1.address, toWei("-1"), toWei("450"), now + 999999, none, USE_2x_TARGET_LEVERAGE);
        var { cash, position, margin, isMarginSafe, isMaintenanceMarginSafe } = await perp.getMarginAccount(0, user1.address);
        // amm deltaCash = -492.240720624875890864
        // required im = 10.12, margin(after trade) = 4.240720624875890864 < im
        // so withdraw = 0, fee = 0
        expect(cash).to.equal(toWei("-1007.259279375124109136")); // oldCash + deltaCash - fee, keeperGasReward is still there
        expect(await ctk.balanceOf(user1.address)).to.equal(toWei("8039.15")); // not change
        expect(position).to.equal(toWei("2"));
        expect(isMaintenanceMarginSafe).to.be.false;
        expect(isMarginSafe).to.be.true;
        var { cash, position, margin } = await perp.getMarginAccount(0, perp.address); // AMM account
        expect(cash).to.equal(toWei("919.907305844651708524")); // no rebalance. old + deltaCash + lpfee
        expect(position).to.equal(toWei("2"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1000")); // no rebalance, not changed
        expect(await ctk.balanceOf(user0.address)).to.equal(toWei("5.493345318849321722")); // operator fee = 0
        expect(await ctk.balanceOf(vault.address)).to.equal(toWei("5.493345318849321722")); // vault fee = 0
    });

    it("long small amount from 0 position, margin = value / lev + keeperGasReward", async () => {
        await perp.runLiquidityPool();

        // add liquidity
        await perp.connect(user2).addLiquidity(toWei("1000"));
        expect(await ctk.balanceOf(user2.address)).to.equal(toWei("9000"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1000")); // poolCash
        var { nums } = await perp.getPerpetualInfo(0);
        expect(nums[0]).to.equal(toWei("0")); // total collateral of perpetual
        var { nums } = await perp.getPerpetualInfo(1);
        expect(nums[0]).to.equal(toWei("0")); // total collateral of perpetual

        // long 1e-7 (open)
        let now = Math.floor(Date.now() / 1000);
        {
            let { tradePrice, totalFee, cost } = await perp.callStatic.queryTrade(0, user1.address, toWei("0.0000001"), none, USE_2x_TARGET_LEVERAGE);
            expect(tradePrice).to.equal(toWei("1010"));
            expect(totalFee).to.equal(toWei("0.000000303"));
            expect(cost).to.equal(toWei("0.500051303"));
        }
        await perp.connect(user1).trade(0, user1.address, toWei("0.0000001"), toWei("1150"), now + 999999, none, USE_2x_TARGET_LEVERAGE);
        var { cash, position, margin, isInitialMarginSafe } = await perp.getMarginAccount(0, user1.address);
        // amm deltaCash = 1010 * 1e-7
        // margin = cash + positionValue = 0.5 + | positionValue | / 2xLev = 0.50005. so cash = 0.49995
        expect(cash).to.equal(toWei("0.49995"));
        // deposit = newCash + deltaCash = 0.49995 + 1010 * 1e-7 + 1010 * 1e-7 * 0.003 = 0.500051303
        expect(await ctk.balanceOf(user1.address)).to.equal(toWei("9999.499948697")); // oldCtk - 0.500051303
        expect(position).to.equal(toWei("0.0000001"));
        expect(margin).to.equal(toWei("0.50005"));
        expect(isInitialMarginSafe).to.be.true;
        var { cash, position, margin } = await perp.getMarginAccount(0, perp.address); // AMM account
        expect(cash).to.equal(toWei("0.000101101")); // oldCash + deltaCash + lpFee
        expect(position).to.equal(toWei("-0.0000001"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1000")); // no rebalance, not changed
        expect(await ctk.balanceOf(user0.address)).to.equal(toWei("0.000000101")); // operator fee = 3.45
        expect(await ctk.balanceOf(vault.address)).to.equal(toWei("0.000000101")); // vault fee = 3.45
    });

    it("long 1 amount from 3 position", async () => {
        await perp.runLiquidityPool();

        // add liquidity
        await perp.connect(user2).addLiquidity(toWei("1000"));
        expect(await ctk.balanceOf(user2.address)).to.equal(toWei("9000"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1000")); // poolCash
        var { nums } = await perp.getPerpetualInfo(0);
        expect(nums[0]).to.equal(toWei("0")); // total collateral of perpetual
        var { nums } = await perp.getPerpetualInfo(1);
        expect(nums[0]).to.equal(toWei("0")); // total collateral of perpetual

        // long 3 (open)
        let now = Math.floor(Date.now() / 1000);
        {
            let { tradePrice, totalFee, cost } = await perp.callStatic.queryTrade(0, user1.address, toWei("3"), none, USE_2x_TARGET_LEVERAGE);
            expect(tradePrice).to.equal(toWei("1150"));
            expect(totalFee).to.equal(toWei("10.35"));
            expect(cost).to.equal(toWei("1960.85"));
        }
        await perp.connect(user1).trade(0, user1.address, toWei("3"), toWei("1150"), now + 999999, none, USE_2x_TARGET_LEVERAGE);
        var { cash, position, margin, isMaintenanceMarginSafe } = await perp.getMarginAccount(0, user1.address);
        // amm deltaCash = 3450
        // margin = cash + positionValue = 0.5 + | positionValue | / 2xLev = 1500.5. so cash = -1499.5
        // newCash = deposit - 3450 - 3450 * 0.003(fee). so deposit = 1960.85
        expect(cash).to.equal(toWei("-1499.5"));
        expect(await ctk.balanceOf(user1.address)).to.equal(toWei("8039.15")); // oldCtk - 1960.85
        expect(position).to.equal(toWei("3"));
        expect(margin).to.equal(toWei("1500.5"));
        expect(isMaintenanceMarginSafe).to.be.true;
        var { cash, position, margin } = await perp.getMarginAccount(0, perp.address); // AMM account
        expect(cash).to.equal(toWei("3453.45")); // oldCash + deltaCash + fee
        expect(position).to.equal(toWei("-3"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1000")); // no rebalance, not changed
        expect(await ctk.balanceOf(user0.address)).to.equal(toWei("3.45")); // operator fee = 3.45
        expect(await ctk.balanceOf(vault.address)).to.equal(toWei("3.45")); // vault fee = 3.45

        // long 1 (open)
        {
            let { tradePrice, totalFee, cost } = await perp.callStatic.queryTrade(0, user1.address, toWei("1"), none, USE_2x_TARGET_LEVERAGE);
            expect(tradePrice).to.equal(toWei("1347.829178578730146"));
            expect(totalFee).to.equal(toWei("4.043487535736190438"));
            expect(cost).to.equal(toWei("851.872666114466336438"));
        }
        await perp.connect(user1).trade(0, user1.address, toWei("1"), toWei("1350"), now + 999999, none, USE_2x_TARGET_LEVERAGE);
        var { cash, position, margin, isInitialMarginSafe } = await perp.getMarginAccount(0, user1.address);
        // amm deltaCash = 1347.829178578730146
        // deposit = deltaPosition * mark / 2xLev + pnl + fee = 1000 / 2 + 347.829178578730146 + 1347.829178578730146 * 0.003 = 851.872666114466336438
        // newCash = old cash - deltaCash + deposit - fee = -1499.5 - 1347.829178578730146 + 847.829178578730146 = -1999.5
        // margin = newCash + mark * position = -1999.5 + 4 * 1000 = 2000.5
        expect(cash).to.equal(toWei("-1999.5"));
        expect(await ctk.balanceOf(user1.address)).to.equal(toWei("7187.277333885533663562")); // oldCtk - 851.872666114466336438
        expect(position).to.equal(toWei("4"));
        expect(margin).to.equal(toWei("2000.5"));
        expect(isInitialMarginSafe).to.be.true;
        var { cash, position, margin } = await perp.getMarginAccount(0, perp.address); // AMM account
        expect(cash).to.equal(toWei("4802.627007757308876146")); // oldCash + deltaCash + lpFee
        expect(position).to.equal(toWei("-4"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1000")); // no rebalance, not changed
        expect(await ctk.balanceOf(user0.address)).to.equal(toWei("4.797829178578730146")); // operator fee = 3.45 + 1347.829178578730146 * 0.001
        expect(await ctk.balanceOf(vault.address)).to.equal(toWei("4.797829178578730146")); // vault fee = 3.45 + 1347.829178578730146 * 0.001
    });

    it("long 1 amount from 3 position, margin = initialMargin", async () => {
        await perp.runLiquidityPool();

        // add liquidity
        await perp.connect(user2).addLiquidity(toWei("1000"));
        expect(await ctk.balanceOf(user2.address)).to.equal(toWei("9000"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1000")); // poolCash
        var { nums } = await perp.getPerpetualInfo(0);
        expect(nums[0]).to.equal(toWei("0")); // total collateral of perpetual
        var { nums } = await perp.getPerpetualInfo(1);
        expect(nums[0]).to.equal(toWei("0")); // total collateral of perpetual

        // long 3 (open)
        let now = Math.floor(Date.now() / 1000);
        {
            let { tradePrice, totalFee, cost } = await perp.callStatic.queryTrade(0, user1.address, toWei("3"), none, USE_2x_TARGET_LEVERAGE);
            expect(tradePrice).to.equal(toWei("1150"));
            expect(totalFee).to.equal(toWei("10.35"));
            expect(cost).to.equal(toWei("1960.85"));
        }
        await perp.connect(user1).trade(0, user1.address, toWei("3"), toWei("1150"), now + 999999, none, USE_2x_TARGET_LEVERAGE);
        var { cash, position, margin, isMaintenanceMarginSafe } = await perp.getMarginAccount(0, user1.address);
        // amm deltaCash = 3450
        // margin = cash + positionValue = 0.5 + | positionValue | / 2xLev = 1500.5. so cash = -1499.5
        // newCash = deposit - 3450 - 3450 * 0.003(fee). so deposit = 1960.85
        expect(cash).to.equal(toWei("-1499.5"));
        expect(await ctk.balanceOf(user1.address)).to.equal(toWei("8039.15")); // oldCtk - 1960.85
        expect(position).to.equal(toWei("3"));
        expect(margin).to.equal(toWei("1500.5"));
        expect(isMaintenanceMarginSafe).to.be.true;
        var { cash, position, margin } = await perp.getMarginAccount(0, perp.address); // AMM account
        expect(cash).to.equal(toWei("3453.45")); // oldCash + deltaCash + fee
        expect(position).to.equal(toWei("-3"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1000")); // no rebalance, not changed
        expect(await ctk.balanceOf(user0.address)).to.equal(toWei("3.45")); // operator fee = 3.45
        expect(await ctk.balanceOf(vault.address)).to.equal(toWei("3.45")); // vault fee = 3.45

        // oracle
        await updatePrice(toWei("100"), toWei("1000"))
        await perp.forceToSyncState();
        var { cash, position, margin, isInitialMarginSafe } = await perp.getMarginAccount(0, user1.address);
        expect(cash).to.equal(toWei("-1499.5"));
        expect(position).to.equal(toWei("3"));
        expect(margin).to.equal(toWei("-1199.5"));
        expect(isInitialMarginSafe).to.be.false;

        // long 1 (open)
        {
            let { tradePrice, totalFee, cost } = await perp.callStatic.queryTrade(0, user1.address, toWei("1"), none, USE_2x_TARGET_LEVERAGE);
            expect(tradePrice).to.equal(toWei("101.729704413161927575"));
            expect(totalFee).to.equal(toWei("0.305189113239485784"));
            expect(cost).to.equal(toWei("1206.034893526401413359"));
        }
        await perp.connect(user1).trade(0, user1.address, toWei("1"), toWei("1150"), now + 999999, none, USE_2x_TARGET_LEVERAGE);
        var { cash, position, margin, isInitialMarginSafe } = await perp.getMarginAccount(0, user1.address);
        // amm deltaCash = 101.729704413161927575
        // margin = initialMargin + keeperGasReward = 4 * 100 * 0.01 + 0.5 = 4.5
        // newCash = margin - mark * pos = 4.5 - 100 * 4 = -395.5
        expect(cash).to.equal(toWei("-395.5"));
        // deposit = newMargin - oldMargin - pnl + fee = 4.5 - (-1199.5) - (-1.729704413161927575) + 101.729704413161927575 * 0.003 = 1206.034893526401413357725
        expect(await ctk.balanceOf(user1.address)).to.equal(toWei("6833.115106473598586641")); // oldCtk - 1206.034893526401413357725
        expect(position).to.equal(toWei("4"));
        expect(margin).to.equal(toWei("4.5"));
        expect(isInitialMarginSafe).to.be.true;
        var { cash, position, margin } = await perp.getMarginAccount(0, perp.address); // AMM account
        expect(cash).to.equal(toWei("3555.281434117575089503")); // oldCash + deltaCash + lpFee
        expect(position).to.equal(toWei("-4"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1000")); // no rebalance, not changed
        expect(await ctk.balanceOf(user0.address)).to.equal(toWei("3.551729704413161928")); // operator fee = 3.45 + 101.729704413161927575 * 0.001
        expect(await ctk.balanceOf(vault.address)).to.equal(toWei("3.551729704413161928")); // vault fee = 3.45 + 101.729704413161927575 * 0.001
    });

    it("trade on inverse perp", async () => {
        await perp.runLiquidityPool();
        // await perp.connect(user1).deposit(0, user1.address, toWei("1"));
        await perp.connect(user2).addLiquidity(toWei("6600"));
        let now = Math.floor(Date.now() / 1000);
        await updatePrice(toWei("0.00053165"), toWei("1000"));
        await perp.forceToSyncState();
        {
            let { tradePrice, totalFee, cost } = await perp.callStatic.queryTrade(0, user1.address, toWei("1"), none, USE_2x_TARGET_LEVERAGE);
        }
        await perp.connect(user1).trade(0, user1.address, toWei("1"), toWei("1"), now + 999999, none, USE_2x_TARGET_LEVERAGE);
    });

    it("heart beat stop", async () => {
        await perp.runLiquidityPool();
        await oracle1.setMaxHeartBeat(3600);
        await oracle2.setMaxHeartBeat(86400);

        // add liquidity
        await perp.connect(user2).addLiquidity(toWei("1000"));
        expect(await ctk.balanceOf(user2.address)).to.equal(toWei("9000"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1000")); // poolCash
        var { nums } = await perp.getPerpetualInfo(0);
        expect(nums[0]).to.equal(toWei("0")); // total collateral of perpetual
        var { nums } = await perp.getPerpetualInfo(1);
        expect(nums[0]).to.equal(toWei("0")); // total collateral of perpetual

        // long 1 (open)
        let now = Math.floor(Date.now() / 1000);
        await perp.connect(user1).trade(0, user1.address, toWei("1"), toWei("1150"), now + 999999, none, USE_2x_TARGET_LEVERAGE);

        // revert on perp 1
        await ethers.provider.send("evm_increaseTime", [3600])
        await ethers.provider.send("evm_mine")
        await expect(perp.connect(user1).trade(0, user1.address, toWei("1"), toWei("1150"), now + 999999, none, USE_2x_TARGET_LEVERAGE)).to.be.revertedWith("should be in NORMAL state");

        // success on perp 2, auto setEmergency
        await perp.connect(user1).trade(1, user1.address, toWei("1"), toWei("1150"), now + 999999, none, USE_2x_TARGET_LEVERAGE)
        await expect(perp.setEmergencyState(0)).to.be.revertedWith("should be in NORMAL state");
        const state = await perp.getPerpetualInfo(0)
        expect(state.state).to.equal(3 /* EMERGENCY */)
    });

    it("long 3 and close all", async () => {
        await perp.runLiquidityPool();

        // add liquidity
        await perp.connect(user2).addLiquidity(toWei("1000"));
        expect(await ctk.balanceOf(user2.address)).to.equal(toWei("9000"));
        var { intNums } = await perp.getLiquidityPoolInfo();
        expect(intNums[1]).to.equal(toWei("1000")); // poolCash
        var { nums } = await perp.getPerpetualInfo(0);
        expect(nums[0]).to.equal(toWei("0")); // total collateral of perpetual
        var { nums } = await perp.getPerpetualInfo(1);
        expect(nums[0]).to.equal(toWei("0")); // total collateral of perpetual

        let now = Math.floor(Date.now() / 1000);
        await perp.connect(user1).trade(0, user1.address, toWei("0.000065"), toWei("1150"), now + 999999, none, USE_2x_TARGET_LEVERAGE);
        await perp.connect(user1).trade(0, user1.address, toWei("-0.000065"), toWei("0"), now + 999999, none, USE_2x_TARGET_LEVERAGE);
        var { cash, position, margin, isInitialMarginSafe } = await perp.getMarginAccount(0, user1.address);
        expect(cash).to.equal(toWei("0"));
        expect(position).to.equal(toWei("0"));
        expect(margin).to.equal(toWei("0"));
        expect(isInitialMarginSafe).to.be.true;
    });
})
