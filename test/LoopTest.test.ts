const { ethers } = require("hardhat");
const { expect } = require("chai");
import { BigNumber as BN } from "ethers";
import {
    toWei,
    fromWei,
    createFactory,
    createContract,
    createLiquidityPoolFactory
} from "../scripts/utils";

type Pair = Array<string>

class GasStat {
    collection: Array<Pair> = [];

    format(x) {
        return x.split('').reverse().map(function (a, i) { return a + ((i || 1) % 3 || a == '-' ? '' : ','); }).reverse().join('');
    }

    async collect(name, f) {
        const tx = await f;
        const receipt = await tx.wait();
        this.collection.push([name.padEnd(24), this.format(receipt.gasUsed.toString()).padStart(10)]);
    }

    summary() {
        console.table(this.collection)
    }
}

describe("LoopTest", () => {

    function toString(n) {
        if (n instanceof BN) {
            return fromWei(n.toString());
        } else if (n instanceof Array) {
            return n.map(toString);
        }
        return n;
    }

    function print(obj) {
        return;
        var props = []
        for (var n in obj) {
            props.push([n, toString(obj[n])]);
        }
        console.table(props)
    }

    it("main", async () => {
        var gs = new GasStat();
        // users
        const accounts = await ethers.getSigners();
        const user0 = accounts[0];
        const user1 = accounts[1];
        const user2 = accounts[2];
        const user3 = accounts[3];
        const vault = accounts[9];
        const none = "0x0000000000000000000000000000000000000000";
        const LiquidityPoolFactory = await createLiquidityPoolFactory();

        // create components
        var symbol = await createContract("SymbolService");
        await symbol.initialize(10000);
        var ctk = await createContract("CustomERC20", ["collateral", "CTK", 18]);
        var perpTemplate = await LiquidityPoolFactory.deploy();
        var govTemplate = await createContract("TestLpGovernor");
        var poolCreator = await createContract("PoolCreator");
        await poolCreator.initialize(
            symbol.address,
            vault.address,
            toWei("0.001"),
        )
        await poolCreator.addVersion(perpTemplate.address, govTemplate.address, 0, "initial version");
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
        var perp = await LiquidityPoolFactory.attach(liquidityPool);

        // oracle
        let oracle1 = await createContract("OracleAdaptor", ["USD", "ETH"]);
        let updatePrice = async (price1, price2, price3, price4) => {
            let now = Math.floor(Date.now() / 1000);
            await oracle1.setMarkPrice(price1, now);
            await oracle1.setIndexPrice(price1, now);
        }
        await updatePrice(toWei("500"), toWei("500"), toWei("500"), toWei("500"))

        for (let i = 0; i < 24; i++) {
            await perp.createPerpetual(oracle1.address,
                [toWei("0.01"), toWei("0.005"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.002"), toWei("0.5"), toWei("0.5"), toWei("4")],
                [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1")],
                [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
                [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1")],
            )
        }
        await perp.runLiquidityPool();

        // overview
        const info = await perp.getLiquidityPoolInfo();
        const stk = await (await createFactory("LpGovernor")).attach(info[2][4]);

        print(info);
        print(await perp.callStatic.getPerpetualInfo(0));

        // get initial coins
        await ctk.mint(user1.address, toWei("10000"));
        await ctk.mint(user2.address, toWei("10000"));
        await ctk.connect(user1).approve(perp.address, toWei("100000"));
        await ctk.connect(user2).approve(perp.address, toWei("100000"));

        await perp.forceToSyncState();

        // deposit
        await gs.collect("deposit", perp.connect(user1).deposit(0, user1.address, toWei("100")));
        print(await perp.connect(user1).callStatic.getMarginAccount(0, user1.address));

        // lp
        await updatePrice(toWei("501"), toWei("601"), toWei("701"), toWei("801"))
        await gs.collect("addLiquidity", perp.connect(user2).addLiquidity(toWei("1000")));
        // console.log("share:", fromWei(await stk.balanceOf(user2.address)));
        // console.log("ctk  :", fromWei(await ctk.balanceOf(user2.address)));

        print(await perp.callStatic.getLiquidityPoolInfo());


        let now = Math.floor(Date.now() / 1000);
        // trade 1
        await updatePrice(toWei("502"), toWei("603"), toWei("704"), toWei("805"))
        await gs.collect("trade 1 - open", perp.connect(user1).trade(0, user1.address, toWei("0.1"), toWei("1000"), now + 999999, none, 0));
        print(await perp.connect(user1).callStatic.getMarginAccount(0, user1.address));

        // trade 2
        await updatePrice(toWei("503"), toWei("604"), toWei("705"), toWei("806"))
        await gs.collect("trade 2 - open", perp.connect(user1).trade(0, user1.address, toWei("0.05"), toWei("1000"), now + 999999, none, 0));
        print(await perp.connect(user1).callStatic.getMarginAccount(0, user1.address));

        // trade 3
        await updatePrice(toWei("504"), toWei("605"), toWei("706"), toWei("807"))
        await gs.collect("trade 3 - revert", perp.connect(user1).trade(0, user1.address, toWei("-0.2"), toWei("0"), now + 999999, none, 0));
        print(await perp.connect(user1).callStatic.getMarginAccount(0, user1.address));

        // trade 4
        await updatePrice(toWei("505"), toWei("606"), toWei("707"), toWei("808"))
        await gs.collect("trade 4 - close all", perp.connect(user1).trade(0, user1.address, toWei("0.05"), toWei("1000"), now + 999999, none, 0));
        print(await perp.connect(user1).callStatic.getMarginAccount(0, user1.address));

        // broker
        var broker = await createContract("Broker");
        await broker.connect(user1).deposit({ value: toWei("0.2") });
        console.log((await broker.balanceOf(user1.address)).toString());

        // withdraw
        await updatePrice(toWei("506"), toWei("607"), toWei("708"), toWei("809"))
        await gs.collect("withdraw", perp.connect(user1).withdraw(0, user1.address, toWei("10")));
        // console.log(fromWei(await ctk.connect(user1).balanceOf(user1.address)));

        var { cash, position } = await perp.connect(user2).callStatic.getMarginAccount(0, perp.address);
        // console.log(fromWei(cash), fromWei(position));

        // remove lp
        await updatePrice(toWei("507"), toWei("608"), toWei("709"), toWei("800"))
        await gs.collect("removeLiquidity", perp.connect(user2).removeLiquidity(await stk.balanceOf(user2.address), toWei("0")));
        console.log("share:", fromWei(await stk.balanceOf(user2.address)));
        console.log("ctk  :", fromWei(await ctk.connect(user2).balanceOf(user2.address)));

        gs.summary();
    })


    it("settle", async () => {
        var gs = new GasStat();
        // users
        const accounts = await ethers.getSigners();
        const user0 = accounts[0];
        const user1 = accounts[1];
        const user2 = accounts[2];
        const user3 = accounts[3];
        const vault = accounts[9];
        const none = "0x0000000000000000000000000000000000000000";
        const LiquidityPoolFactory = await createLiquidityPoolFactory();

        // create components
        var symbol = await createContract("SymbolService");
        await symbol.initialize(10000);
        var ctk = await createContract("CustomERC20", ["collateral", "CTK", 18]);
        var perpTemplate = await LiquidityPoolFactory.deploy();
        var govTemplate = await createContract("TestLpGovernor");
        var poolCreator = await createContract("PoolCreator");
        await poolCreator.initialize(
            symbol.address,
            vault.address,
            toWei("0.001"),
        )
        await poolCreator.addVersion(perpTemplate.address, govTemplate.address, 0, "initial version");
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
        var perp = await LiquidityPoolFactory.attach(liquidityPool);

        // oracle
        let oracle1 = await createContract("OracleAdaptor", ["USD", "ETH"]);
        let updatePrice = async (price1) => {
            let now = Math.floor(Date.now() / 1000);
            await oracle1.setMarkPrice(price1, now);
            await oracle1.setIndexPrice(price1, now);
        }
        await updatePrice(toWei("500"))

        for (let i = 0; i < 48; i++) {
            await perp.createPerpetual(oracle1.address,
                [toWei("0.01"), toWei("0.005"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.002"), toWei("0.5"), toWei("0.5"), toWei("4")],
                [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1")],
                [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
                [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1")],
            )
        }
        await perp.runLiquidityPool();

        // overview
        const info = await perp.getLiquidityPoolInfo();
        const stk = await (await createFactory("LpGovernor")).attach(info[2][4]);

        print(info);
        print(await perp.callStatic.getPerpetualInfo(0));

        // get initial coins
        await ctk.mint(user1.address, toWei("10000"));
        await ctk.mint(user2.address, toWei("10000"));
        await ctk.connect(user1).approve(perp.address, toWei("100000"));
        await ctk.connect(user2).approve(perp.address, toWei("100000"));

        await perp.forceToSyncState();

        // deposit
        await gs.collect("deposit", perp.connect(user1).deposit(0, user1.address, toWei("100")));
        print(await perp.connect(user1).callStatic.getMarginAccount(0, user1.address));

        // lp
        await updatePrice(toWei("501"))
        await gs.collect("addLiquidity", perp.connect(user2).addLiquidity(toWei("1000")));
        // console.log("share:", fromWei(await stk.balanceOf(user2.address)));
        // console.log("ctk  :", fromWei(await ctk.balanceOf(user2.address)));

        print(await perp.callStatic.getLiquidityPoolInfo());


        let now = Math.floor(Date.now() / 1000);
        // trade 1
        await updatePrice(toWei("502"))
        await gs.collect("trade 1 - open", perp.connect(user1).trade(0, user1.address, toWei("0.1"), toWei("1000"), now + 999999, none, 0));
        print(await perp.connect(user1).callStatic.getMarginAccount(0, user1.address));

        await updatePrice(toWei("55010"))

        await gs.collect("setEmergencyState", perp.setEmergencyState("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"))

        gs.summary();
    })
})
