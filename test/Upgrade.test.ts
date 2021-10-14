const { ethers } = require("hardhat");
const { expect } = require("chai");
import { BigNumber as BN } from "ethers";
import {
    toWei,
    createContract,
    createLiquidityPoolFactory,
    createFactory,
    deployPoolCreator
} from "../scripts/utils";

describe("upgrade", () => {

    const versionKey = (lp, gov) => {
        return ethers.utils.solidityKeccak256(["address[]", "address"], [lp, gov]);
    }


    it("main", async () => {
        // users
        const accounts = await ethers.getSigners();
        const user0 = accounts[0];
        const vault = accounts[9];
        const LiquidityPoolFactory = await createLiquidityPoolFactory();

        // create components
        var symbol = await createContract("SymbolService");
        await symbol.initialize(10000);
        var ctk = await createContract("CustomERC20", ["collateral", "CTK", 18]);
        var perp0Template = await LiquidityPoolFactory[0].deploy();
        var perp1Template = await LiquidityPoolFactory[1].deploy();
        var govTemplate = await createContract("TestLpGovernor");
        var poolCreator = await deployPoolCreator(symbol, vault, toWei("0.001"));
        await poolCreator.addVersion([perp0Template.address, perp1Template.address], govTemplate.address, 0, "initial version");
        await symbol.addWhitelistedFactory(poolCreator.address);

        const deployed = await poolCreator.callStatic.createLiquidityPool(
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
        const liquidityPool = await ethers.getContractAt("LiquidityPoolAllHops", deployed[0]);
        const governor = await ethers.getContractAt("TestLpGovernor", deployed[1]);

        // oracle
        let oracle1 = await createContract("OracleAdaptor", ["USD", "ETH"]);
        let oracle2 = await createContract("OracleAdaptor", ["USD", "ETH"]);

        let updatePrice = async (price1) => {
            let now = Math.floor(Date.now() / 1000);
            await oracle1.setMarkPrice(price1, now);
            await oracle1.setIndexPrice(price1, now);
            await oracle2.setMarkPrice(price1, now);
            await oracle2.setIndexPrice(price1, now);
        }

        await updatePrice(toWei("1000"))
        await liquidityPool.createPerpetual(oracle1.address,
            [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("1")],
            [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1"), toWei("0")],
            [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
            [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1"), toWei("0")],
        )
        await liquidityPool.createPerpetual(oracle2.address,
            [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("1")],
            [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1"), toWei("0")],
            [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
            [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1"), toWei("0")],
        )
        await liquidityPool.runLiquidityPool();

        await ctk.mint(user0.address, toWei("10000"));
        await ctk.connect(user0).approve(liquidityPool.address, toWei("10000"));
        await liquidityPool.addLiquidity(toWei("10000"));

        expect(await governor.balanceOf(user0.address)).to.equal(toWei("10000"))

        const TestLiquidityPoolUpgraded = await createLiquidityPoolFactory('TestLiquidityPoolUpgraded');
        var perp0Template2 = await TestLiquidityPoolUpgraded[0].deploy();
        var perp1Template2 = await TestLiquidityPoolUpgraded[1].deploy();
        var govTemplate2 = await createContract('TestLpGovernorUpgraded');
        await poolCreator.addVersion([perp0Template2.address, perp1Template2.address], govTemplate2.address, 1, "v2");
        var key2 = versionKey([perp0Template2.address, perp1Template2.address], govTemplate2.address);

        await governor.connect(user0).proposeToUpgradeAndCall(key2, "0x", "0x", "upgradetov2");

        const skipBlock = async (num) => {
            for (let i = 0; i < num; i++) {
                await ctk.approve(ctk.address, 1);
            }
        }
        await skipBlock(41);
        const upgradeAdmin = await ethers.getContractAt("IProxyAdmin", await poolCreator.upgradeAdmin());

        expect(await upgradeAdmin.getProxyImplementation(liquidityPool.address)).to.equal(perp0Template.address);
        expect(await upgradeAdmin.getProxyImplementation(governor.address)).to.equal(govTemplate.address);

        await governor.execute(1);

        expect(await upgradeAdmin.getProxyImplementation(liquidityPool.address)).to.equal(perp0Template2.address);
        expect(await upgradeAdmin.getProxyImplementation(governor.address)).to.equal(govTemplate2.address);
    })


    it("main - 2", async () => {
        // users
        const accounts = await ethers.getSigners();
        const user0 = accounts[0];
        const vault = accounts[9];
        const LiquidityPoolFactory = await createLiquidityPoolFactory();

        // create components
        var symbol = await createContract("SymbolService");
        await symbol.initialize(10000);
        var ctk = await createContract("CustomERC20", ["collateral", "CTK", 18]);
        var perp0Template = await LiquidityPoolFactory[0].deploy();
        var perp1Template = await LiquidityPoolFactory[1].deploy();
        var govTemplate = await createContract("TestLpGovernor");
        var poolCreator = await deployPoolCreator(symbol, vault, toWei("0.001"));
        await poolCreator.addVersion([perp0Template.address, perp1Template.address], govTemplate.address, 0, "initial version");
        await symbol.addWhitelistedFactory(poolCreator.address);

        const deployed = await poolCreator.callStatic.createLiquidityPool(
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
        const liquidityPool = await ethers.getContractAt("LiquidityPoolAllHops", deployed[0]);
        const governor = await ethers.getContractAt("TestLpGovernor", deployed[1]);

        // oracle
        let oracle1 = await createContract("OracleAdaptor", ["USD", "ETH"]);
        let oracle2 = await createContract("OracleAdaptor", ["USD", "ETH"]);

        let updatePrice = async (price1) => {
            let now = Math.floor(Date.now() / 1000);
            await oracle1.setMarkPrice(price1, now);
            await oracle1.setIndexPrice(price1, now);
            await oracle2.setMarkPrice(price1, now);
            await oracle2.setIndexPrice(price1, now);
        }

        await updatePrice(toWei("1000"))
        await liquidityPool.createPerpetual(oracle1.address,
            [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("1")],
            [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1"), toWei("0")],
            [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
            [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1"), toWei("0")],
        )
        await liquidityPool.createPerpetual(oracle2.address,
            [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("1")],
            [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1"), toWei("0")],
            [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
            [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1"), toWei("0")],
        )
        await liquidityPool.runLiquidityPool();

        await ctk.mint(user0.address, toWei("10000"));
        await ctk.connect(user0).approve(liquidityPool.address, toWei("10000"));
        await liquidityPool.addLiquidity(toWei("10000"));

        expect(await governor.balanceOf(user0.address)).to.equal(toWei("10000"))

        const TestLiquidityPoolUpgraded = await createLiquidityPoolFactory('TestLiquidityPoolUpgraded');
        var perp0Template2 = await TestLiquidityPoolUpgraded[0].deploy();
        var perp1Template2 = await TestLiquidityPoolUpgraded[1].deploy();
        var govTemplate2 = await createContract('TestLpGovernorUpgraded');
        await poolCreator.addVersion([perp0Template2.address, perp1Template2.address], govTemplate2.address, 1, "v2");
        var key2 = versionKey([perp0Template2.address, perp1Template2.address], govTemplate2.address);

        await governor.connect(user0).proposeToUpgradeAndCall(
            key2,
            "0x9f8fec3000000000000000000000000000000000000000000000000000000000000003e6",
            "0x9f8fec3000000000000000000000000000000000000000000000000000000000000003e7",
            "upgradetov2"
        );

        const skipBlock = async (num) => {
            for (let i = 0; i < num; i++) {
                await ctk.approve(ctk.address, 1);
            }
        }
        await skipBlock(41);
        const upgradeAdmin = await ethers.getContractAt("IProxyAdmin", await poolCreator.upgradeAdmin());

        expect(await upgradeAdmin.getProxyImplementation(liquidityPool.address)).to.equal(perp0Template.address);
        expect(await upgradeAdmin.getProxyImplementation(governor.address)).to.equal(govTemplate.address);

        await governor.execute(1);

        expect(await upgradeAdmin.getProxyImplementation(liquidityPool.address)).to.equal(perp0Template2.address);
        expect(await upgradeAdmin.getProxyImplementation(governor.address)).to.equal(govTemplate2.address);

        const newLiquidityPool = await TestLiquidityPoolUpgraded[0].attach(liquidityPool.address);
        const newGovernor = await ethers.getContractAt("TestLpGovernorUpgraded", governor.address);

        expect(await newLiquidityPool.testValue()).to.equal(998)
        expect(await newGovernor.testValue()).to.equal(999)
    })
})
