const hre = require("hardhat")
const ethers = hre.ethers

import { DeploymentOptions } from './deployer/deployer'
import { restorableEnviron } from "./deployer/environ";
import { ensureFinished, printError } from "./deployer/utils";

const ENV: DeploymentOptions = {
    network: hre.network.name,
    artifactDirectory: './artifacts/contracts',
    addressOverride: {},
}

function toWei(n) { return hre.ethers.utils.parseEther(n) };

async function main(ethers, deployer, accounts) {
    const vaultFeeRate = toWei("0.00015");
    const vault = "0x81183C9C61bdf79DB7330BBcda47Be30c0a85064"

    // symbolService
    await deployer.deploy("SymbolService")
    const symbolService = await deployer.getDeployedContract("SymbolService")
    await ensureFinished(symbolService.initialize(10000))

    // PoolCreator
    await deployer.deploy("PoolCreator")
    const poolCreator = await deployer.getDeployedContract("PoolCreator")
    await deployer.deploy("Tracer")
    const tracer = await deployer.getDeployedContract("Tracer")

    await ensureFinished(tracer.initialize(poolCreator.address))
    await ensureFinished(poolCreator.initialize(
        deployer.addressOf("SymbolService"),
        vault,
        vaultFeeRate,
        tracer.address
    ))
    await ensureFinished(symbolService.addWhitelistedFactory(poolCreator.address))


    // LiquidityPool
    const liquidityPool = await deployer.deploy("LiquidityPool")
    const governor = await deployer.deploy("LpGovernor")
    await ensureFinished(poolCreator.addVersion(liquidityPool.address, governor.address, 0, "initial version"))

    // deploy mock erc20
    const usd = await deployer.deploy("MockUSDC")
    await ensureFinished(poolCreator.createLiquidityPool(
        usd.address,
        6,
        Math.floor(Date.now() / 1000),
        // (isFastCreationEnabled, insuranceFundCap, liquidityCap, addLiquidityDelay)
        ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("10000000"), 0, 1])
    ))

    // deploy oracle
    const oracle = await deployer.deploy("OracleAdaptor", "USD", "ETH")
    let now = Math.floor(Date.now() / 1000);
    await ensureFinished(oracle.setIndexPrice(100, now))
    await ensureFinished(oracle.setMarkPrice(100, now))

    // createPerpetual
    const n = await poolCreator.getLiquidityPoolCount();
    const allLiquidityPools = await poolCreator.listLiquidityPools(0, n.toString());
    const latestLiquidityPool = await deployer.getContractAt("LiquidityPool", allLiquidityPools[allLiquidityPools.length - 1]);
    await ensureFinished(latestLiquidityPool.createPerpetual(
        oracle.address,
        // imr          mmr            operatorfr        lpfr              rebate        penalty        keeper       insur         oi
        [toWei("0.04"), toWei("0.03"), toWei("0.00010"), toWei("0.00055"), toWei("0.2"), toWei("0.01"), toWei("10"), toWei("0.5"), toWei("3")],
        // alpha           beta1            beta2             frLimit        lev         maxClose       frFactor        defaultLev
        [toWei("0.00075"), toWei("0.0075"), toWei("0.00525"), toWei("0.01"), toWei("1"), toWei("0.05"), toWei("0.005"), toWei("10")],
        [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
        [toWei("0.1"), toWei("0.5"), toWei("0.5"), toWei("0.1"), toWei("5"), toWei("1"), toWei("0.1"), toWei("10000000")]
    ))

    await ensureFinished(latestLiquidityPool.runLiquidityPool())
}

ethers.getSigners()
    .then(accounts => restorableEnviron(ethers, ENV, main, accounts))
    .then(() => process.exit(0))
    .catch(error => {
        printError(error);
        process.exit(1);
    });