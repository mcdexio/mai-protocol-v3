const hre = require("hardhat")
const ethers = hre.ethers

import { Deployer, DeploymentOptions } from './deployer/deployer'
import { restorableEnviron } from './deployer/environ'
import { sleep, ensureFinished, printInfo, printError } from './deployer/utils'

const ENV: DeploymentOptions = {
    network: hre.network.name,
    artifactDirectory: './artifacts/contracts',
    addressOverride: {
    }
}

async function main(_, deployer, accounts) {
    // add version
    const liquidityPool = await deployer.deployOrSkip("LiquidityPool")
    const liquidityPoolHop1 = await deployer.deployOrSkip("LiquidityPoolHop1")
    console.log("new liquidity pool imp      =>", liquidityPool.address)
    console.log("new liquidity pool imp hop1 =>", liquidityPoolHop1.address)
}
ethers.getSigners()
    .then(accounts => restorableEnviron(ethers, ENV, main, accounts))
    .then(() => process.exit(0))
    .catch(error => {
        printError(error);
        process.exit(1);
    });


