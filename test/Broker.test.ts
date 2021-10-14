import { expect } from "chai";
const { ethers } = require("hardhat");
import {
    toWei,
    fromWei,
    toBytes32,
    getAccounts,
    createContract,
    createLiquidityPoolFactory,
    deployPoolCreator,
} from '../scripts/utils';
import { TypedDataUtils } from 'ethers-eip712'
import {
    ecsign
} from 'ethereumjs-util'


describe('Broker', () => {
    let accounts;
    let user0;
    let user1;
    let user2;
    let user3;
    let vault;
    let ctk;
    let oracle;
    let poolCreator;
    let LiquidityPoolFactory;
    let liquidityPool;
    let broker;
    let testOrder;
    let now;

    before(async () => {
        accounts = await getAccounts();
        user0 = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];
        vault = accounts[9];
    })

    beforeEach(async () => {
        LiquidityPoolFactory = await createLiquidityPoolFactory("LiquidityPool");

        var symbol = await createContract("SymbolService");
        await symbol.initialize(10000);
        ctk = await createContract("CustomERC20", ["collateral", "CTK", 18]);
        var perp0Template = await LiquidityPoolFactory[0].deploy();
        var perp1Template = await LiquidityPoolFactory[1].deploy();
        var govTemplate = await createContract("TestLpGovernor");
        poolCreator = await deployPoolCreator(symbol, vault, toWei("0.001"));
        await poolCreator.addVersion([perp0Template.address, perp1Template.address], govTemplate.address, 0, "initial version");
        await symbol.addWhitelistedFactory(poolCreator.address);

        const result = await poolCreator.callStatic.createLiquidityPool(
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
        liquidityPool = await ethers.getContractAt("LiquidityPoolAllHops", result[0]);

        oracle = await createContract("OracleAdaptor", ["USD", "ETH"]);
        now = Math.floor(Date.now() / 1000);
        await oracle.setMarkPrice(toWei("1000"), now);
        await oracle.setIndexPrice(toWei("1000"), now);
        await liquidityPool.createPerpetual(
            oracle.address,
            // imr         mmr            operatorfr       lpfr             rebate      penalty         keeper      insur            oi
            [toWei("0.1"), toWei("0.05"), toWei("0.0001"), toWei("0.0008"), toWei("0"), toWei("0.005"), toWei("2"), toWei("0.0001"), toWei("2")],
            [toWei("0.001"), toWei("0.014285714285714285"), toWei("0.012857142857142857"), toWei("0.005"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1"), toWei("0")],
            [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
            [toWei("1"), toWei("1"), toWei("1"), toWei("1"), toWei("10"), toWei("1"), toWei("1"), toWei("1"), toWei("0")],
        )
        await liquidityPool.runLiquidityPool();
        broker = await createContract("Broker");

        const OrderModule = await createContract("OrderModule");
        testOrder = await createContract("TestOrder", [], { OrderModule });
    });

    it('good path', async () => {
        await ctk.mint(user1.address, toWei("10000"))
        await ctk.mint(user2.address, toWei("10000"))
        await ctk.connect(user1).approve(liquidityPool.address, toWei("10000"))
        await ctk.connect(user2).approve(liquidityPool.address, toWei("10000"))
        await liquidityPool.connect(user1).deposit(0, user1.address, toWei("10000"));
        await liquidityPool.connect(user2).addLiquidity(toWei("10000"));

        const order = {
            trader: user1.address, // trader
            broker: broker.address, // broker
            relayer: user0.address, // relayer
            liquidityPool: liquidityPool.address, // liquidityPool
            referrer: "0x0000000000000000000000000000000000000000", // referrer
            minTradeAmount: toWei("0.1"),
            amount: toWei("-0.5"),
            limitPrice: toWei("0"),
            triggerPrice: toWei("0"),
            chainID: 31337,
            expiredAt: now + 10000,
            perpetualIndex: 0,
            brokerFeeLimit: 20,  // 20 gwei
            flags: 0x00000000,
            salt: 123456,
        };
        var orderHash = await testOrder.orderHash(order);
        const sig = await user1.signMessage(ethers.utils.arrayify(orderHash));
        var { r, s, v } = ethers.utils.splitSignature(sig);
        var compressed = await testOrder.compress(order, r, s, v, 0);
        expect(await testOrder.getSigner(order, sig)).to.equal(user1.address);
        await broker.batchTrade([compressed], [toWei("-0.5")], [toWei("0")]);

        var { position } = await liquidityPool.getMarginAccount(0, user1.address);
        expect(position).to.equal(toWei("-0.5"));
    })

    it('skip broker - good', async () => {
        await ctk.mint(user1.address, toWei("10000"))
        await ctk.mint(user2.address, toWei("10000"))
        await ctk.connect(user1).approve(liquidityPool.address, toWei("10000"))
        await ctk.connect(user2).approve(liquidityPool.address, toWei("10000"))
        await liquidityPool.connect(user1).deposit(0, user1.address, toWei("10000"));
        await liquidityPool.connect(user2).addLiquidity(toWei("10000"));

        const order = {
            trader: user1.address, // trader
            broker: user0.address,
            relayer: user0.address,
            liquidityPool: liquidityPool.address, // liquidityPool
            referrer: "0x0000000000000000000000000000000000000000", // referrer
            minTradeAmount: toWei("0.1"),
            amount: toWei("-0.5"),
            limitPrice: toWei("0"),
            triggerPrice: toWei("0"),
            chainID: 31337,
            expiredAt: now + 10000,
            perpetualIndex: 0,
            brokerFeeLimit: 20,  // 20 gwei
            flags: 0x00000000,
            salt: 123456,
        };
        var orderHash = await testOrder.orderHash(order);
        const sig = await user1.signMessage(ethers.utils.arrayify(orderHash));
        var { r, s, v } = ethers.utils.splitSignature(sig);
        var compressed = await testOrder.compress(order, r, s, v, 0);
        expect(await testOrder.getSigner(order, sig)).to.equal(user1.address);
        await liquidityPool.brokerTrade(compressed, toWei("-0.5"));

        var { position } = await liquidityPool.getMarginAccount(0, user1.address);
        expect(position).to.equal(toWei("-0.5"));
    })

    it('skip broker - invalid broker', async () => {
        await ctk.mint(user1.address, toWei("10000"))
        await ctk.mint(user2.address, toWei("10000"))
        await ctk.connect(user1).approve(liquidityPool.address, toWei("10000"))
        await ctk.connect(user2).approve(liquidityPool.address, toWei("10000"))
        await liquidityPool.connect(user1).deposit(0, user1.address, toWei("10000"));
        await liquidityPool.connect(user2).addLiquidity(toWei("10000"));

        const order = {
            trader: user1.address, // trader
            broker: user2.address,
            relayer: user0.address,
            liquidityPool: liquidityPool.address, // liquidityPool
            referrer: "0x0000000000000000000000000000000000000000", // referrer
            minTradeAmount: toWei("0.1"),
            amount: toWei("-0.5"),
            limitPrice: toWei("0"),
            triggerPrice: toWei("0"),
            chainID: 31337,
            expiredAt: now + 10000,
            perpetualIndex: 0,
            brokerFeeLimit: 20,  // 20 gwei
            flags: 0x00000000,
            salt: 123456,
        };
        var orderHash = await testOrder.orderHash(order);
        const sig = await user1.signMessage(ethers.utils.arrayify(orderHash));
        var { r, s, v } = ethers.utils.splitSignature(sig);
        var compressed = await testOrder.compress(order, r, s, v, 0);
        expect(await testOrder.getSigner(order, sig)).to.equal(user1.address);
        await expect(liquidityPool.brokerTrade(compressed, toWei("-0.5"))).to.be.revertedWith('broker mismatch')
    })

    it('cancel', async () => {
        await ctk.mint(user1.address, toWei("10000"))
        await ctk.mint(user2.address, toWei("10000"))
        await ctk.connect(user1).approve(liquidityPool.address, toWei("10000"))
        await ctk.connect(user2).approve(liquidityPool.address, toWei("10000"))
        await liquidityPool.connect(user1).deposit(0, user1.address, toWei("10000"));
        await liquidityPool.connect(user2).addLiquidity(toWei("10000"));

        const order = {
            trader: user1.address, // trader
            broker: broker.address, // broker
            relayer: user0.address, // relayer
            // broker: user0.address,
            // relayer: user0.address,
            liquidityPool: liquidityPool.address, // liquidityPool
            referrer: "0x0000000000000000000000000000000000000000", // referrer
            minTradeAmount: toWei("0.1"),
            amount: toWei("-0.5"),
            limitPrice: toWei("0"),
            triggerPrice: toWei("0"),
            chainID: 31337,
            expiredAt: now + 10000,
            perpetualIndex: 0,
            brokerFeeLimit: 20,  // 20 gwei
            flags: 0x00000000,
            salt: 123456,
        };
        var orderHash = await testOrder.orderHash(order);
        const sig = await user1.signMessage(ethers.utils.arrayify(orderHash));
        var { r, s, v } = ethers.utils.splitSignature(sig);
        var compressed = await testOrder.compress(order, r, s, v, 0);
        expect(await testOrder.getSigner(order, sig)).to.equal(user1.address);

        expect(await broker.isOrderCanceled(order)).to.be.false;
        await broker.cancelOrder(order);
        expect(await broker.isOrderCanceled(order)).to.be.true;

        await broker.batchTrade([compressed], [toWei("-0.5")], [toWei("0")]);
        var { position } = await liquidityPool.getMarginAccount(0, user1.address);
        expect(position).to.equal(toWei("0"));
    })

    it('cancel by another signer', async () => {
        await ctk.mint(user1.address, toWei("10000"))
        await ctk.mint(user2.address, toWei("10000"))
        await ctk.connect(user1).approve(liquidityPool.address, toWei("10000"))
        await ctk.connect(user2).approve(liquidityPool.address, toWei("10000"))
        await liquidityPool.connect(user1).deposit(0, user1.address, toWei("10000"));
        await liquidityPool.connect(user2).addLiquidity(toWei("10000"));

        const order = {
            trader: user1.address, // trader
            broker: broker.address, // broker
            relayer: user0.address, // relayer
            // broker: user0.address,
            // relayer: user0.address,
            liquidityPool: liquidityPool.address, // liquidityPool
            referrer: "0x0000000000000000000000000000000000000000", // referrer
            minTradeAmount: toWei("0.1"),
            amount: toWei("-0.5"),
            limitPrice: toWei("0"),
            triggerPrice: toWei("0"),
            chainID: 31337,
            expiredAt: now + 10000,
            perpetualIndex: 0,
            brokerFeeLimit: 20,  // 20 gwei
            flags: 0x00000000,
            salt: 123456,
        };
        var orderHash = await testOrder.orderHash(order);
        const sig = await user1.signMessage(ethers.utils.arrayify(orderHash));
        var { r, s, v } = ethers.utils.splitSignature(sig);
        var compressed = await testOrder.compress(order, r, s, v, 0);
        expect(await testOrder.getSigner(order, sig)).to.equal(user1.address);

        await poolCreator.connect(user1).grantPrivilege(user3.address, 4);

        expect(await broker.isOrderCanceled(order)).to.be.false;
        await broker.connect(user3).cancelOrder(order);
        expect(await broker.isOrderCanceled(order)).to.be.true;

        await broker.batchTrade([compressed], [toWei("-0.5")], [toWei("0")]);
        var { position } = await liquidityPool.getMarginAccount(0, user1.address);
        expect(position).to.equal(toWei("0"));
    })

    it('fee', async () => {
        await ctk.mint(user1.address, toWei("10000"))
        await ctk.mint(user2.address, toWei("10000"))
        await ctk.connect(user1).approve(liquidityPool.address, toWei("10000"))
        await ctk.connect(user2).approve(liquidityPool.address, toWei("10000"))
        await liquidityPool.connect(user1).deposit(0, user1.address, toWei("10000"));
        await liquidityPool.connect(user2).addLiquidity(toWei("10000"));

        const order = {
            trader: user1.address, // trader
            broker: broker.address, // broker
            relayer: user0.address, // relayer
            // broker: user0.address,
            // relayer: user0.address,
            liquidityPool: liquidityPool.address, // liquidityPool
            referrer: "0x0000000000000000000000000000000000000000", // referrer
            minTradeAmount: toWei("0.1"),
            amount: toWei("-0.5"),
            limitPrice: toWei("0"),
            triggerPrice: toWei("0"),
            chainID: 31337,
            expiredAt: now + 10000,
            perpetualIndex: 0,
            brokerFeeLimit: 20,  // 20 gwei 000000000
            flags: 0x00000000,
            salt: 123456,
        };
        var orderHash = await testOrder.orderHash(order);
        const sig = await user1.signMessage(ethers.utils.arrayify(orderHash));
        var { r, s, v } = ethers.utils.splitSignature(sig);
        var compressed = await testOrder.compress(order, r, s, v, 0);
        expect(await testOrder.getSigner(order, sig)).to.equal(user1.address);

        await broker.batchTrade([compressed], [toWei("-0.5")], ["20000000000"]);
        var { position } = await liquidityPool.getMarginAccount(0, user1.address);
        expect(position).to.equal(toWei("0"));

        expect(await broker.balanceOf(user1.address)).to.equal(0)
        await broker.connect(user1).deposit({ value: toWei("1") })
        expect(await broker.balanceOf(user1.address)).to.equal(toWei("1"))

        await broker.batchTrade([compressed], [toWei("-0.5")], ["21000000000"]);
        var { position } = await liquidityPool.getMarginAccount(0, user1.address);
        expect(position).to.equal(toWei("0"));

        await broker.batchTrade([compressed], [toWei("-0.5")], ["20000000000"]);
        var { position } = await liquidityPool.getMarginAccount(0, user1.address);
        expect(position).to.equal(toWei("-0.5"));
        expect(await broker.balanceOf(user1.address)).to.equal("999999980000000000")

        await broker.connect(user1).withdraw("999999980000000000");
        expect(await broker.balanceOf(user1.address)).to.equal("0")
    })

    it('invalid broker', async () => {
        await ctk.mint(user1.address, toWei("10000"))
        await ctk.mint(user2.address, toWei("10000"))
        await ctk.connect(user1).approve(liquidityPool.address, toWei("10000"))
        await ctk.connect(user2).approve(liquidityPool.address, toWei("10000"))
        await liquidityPool.connect(user1).deposit(0, user1.address, toWei("10000"));
        await liquidityPool.connect(user2).addLiquidity(toWei("10000"));

        const order = {
            trader: user1.address, // trader
            broker: user2.address, // broker
            relayer: user0.address, // relayer
            liquidityPool: liquidityPool.address, // liquidityPool
            referrer: "0x0000000000000000000000000000000000000000", // referrer
            minTradeAmount: toWei("0.1"),
            amount: toWei("-0.5"),
            limitPrice: toWei("0"),
            triggerPrice: toWei("0"),
            chainID: 31337,
            expiredAt: now + 10000,
            perpetualIndex: 0,
            brokerFeeLimit: 20,  // 20 gwei
            flags: 0x00000000,
            salt: 123456,
        };
        var orderHash = await testOrder.orderHash(order);
        const sig = await user1.signMessage(ethers.utils.arrayify(orderHash));
        var { r, s, v } = ethers.utils.splitSignature(sig);
        var compressed = await testOrder.compress(order, r, s, v, 0);
        expect(await testOrder.getSigner(order, sig)).to.equal(user1.address);
        await broker.batchTrade([compressed], [toWei("-0.5")], [toWei("0")])

        // no trade happened
        var { position } = await liquidityPool.getMarginAccount(0, user1.address);
        expect(position).to.equal(toWei("0"));
    })

    it('invalid relayer', async () => {
        await ctk.mint(user1.address, toWei("10000"))
        await ctk.mint(user2.address, toWei("10000"))
        await ctk.connect(user1).approve(liquidityPool.address, toWei("10000"))
        await ctk.connect(user2).approve(liquidityPool.address, toWei("10000"))
        await liquidityPool.connect(user1).deposit(0, user1.address, toWei("10000"));
        await liquidityPool.connect(user2).addLiquidity(toWei("10000"));

        const order = {
            trader: user1.address, // trader
            broker: broker.address, // broker
            relayer: user2.address, // relayer
            liquidityPool: liquidityPool.address, // liquidityPool
            referrer: "0x0000000000000000000000000000000000000000", // referrer
            minTradeAmount: toWei("0.1"),
            amount: toWei("-0.5"),
            limitPrice: toWei("0"),
            triggerPrice: toWei("0"),
            chainID: 31337,
            expiredAt: now + 10000,
            perpetualIndex: 0,
            brokerFeeLimit: 20,  // 20 gwei
            flags: 0x00000000,
            salt: 123456,
        };
        var orderHash = await testOrder.orderHash(order);
        const sig = await user1.signMessage(ethers.utils.arrayify(orderHash));
        var { r, s, v } = ethers.utils.splitSignature(sig);
        var compressed = await testOrder.compress(order, r, s, v, 0);
        expect(await testOrder.getSigner(order, sig)).to.equal(user1.address);
        broker.batchTrade([compressed], [toWei("-0.5")], [toWei("0")])

        // no trade happened
        var { position } = await liquidityPool.getMarginAccount(0, user1.address);
        expect(position).to.equal(toWei("0"));
    })
})