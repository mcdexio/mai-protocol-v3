import BigNumber from 'bignumber.js';
import { expect, use } from "chai";
import {
    toWei,
    fromWei,
    toBytes32,
    getAccounts,
    createContract,
    createLiquidityPoolFactory,
    createFactory,
    deployPoolCreator,
} from '../scripts/utils';
const { ethers } = require("hardhat");

describe('Perpetual2', () => {
    let accounts;
    let user0;
    let user1;
    let user2;
    let user3;
    let vault;
    let ctk;
    let poolCreator;
    let LiquidityPoolFactory;

    before(async () => {
        accounts = await getAccounts();
        user0 = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];
        vault = accounts[9];
    })

    beforeEach(async () => {
        LiquidityPoolFactory = await createLiquidityPoolFactory();
        var symbol = await createContract("SymbolService");
        await symbol.initialize(10000);
        ctk = await createContract("CustomERC20", ["collateral", "CTK", 18]);
        var perp0Template = await LiquidityPoolFactory[0].deploy();
        var perp1Template = await LiquidityPoolFactory[1].deploy();
        var govTemplate = await createContract("TestLpGovernor");
        poolCreator = await deployPoolCreator(symbol, vault, toWei("0.001"));
        await poolCreator.addVersion([perp0Template.address, perp1Template.address], govTemplate.address, 0, "initial version");
        await symbol.addWhitelistedFactory(poolCreator.address);
    });

    describe("erc20", async () => {

        let stk;
        let oracle;
        let liquidityPool;

        beforeEach(async () => {
            oracle = await createContract("OracleAdaptor", ["USD", "ETH"]);
            await oracle.setIndexPrice(toWei("1000"), 10000);
            await oracle.setMarkPrice(toWei("1000"), 10000);
            const deployed = await poolCreator.callStatic.createLiquidityPool(ctk.address, 18, 998, ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1]));
            await poolCreator.createLiquidityPool(ctk.address, 18, 998, ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1]));

            liquidityPool = await ethers.getContractAt("LiquidityPoolAllHops", deployed[0]);
            await liquidityPool.createPerpetual(oracle.address,
                [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("1")],
                [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1"), toWei("0")],
                [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
                [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1"), toWei("0")],
            )
            await liquidityPool.runLiquidityPool();

            const info = await liquidityPool.getLiquidityPoolInfo();
            stk = (await createFactory("LpGovernor")).attach(info.addresses[3]);
        })

        it("deposit", async () => {
            await ctk.mint(user1.address, toWei("100"));
            await ctk.connect(user1).approve(liquidityPool.address, toWei("100"));

            await liquidityPool.connect(user1).deposit(0, user1.address, toWei("10"));
            var result = await liquidityPool.getMarginAccount(0, user1.address);
            expect(result.cash).to.equal(toWei("10"));

            await expect(liquidityPool.connect(user1).deposit(0, user1.address, 0)).to.be.revertedWith("invalid amount")
            await expect(liquidityPool.connect(user2).deposit(0, user1.address, toWei("10"))).to.be.revertedWith("unauthorized caller")

            await poolCreator.connect(user1).grantPrivilege(user2.address, 1);
            await liquidityPool.connect(user2).deposit(0, user1.address, toWei("10"));
            var result = await liquidityPool.getMarginAccount(0, user1.address);
            expect(result.cash).to.equal(toWei("20"));

            expect(await ctk.balanceOf(user1.address)).to.equal(toWei("80"))
            expect(await ctk.balanceOf(user2.address)).to.equal(toWei("0"))
        })

        it("withdraw", async () => {
            await ctk.mint(user1.address, toWei("100"));
            await ctk.connect(user1).approve(liquidityPool.address, toWei("100"));

            await liquidityPool.connect(user1).deposit(0, user1.address, toWei("10"));
            var result = await liquidityPool.getMarginAccount(0, user1.address);
            expect(result.cash).to.equal(toWei("10"));

            await liquidityPool.connect(user1).withdraw(0, user1.address, toWei("5"));
            var result = await liquidityPool.getMarginAccount(0, user1.address);
            expect(result.cash).to.equal(toWei("5"));

            await expect(liquidityPool.connect(user1).deposit(0, user1.address, 0)).to.be.revertedWith("invalid amount")
            await expect(liquidityPool.connect(user2).deposit(0, user1.address, toWei("5"))).to.be.revertedWith("unauthorized caller")

            await poolCreator.connect(user1).grantPrivilege(user2.address, 2);
            await liquidityPool.connect(user2).withdraw(0, user1.address, toWei("5"));
            var result = await liquidityPool.getMarginAccount(0, user1.address);
            expect(result.cash).to.equal(toWei("0"));

            expect(await ctk.balanceOf(user1.address)).to.equal(toWei("100"))
            expect(await ctk.balanceOf(user2.address)).to.equal(toWei("0"))
        })

        it("withdraw - wrapped", async () => {
            await ctk.mint(user1.address, toWei("100"));
            await ctk.connect(user1).approve(liquidityPool.address, toWei("100"));

            await liquidityPool.connect(user1).deposit(0, user1.address, toWei("10"));
            var result = await liquidityPool.getMarginAccount(0, user1.address);
            expect(result.cash).to.equal(toWei("10"));

            await liquidityPool.connect(user1).withdraw(0, user1.address, toWei("5"));
            var result = await liquidityPool.getMarginAccount(0, user1.address);
            expect(result.cash).to.equal(toWei("5"));

            await expect(liquidityPool.connect(user1).deposit(0, user1.address, 0)).to.be.revertedWith("invalid amount")
            await expect(liquidityPool.connect(user2).deposit(0, user1.address, toWei("5"))).to.be.revertedWith("unauthorized caller")

            await poolCreator.connect(user1).grantPrivilege(user2.address, 2);
            await liquidityPool.connect(user2).withdraw(0, user1.address, toWei("5"));
            var result = await liquidityPool.getMarginAccount(0, user1.address);
            expect(result.cash).to.equal(toWei("0"));

            expect(await ctk.balanceOf(user1.address)).to.equal(toWei("100"))
            expect(await ctk.balanceOf(user2.address)).to.equal(toWei("0"))
        })

        it("trade - 1", async () => {
            await oracle.setIndexPrice(toWei("1000"), 1000);
            await oracle.setMarkPrice(toWei("1000"), 1000);

            await ctk.mint(user1.address, toWei("1000"));
            await ctk.mint(user2.address, toWei("1000"));
            await ctk.connect(user1).approve(liquidityPool.address, toWei("1000"));
            await ctk.connect(user2).approve(liquidityPool.address, toWei("1000"));

            await liquidityPool.connect(user1).deposit(0, user1.address, toWei("1000"));
            await liquidityPool.connect(user2).addLiquidity(toWei("1000"));

            var now = Math.floor(Date.now() / 1000)
            await expect(liquidityPool.connect(user1).trade(
                0,
                user1.address,
                toWei("0"),
                toWei("2000"),
                now + 100000,
                "0x0000000000000000000000000000000000000000",
                0
            )).to.be.revertedWith("invalid amount");

            await expect(liquidityPool.connect(user1).trade(
                0,
                user1.address,
                toWei("1"),
                toWei("2000"),
                now - 100000,
                "0x0000000000000000000000000000000000000000",
                0
            )).to.be.revertedWith("deadline exceeded");

            await liquidityPool.connect(user1).trade(
                0,
                user1.address,
                toWei("1"),
                toWei("2000"),
                now + 100000,
                "0x0000000000000000000000000000000000000000",
                0
            );
            var result = await liquidityPool.getMarginAccount(0, user1.address);
            expect(result.cash.toString()).to.equal("-53150000000000000000")
            expect(result.position.toString()).to.equal("1000000000000000000")
        })

        it("trade - 2", async () => {
            await oracle.setIndexPrice(toWei("1000"), 1000);
            await oracle.setMarkPrice(toWei("1000"), 1000);

            await ctk.mint(user1.address, toWei("1000"));
            await ctk.mint(user2.address, toWei("1000"));
            await ctk.connect(user1).approve(liquidityPool.address, toWei("1000"));
            await ctk.connect(user2).approve(liquidityPool.address, toWei("1000"));

            await liquidityPool.connect(user1).deposit(0, user1.address, toWei("1000"));
            await liquidityPool.connect(user2).addLiquidity(toWei("1000"));

            var now = Math.floor(Date.now() / 1000)
            const broker = await createContract("Broker");
            const OrderModule = await createContract("OrderModule");
            const testOrder = await createContract("TestOrder", [], { OrderModule });
            const order = {
                trader: user1.address, // trader
                broker: broker.address, // broker
                relayer: user0.address, // relayer
                referrer: "0x0000000000000000000000000000000000000000", // referrer
                liquidityPool: liquidityPool.address, // liquidityPool
                minTradeAmount: toWei("0.1"),
                amount: toWei("1"),
                limitPrice: toWei("2000"),
                triggerPrice: toWei("0"),
                chainID: 31337,
                expiredAt: now + 100000,
                perpetualIndex: 0,
                brokerFeeLimit: 0,  // 20 gwei
                flags: 0x00000000,
                salt: 1,
            };
            var orderHash = await testOrder.orderHash(order);
            const sig = await user1.signMessage(ethers.utils.arrayify(orderHash));
            var { r, s, v } = ethers.utils.splitSignature(sig);
            var compressed = await testOrder.compress(order, r, s, v, 0);
            await broker.batchTrade([compressed], [toWei("1")], [toWei("0")]);

            var result = await liquidityPool.getMarginAccount(0, user1.address);
            expect(result.cash.toString()).to.equal("-53150000000000000000")
            expect(result.position.toString()).to.equal("1000000000000000000")
        })

        it("settle", async () => {
            await oracle.setIndexPrice(toWei("1000"), 1000);
            await oracle.setMarkPrice(toWei("1000"), 1000);

            await ctk.mint(user1.address, toWei("1000"));
            await ctk.mint(user2.address, toWei("1000"));
            await ctk.connect(user1).approve(liquidityPool.address, toWei("1000"));
            await ctk.connect(user2).approve(liquidityPool.address, toWei("1000"));

            await liquidityPool.connect(user1).deposit(0, user1.address, toWei("1000"));
            await liquidityPool.connect(user2).addLiquidity(toWei("1000"));

            var now = Math.floor(Date.now() / 1000)
            await liquidityPool.connect(user1).trade(0, user1.address, toWei("1"), toWei("2000"), now + 100000, "0x0000000000000000000000000000000000000000", 0);

            await expect(liquidityPool.clear(0)).to.be.revertedWith("perpetual should be in EMERGENCY state");

            // user +1 amm -1
            await oracle.setIndexPrice(toWei("2000"), 2000);
            await oracle.setMarkPrice(toWei("2000"), 2000);

            await liquidityPool.setEmergencyState("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
            await liquidityPool.clear(0);
            await liquidityPool.connect(user1).settle(0, user1.address);
            const info = await liquidityPool.getLiquidityPoolInfo();
            console.log("poolCash            :  ", info.intNums[1].toString())
            console.log("insuranceFund       :  ", info.intNums[3].toString())
            console.log("donatedInsuranceFund:  ", info.intNums[4].toString())

            expect(await ctk.balanceOf(user2.address)).to.equal(0)
            await liquidityPool.connect(user2).removeLiquidity(await stk.balanceOf(user2.address), 0);
            expect(await ctk.balanceOf(user2.address)).to.equal(info.intNums[1])
        })

        it("settle - has donated insurance fund", async () => {
            await oracle.setIndexPrice(toWei("1000"), 1000);
            await oracle.setMarkPrice(toWei("1000"), 1000);

            await ctk.mint(user0.address, toWei("1000"));
            await ctk.mint(user1.address, toWei("1000"));
            await ctk.mint(user2.address, toWei("1000"));
            await ctk.connect(user0).approve(liquidityPool.address, toWei("1000"));
            await ctk.connect(user1).approve(liquidityPool.address, toWei("1000"));
            await ctk.connect(user2).approve(liquidityPool.address, toWei("1000"));

            await liquidityPool.donateInsuranceFund(toWei("1000"))
            await liquidityPool.connect(user1).deposit(0, user1.address, toWei("1000"));
            await liquidityPool.connect(user2).addLiquidity(toWei("1000"));

            var now = Math.floor(Date.now() / 1000)
            await liquidityPool.connect(user1).trade(0, user1.address, toWei("1"), toWei("2000"), now + 100000, "0x0000000000000000000000000000000000000000", 0);

            await expect(liquidityPool.clear(0)).to.be.revertedWith("perpetual should be in EMERGENCY state");

            // user +1 amm -1
            await oracle.setIndexPrice(toWei("2000"), 2000);
            await oracle.setMarkPrice(toWei("2000"), 2000);

            // avoid operator fee
            await liquidityPool.transferOperator(user3.address);
            await liquidityPool.connect(user3).claimOperator();

            await liquidityPool.setEmergencyState("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
            await liquidityPool.clear(0);
            await liquidityPool.connect(user1).settle(0, user1.address);
            const info = await liquidityPool.getLiquidityPoolInfo();
            console.log("poolCash            :  ", info.intNums[1].toString())
            console.log("insuranceFund       :  ", info.intNums[3].toString())
            console.log("donatedInsuranceFund:  ", info.intNums[4].toString())

            expect(await ctk.balanceOf(user3.address)).to.equal(toWei("1000"))

            expect(await ctk.balanceOf(user2.address)).to.equal(0)
            await liquidityPool.connect(user2).removeLiquidity(await stk.balanceOf(user2.address), 0);
            expect(await ctk.balanceOf(user2.address)).to.equal(info.intNums[1])
        })


        it("settle - no operator", async () => {
            await oracle.setIndexPrice(toWei("1000"), 1000);
            await oracle.setMarkPrice(toWei("1000"), 1000);

            await ctk.mint(user0.address, toWei("1000"));
            await ctk.mint(user1.address, toWei("1000"));
            await ctk.mint(user2.address, toWei("1000"));
            await ctk.connect(user0).approve(liquidityPool.address, toWei("1000"));
            await ctk.connect(user1).approve(liquidityPool.address, toWei("1000"));
            await ctk.connect(user2).approve(liquidityPool.address, toWei("1000"));

            await liquidityPool.donateInsuranceFund(toWei("1000"))
            await liquidityPool.connect(user1).deposit(0, user1.address, toWei("1000"));
            await liquidityPool.connect(user2).addLiquidity(toWei("1000"));

            var now = Math.floor(Date.now() / 1000)
            await liquidityPool.connect(user1).trade(0, user1.address, toWei("1"), toWei("2000"), now + 100000, "0x0000000000000000000000000000000000000000", 0);

            await expect(liquidityPool.clear(0)).to.be.revertedWith("perpetual should be in EMERGENCY state");

            // user +1 amm -1
            await oracle.setIndexPrice(toWei("2000"), 2000);
            await oracle.setMarkPrice(toWei("2000"), 2000);

            // avoid operator fee
            await liquidityPool.revokeOperator();

            await liquidityPool.setEmergencyState("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
            await liquidityPool.clear(0);
            await liquidityPool.connect(user1).settle(0, user1.address);
            const info = await liquidityPool.getLiquidityPoolInfo();
            console.log("poolCash            :  ", info.intNums[1].toString())
            console.log("insuranceFund       :  ", info.intNums[3].toString())
            console.log("donatedInsuranceFund:  ", info.intNums[4].toString())

            expect(await ctk.balanceOf(user2.address)).to.equal(0)
            await liquidityPool.connect(user2).removeLiquidity(await stk.balanceOf(user2.address), 0);
            expect(await ctk.balanceOf(user2.address)).to.equal(ethers.BigNumber.from(info.intNums[1]).add(ethers.BigNumber.from(toWei("1000"))))
        })
    });
})

