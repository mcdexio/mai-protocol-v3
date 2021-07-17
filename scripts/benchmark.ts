const hre = require("hardhat")
const ethers = hre.ethers

import { DeploymentOptions } from './deployer/deployer'
import { readOnlyEnviron, restorableEnviron } from "./deployer/environ";
import { ensureFinished, printError } from "./deployer/utils";

const ENV: DeploymentOptions = {
    network: hre.network.name,
    artifactDirectory: './artifacts/contracts',
    addressOverride: {},
}

function toWei(n) { return hre.ethers.utils.parseEther(n) }

const vaultFeeRate = toWei("0");
const vault = "0x81183C9C61bdf79DB7330BBcda47Be30c0a85064"
let masterAcc;
let tradesWallet = [];
let tradesWalletAdd = [];
let mockUSDCContract;
let disperseContract;
let latestLiquidityPoolContract;
let readerContract;

async function distribute(count: number, ethers) {
    for (let i = 0; i < count; i++) {
        // need to connect to provider
        const newWallet = ethers.Wallet.createRandom().connect(ethers.provider)
        const add = await newWallet.address
        tradesWallet.push(newWallet)
        tradesWalletAdd.push(add)
        await ensureFinished(mockUSDCContract.mint(add, "25000000" + "000000"))
        await ensureFinished(mockUSDCContract.approve(latestLiquidityPoolContract.address, "25000000" + "000000"))
    }
    // distribute 1 eth to count of accounts
    disperseContract.disperseEther(tradesWalletAdd, toWei("1"))
    console.log("Done distribute")
}

async function setup(ethers, deployer, accounts) {
    console.log("start setup")
    masterAcc = accounts[0]
    // symbolService
    await deployer.deploy("SymbolService")
    const symbolService = await deployer.getDeployedContract("SymbolService")
    await ensureFinished(symbolService.initialize(10000))
    console.log("Done deploy SymbolService")

    // PoolCreator
    await deployer.deploy("PoolCreator")
    const poolCreator = await deployer.getDeployedContract("PoolCreator")
    console.log("Done deploy PoolCreator")
    await ensureFinished(poolCreator.initialize(
        deployer.addressOf("SymbolService"),
        vault,
        vaultFeeRate
    ))
    await ensureFinished(symbolService.addWhitelistedFactory(poolCreator.address))

    // LiquidityPool
    const liquidityPool = await deployer.deploy("LiquidityPool")
    const governor = await deployer.deploy("LpGovernor")
    console.log("Done deploy liquidityPool, governor")
    await ensureFinished(poolCreator.addVersion(liquidityPool.address, governor.address, 0, "initial version"))

    // deploy mock erc20
    mockUSDCContract = await deployer.deploy("CustomERC20", "MockUSDC", "MockUSDC", 6)
    console.log("Done deploy mockUSDCContract")
    await ensureFinished(poolCreator.createLiquidityPool(
        mockUSDCContract.address,
        6,
        Math.floor(Date.now() / 1000),
        ethers.utils.defaultAbiCoder.encode(["bool", "int256"], [false, toWei("10000000")])
    ))

    // deploy oracle
    const oracle = await deployer.deploy("OracleAdaptor", "USD", "ETH")
    console.log("Done deploy oracleAdaptor")
    let now = Math.floor(Date.now() / 1000);
    await ensureFinished(oracle.setIndexPrice(toWei("100"), now))
    await ensureFinished(oracle.setMarkPrice(toWei("100"), now))

    // createPerpetual
    const n = await poolCreator.getLiquidityPoolCount();
    const allLiquidityPools = await poolCreator.listLiquidityPools(0, n.toString());
    latestLiquidityPoolContract = await deployer.getContractAt("LiquidityPool", allLiquidityPools[allLiquidityPools.length - 1]);
    await ensureFinished(latestLiquidityPoolContract.createPerpetual(
        oracle.address,
        // imr          mmr            operatorfr        lpfr              rebate        penalty        keeper       insur         oi
        [toWei("0.04"), toWei("0.03"), toWei("0.00010"), toWei("0.00055"), toWei("0.2"), toWei("0.01"), toWei("10"), toWei("0.5"), toWei("3")],
        // alpha           beta1            beta2             frLimit        lev         maxClose       frFactor        defaultLev
        [toWei("0.00075"), toWei("0.0075"), toWei("0.00525"), toWei("0.01"), toWei("1"), toWei("0.05"), toWei("0.005"), toWei("10")],
        [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
        [toWei("0.1"), toWei("0.5"), toWei("0.5"), toWei("0.1"), toWei("5"), toWei("1"), toWei("0.1"), toWei("10000000")]
    ))
    await ensureFinished(latestLiquidityPoolContract.runLiquidityPool())
    console.log("Done create perpetual")
    await ensureFinished(mockUSDCContract.mint(masterAcc.address, "25000000" + "000000"))
    await ensureFinished(latestLiquidityPoolContract.addLiquidity(toWei("25000000")))

    // disperse (
    disperseContract = await deployer.deploy("Disperse")
    console.log("Done deploy disperseContract")
    await ensureFinished(distribute(10, ethers))

    // for (let i = 0; i < 10; i++) {
    //   await ensureFinished(mockUSDCContract.connect(tradesWallet[0]).approve(latestLiquidityPoolContract.address, "25000000" + "000000"))
    //   await ensureFinished(latestLiquidityPoolContract.setTargetLeverage(0, tradesWalletAdd[0], toWei("25")))
    // }

    // readerContract = await deployer.deploy("Reader", poolCreator.address)
    // var {cash, position} = await ensureFinished(readerContract.getMarginAccount(0, tradesWalletAdd[0]))
    // const balance = await mockUSDCContract.methods.balanceOf(tradesWalletAdd[0]).call();
    // console.log(cash.toString())
    // console.log(position.toString())
    // console.log(balance)
}

async function main(ethers, deployer, accounts) {
    await setup(ethers, deployer, accounts)
}

ethers.getSigners()
    .then(accounts => restorableEnviron(ethers, ENV, main, accounts))
    .then(() => process.exit(0))
    .catch(error => {
        printError(error);
        process.exit(1);
    });