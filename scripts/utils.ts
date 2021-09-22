const { ethers } = require("hardhat");
const chalk = require('chalk')
import { ethers as originalEthers } from 'ethers'

export function toWei(n) { return ethers.utils.parseEther(n) };
export function fromWei(n) { return ethers.utils.formatEther(n); }
export function toBytes32(s) { return ethers.utils.formatBytes32String(s); }
export function fromBytes32(s) { return ethers.utils.parseBytes32String(s); }

var defaultSigner = null

export function setDefaultSigner(signer) {
    defaultSigner = signer
}

export async function getAccounts(): Promise<any[]> {
    const accounts = await ethers.getSigners();
    const users = [];
    accounts.forEach(element => {
        users.push(element.address);
    });
    return accounts;
}

export async function createFactory(path, libraries = {}) {
    const parsed = {}
    for (var name in libraries) {
        parsed[name] = libraries[name].address;
    }
    return await ethers.getContractFactory(path, { libraries: parsed })
}

export async function createContract(contractName, args = [], libraries = {}) {
    const signer = defaultSigner || (await ethers.getSigners())[0]
    const factory = await createFactory(contractName, libraries);
    let deployed
    if (signer != null) {
        deployed = await factory.connect(signer).deploy(...args)
    } else {
        deployed = await factory.deploy(...args);
    }
    return deployed
}

export async function createLiquidityPoolFactory(name = "LiquidityPool") {
    const AMMModule = await createContract("AMMModule"); // 0x7360a5370d5654dc9d2d9e365578c1332b9a82b5
    const CollateralModule = await createContract("CollateralModule") // 0xdea04ead9bce0ba129120c137117504f6dfaf78f
    const OrderModule = await createContract("OrderModule"); // 0xf8781589ae61610af442ffee69d310a092a8d41a
    const PerpetualModule = await createContract("PerpetualModule"); // 0x07315f8eca5c349716a868150f5d1951d310c53e
    const LiquidityPoolModule = await createContract("LiquidityPoolModule", [], { CollateralModule, AMMModule, PerpetualModule }); // 0xbd7bfceb24108a9adbbcd4c57bacdd5194f3be68
    const LiquidityPoolModule2 = await createContract("LiquidityPoolModule2", [], { CollateralModule, PerpetualModule, LiquidityPoolModule }); // 0xbd7bfceb24108a9adbbcd4c57bacdd5194f3be68
    const TradeModule = await createContract("TradeModule", [], { AMMModule, LiquidityPoolModule, LiquidityPoolModule2 }); // 0xbe884fecccbed59a32c7185a171223d1c07c446b
    const hop0 = await createFactory(name, {
        LiquidityPoolModule,
        LiquidityPoolModule2,
        OrderModule,
        TradeModule,
    });
    const hop1 = await createFactory('LiquidityPoolHop1', {
        AMMModule,
        LiquidityPoolModule,
        LiquidityPoolModule2,
        TradeModule,
    });
    return [hop0, hop1];
}

// OVM optimize: prevent from generating unsafe pool.upgradeAdmin
export async function deployPoolCreator(symbol, vault, vaultFeeRate, contractName = "PoolCreator") {
    let poolCreator = await createContract(contractName, [], {
        PoolCreatorModule: await createContract("PoolCreatorModule")
    });
    await poolCreator.initialize(
        symbol.address,
        vault.address,
        vaultFeeRate
    )
    return poolCreator
}
