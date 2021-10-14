const { ethers } = require("hardhat");
import { expect, use } from "chai";
import {
    toWei,
    fromWei,
    toBytes32,
    getAccounts,
    createContract,
    createLiquidityPoolFactory,
    deployPoolCreator,
} from '../scripts/utils';
import "./helper";


describe('LiquidityPool3', () => {
    let accounts;
    let user0;
    let user1;
    let user2;
    let user3;
    let vault;
    let ctk;
    let poolCreator;
    let LiquidityPoolFactory;
    let oracle;

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
        var govTemplate = await createContract("TestGovernor");
        poolCreator = await deployPoolCreator(symbol, vault, toWei("0.001"));
        await poolCreator.addVersion([perp0Template.address, perp1Template.address], govTemplate.address, 0, "initial version");
        await symbol.addWhitelistedFactory(poolCreator.address);
        oracle = await createContract("OracleAdaptor", ["USD", "ETH"]);
        let now = Math.floor(Date.now() / 1000);
        await oracle.setIndexPrice(toWei('100'), now);
        await oracle.setMarkPrice(toWei('100'), now);
    });

    it("createPerpetual - address", async () => {
        const deplpyed1 = await poolCreator.callStatic.createLiquidityPool(ctk.address, 18, 998, ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1]));
        await ctk.approve(deplpyed1[0], 1000);
        const deplpyed2 = await poolCreator.callStatic.createLiquidityPool(ctk.address, 18, 998, ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1]));
        expect(deplpyed1[0]).to.equal(deplpyed2[0]);
        expect(deplpyed1[1]).to.equal(deplpyed2[1]);
    })

    it("createPerpetual - fastCreation disable", async () => {
        const deployed = await poolCreator.callStatic.createLiquidityPool(ctk.address, 18, 998, ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1]));
        await poolCreator.createLiquidityPool(ctk.address, 18, 998, ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1]));

        const liquidityPool = await ethers.getContractAt("LiquidityPoolAllHops", deployed[0]);
        await liquidityPool.createPerpetual(oracle.address,
            [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("1")],
            [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1"), toWei("0")],
            [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
            [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1"), toWei("0")],
        )
        await liquidityPool.runLiquidityPool();
        await expect(liquidityPool.runLiquidityPool()).to.be.revertedWith("already running")

        await expect(liquidityPool.createPerpetual(oracle.address,
            [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("1")],
            [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1"), toWei("0")],
            [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
            [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1"), toWei("0")],
        )).to.be.revertedWith("only governor can create perpetual")
    })

    it("createPerpetual - fastCreation enabled", async () => {
        const deployed = await poolCreator.callStatic.createLiquidityPool(ctk.address, 18, 998, ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [true, toWei("1000000"), 0, 1]));
        await poolCreator.createLiquidityPool(ctk.address, 18, 998, ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [true, toWei("1000000"), 0, 1]));

        const liquidityPool = await ethers.getContractAt("LiquidityPoolAllHops", deployed[0]);
        await liquidityPool.createPerpetual(oracle.address,
            [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("1")],
            [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1"), toWei("0")],
            [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
            [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1"), toWei("0")],
        )
        await liquidityPool.runLiquidityPool();
        await expect(liquidityPool.runLiquidityPool()).to.be.revertedWith("already running")

        await liquidityPool.createPerpetual(oracle.address,
            [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("1")],
            [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1"), toWei("0")],
            [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
            [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1"), toWei("0")],
        );
    })

})

