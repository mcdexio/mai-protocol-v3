const { ethers } = require("hardhat");
import {
    toWei,
    createContract,
    createPoolFactory,
    createFactory
} from "./utils";

async function main(accounts: any[]) {
    const vault = accounts[0];
    var makerFactory = await createFactory("PoolCreator");
    var maker = await makerFactory.attach("0xC3B9183D2eae209ff0AFE6a32974Fd9f784b1685");
    var perpTemplate = await (await createPoolFactory()).deploy();
    await maker.addVersion(perpTemplate.address, 0, "1");
    const tx = await maker.createLiquidityPool(
        "0xea2b57fEa28F145909F480731121FcaF6B69726A",
        [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002")],
        [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5")],
        [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
        [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10")],
        998,
    );
    const n = await maker.totalLiquidityPoolCount();
    const allLiquidityPools = await maker.listLiquidityPools(0, n.toString());
    const liquidityPoolFactory = await createPoolFactory();
    const perp = await liquidityPoolFactory.attach(allLiquidityPools[allLiquidityPools.length - 1]);
    const addresses = [
        ["LiquidityPool (test)", `${perp.address} : ${n} @ ${tx.blockNumber}`],
    ]

    console.table(addresses)
}

ethers.getSigners()
    .then(accounts => main(accounts))
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });