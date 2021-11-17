const hre = require("hardhat")
const ethers = hre.ethers

import { DeploymentOptions } from './deployer/deployer'
import { restorableEnviron } from './deployer/environ'
import { ensureFinished, printError } from './deployer/utils'

const ENV: DeploymentOptions = {
    network: hre.network.name,
    artifactDirectory: './artifacts/contracts',
    addressOverride: {}
}

function toWei(n) { return hre.ethers.utils.parseEther(n) };
function fromWei(n) { return hre.ethers.utils.formatEther(n); }

const chainlinks = [
    // bsc
    // base, quote, deviation, timeout, chainlink
    // ['ETH',  'USD', '0.015',  900, '0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf'],
    // ['BTC',  'USD', '0.015',  900, '0x9ef1B8c0E4F7dc8bF5719Ea496883DC6401d5b2e'],
]

let chainlinkAdaptors = [
    // bsc
    // chainlinkAdaptor, base, quote, deviation, timeout, chainlink
    ["0x9542100D1117F75b8b6b8Ddc4DC2C7419A206725","ETH","USD",'0.015',900,"0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf"],
    ["0x2Baac806CB2b7A07f8f73DB1329767E5a3CbDF4e","BTC","USD",'0.015',900,"0x9ef1B8c0E4F7dc8bF5719Ea496883DC6401d5b2e"],
    ["0xEf5D601ea784ABd465c788C431d990b620e5Fee6","BNB","USD",'0.024',900,"0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE"],
    ["0x11bD9582af7Aead7638Aa9427489814DCb21395a","SPELL","USD",'0.05',1200,"0x47e01580C537Cd47dA339eA3a4aFb5998CCf037C"],
]

async function deployChainlinkAdaptors(deployer) {
    // deploy (once)
    // const implementation = await deployer.deploy("ChainlinkAdaptor")
    // const beacon = await deployer.deploy("UpgradeableBeacon", implementation.address);

    // add external oracles
    const beacon = await deployer.getContractAt("UpgradeableBeacon", "0xde66ECA1Ed5A881d14A100016B955A59574714a2")
    for (const [base, quote, deviation, timeout, chainlink] of chainlinks) {
        const abi = new ethers.utils.Interface([
            'function initialize(address chainlink_, string memory collateral_, string memory underlyingAsset)',
        ])       
        const data = abi.encodeFunctionData("initialize", [chainlink, quote, base])
        const adaptor = await deployer.deploy("BeaconProxy", beacon.address, data);
        chainlinkAdaptors.push([
            adaptor.address, base, quote, deviation, timeout, chainlink
        ])
    }
    console.log(JSON.stringify(chainlinkAdaptors))
}

async function deployRegister(deployer) {
    const upgradeAdmin = '0xd80c8fF02Ac8917891C47559d415aB513B44DCb6'

    // deploy (once)
    await deployer.deployAsUpgradeable("TunableOracleRegister", upgradeAdmin)

    // init register (once)
    const register = await deployer.getDeployedContract("TunableOracleRegister")
    await ensureFinished(register.initialize())
    console.log('beacon implementation =', await register.callStatic.implementation())
}

async function registerChainlink(deployer) {
    const register = await deployer.getDeployedContract("TunableOracleRegister")
    for (const [chainlinkAdaptor, base, quote, deviation, timeout, chainlink] of chainlinkAdaptors) {
        console.log('setting', base, quote)
        await ensureFinished(register.setExternalOracle(chainlinkAdaptor, toWei(deviation), timeout));
    }
}

async function deployTunableOracle(deployer) {
    // bsc
    const liquidityPoolAddress = '0xdb282bbace4e375ff2901b84aceb33016d0d663d'

    const register = await deployer.getDeployedContract("TunableOracleRegister")
    for (const [chainlinkAdaptor, base, quote, deviation, timeout, chainlink] of chainlinkAdaptors) {
        console.log('new TunableOracle', base, quote)
        const receipt = await ensureFinished(register.newTunableOracle(liquidityPoolAddress, chainlinkAdaptor));
        console.log('  tx', receipt.hash)
        console.log('  deployed at', receipt.events[0].args['newOracle'])
    }
}

async function deployMultiSetter(deployer) {
    const upgradeAdmin = '0xd80c8fF02Ac8917891C47559d415aB513B44DCb6'

    // deploy (once)
    // await deployer.deployAsUpgradeable("MultiTunableOracleSetter", upgradeAdmin)

    // init register (once)
    const setter = await deployer.getDeployedContract("MultiTunableOracleSetter")
    await ensureFinished(setter.initialize())

    // add oracle
    // bsc
    await ensureFinished(setter.setOracle(0, '0x7a6bee1474069dC81AEaf65799276b9429bED587'))
    await ensureFinished(setter.setOracle(1, '0x285D90D4a30c30AFAE1c8dc3eaeb41Cc23Ed78Bf'))
    await ensureFinished(setter.setOracle(2, '0x4E9712fC3e6Fc35b7b2155Bb92c11bC0BEd836f1'))
    await ensureFinished(setter.setOracle(3, '0x2bc36B3f8f8E3Db2902Ac8cEF650B687deCE25f6'))
}

async function main(_, deployer, accounts) {
    // 1. deploy chainlink adaptors
    // await deployChainlinkAdaptors(deployer)
    
    // 2. deploy register (once)
    // await deployRegister(deployer)

    // 3. add chainlink into register
    // await registerChainlink(deployer)

    // 4. use Register to deploy some oracles
    // await deployTunableOracle(deployer)

    // 5. deploy multi setter (optional)
    // await deployMultiSetter(deployer)
}

ethers.getSigners()
    .then(accounts => restorableEnviron(ethers, ENV, main, accounts))
    .then(() => process.exit(0))
    .catch(error => {
        printError(error);
        process.exit(1);
    });


