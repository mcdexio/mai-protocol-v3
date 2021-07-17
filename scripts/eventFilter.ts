const hre = require("hardhat")
const ethers = hre.ethers

import { DeploymentOptions } from './deployer/deployer'
import { readOnlyEnviron } from './deployer/environ'
import { printInfo, printError } from './deployer/utils'

const ENV: DeploymentOptions = {
    network: hre.network.name,
    artifactDirectory: './artifacts/contracts',
    addressOverride: {
    }
}

function toWei(n) { return hre.ethers.utils.parseEther(n) };
function fromWei(n) { return hre.ethers.utils.formatEther(n); }

async function main(_, deployer, accounts) {
    const poolCreator = await deployer.getDeployedContract("PoolCreator");
    {
        const filter = poolCreator.filters.AddGuardian()
        const logs = await poolCreator.queryFilter(filter);
        console.log(logs);
    }
}

ethers.getSigners()
    .then(accounts => readOnlyEnviron(ethers, ENV, main, accounts))
    .then(() => process.exit(0))
    .catch(error => {
        printError(error);
        process.exit(1);
    });


