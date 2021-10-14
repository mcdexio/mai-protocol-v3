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

describe("integration3 - 2 perps. add/remove liquidity", () => {

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
            [toWei("0.01"), toWei("0.005"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.002"), toWei("0.5"), toWei("0.5"), toWei("4")],
            [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1"), toWei("0")],
            [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
            [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1"), toWei("0")],
        )
        await perp.createPerpetual(oracle2.address,
            [toWei("0.01"), toWei("0.005"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.002"), toWei("0.5"), toWei("0.5"), toWei("4")],
            [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1"), toWei("0")],
            [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
            [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1"), toWei("0")],
        )

        // share token
        const info = await perp.getLiquidityPoolInfo();
        stk = await (await createFactory("LpGovernor")).attach(info[2][4]);

        // get initial coins
    });

    it("normal case", async () => {
        await perp.runLiquidityPool();
        // add liquidity
        await ctk.mint(user1.address, toWei("10"))
        await ctk.connect(user1).approve(perp.address, toWei("10"))
        await perp.connect(user1).addLiquidity(toWei("10"));
        expect(await stk.balanceOf(user1.address)).to.equal(toWei("10"))

        await perp.connect(user1).removeLiquidity(toWei("5"), 0);
        expect(await stk.balanceOf(user1.address)).to.equal(toWei("5"))
        expect(await ctk.balanceOf(user1.address)).to.equal(toWei("5"))

        await perp.connect(user1).removeLiquidity(toWei("5"), 0);
        expect(await stk.balanceOf(user1.address)).to.equal(toWei("0"))
        expect(await ctk.balanceOf(user1.address)).to.equal(toWei("10"))
    })

    it("lock - 1", async () => {
        const flash = await createContract("FlashLP")
        await perp.runLiquidityPool();
        // add liquidity
        await ctk.mint(flash.address, toWei("1000000"))
        await flash.approve(ctk.address, perp.address)
        await expect(flash.act1(perp.address, toWei("10"))).to.be.revertedWith("sender is locked")
    })
})
