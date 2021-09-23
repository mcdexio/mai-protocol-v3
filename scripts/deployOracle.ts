const hre = require("hardhat")
const ethers = hre.ethers

import { expect } from 'chai'
import { Deployer, DeploymentOptions } from './deployer/deployer'
import { restorableEnviron } from './deployer/environ'
import { sleep, ensureFinished, printInfo, printError } from './deployer/utils'

const ENV: DeploymentOptions = {
    network: hre.network.name,
    artifactDirectory: './artifacts/contracts',
    addressOverride: {
    }
}

function toWei(n) { return hre.ethers.utils.parseEther(n) };
function fromWei(n) { return hre.ethers.utils.formatEther(n); }

async function main(_, deployer, accounts) {
    // ArbOne
    const upgradeAdmin = "0x93a9182883C1019e1dBEbB5d40C140e7680cd151"
    // BSC
    // const upgradeAdmin = "0xd80c8fF02Ac8917891C47559d415aB513B44DCb6"

    // multi
    await deployer.deployAsUpgradeable("MCDEXMultiOracle", upgradeAdmin)
    const multiOracle = await deployer.getDeployedContract("MCDEXMultiOracle")
    await ensureFinished(multiOracle.initialize())
    await multiOracle.setMarket(0, 'USD', 'ETH')
    await multiOracle.setMarket(1, 'USD', 'BTC')
    await multiOracle.setPrice(0, toWei('3106.76'), 1632370697)
    await multiOracle.setPrice(1, toWei('44109.94'), 1632370697)

    // single
    const singleOracleTemplate = await deployer.deployOrSkip("MCDEXSingleOracle")
    await deployer.deploy("UpgradeableBeacon", singleOracleTemplate.address)
    const singleOracleBeacon = await deployer.getDeployedContract("UpgradeableBeacon")
    const MCDEXSingleOracleInterface = new ethers.utils.Interface([
        'function initialize(address, uint256)',
    ])
    await deployer.deploy("BeaconProxy", singleOracleBeacon.address,
        MCDEXSingleOracleInterface.encodeFunctionData("initialize", [multiOracle.address, 0]))
    await deployer.deploy("BeaconProxy", singleOracleBeacon.address,
        MCDEXSingleOracleInterface.encodeFunctionData("initialize", [multiOracle.address, 1]))
}

const accounts = ethers.getSigners()
restorableEnviron(ethers, ENV, main, accounts)
    .then(() => process.exit(0))
    .catch(error => {
        printError(error);
        process.exit(1);
    });


