import { expect } from "chai";
const { ethers } = require("hardhat");
import {
    toWei,
    fromWei,
    fromBytes32,
    toBytes32,
    getAccounts,
    createContract,
} from '../scripts/utils';
import { Broker } from "../typechain/Broker";

import "./helper";

describe('TradeModule2', () => {
    let accounts;

    before(async () => {
        accounts = await getAccounts();
    })

    describe('basic', async () => {
        let user0;
        let user1;
        let user2;
        let user3;
        let user4;
        let user5;
        let none = "0x0000000000000000000000000000000000000000";

        let testTrade;
        let testOrder;
        let testRelay;
        let ctk;
        let oracle;

        beforeEach(async () => {
            user0 = accounts[0];
            user1 = accounts[1];
            user2 = accounts[2];
            user3 = accounts[3];
            user4 = accounts[4];
            user5 = accounts[5];


            testRelay = await createContract("Broker");
            ctk = await createContract("CustomERC20", ["collateral", "CTK", 18]);
            oracle = await createContract("OracleAdaptor", ["ctk", "ctk"]);
            let now = Math.floor(Date.now() / 1000);
            await oracle.setMarkPrice(toWei("6965"), now);
            await oracle.setIndexPrice(toWei("7000"), now);
            const AMMModule = await createContract("AMMModule");
            const CollateralModule = await createContract("CollateralModule")
            const OrderModule = await createContract("OrderModule");
            const PerpetualModule = await createContract("PerpetualModule");
            const LiquidityPoolModule = await createContract("LiquidityPoolModule", [], { CollateralModule, AMMModule, PerpetualModule });
            const LiquidityPoolModule2 = await createContract("LiquidityPoolModule2", [], { CollateralModule, PerpetualModule, LiquidityPoolModule });
            const TradeModule = await createContract("TradeModule", [], { AMMModule, LiquidityPoolModule, LiquidityPoolModule2 });
            testOrder = await createContract("TestOrder", [], { OrderModule });
            testTrade = await createContract("TestTrade", [], {
                CollateralModule,
                PerpetualModule,
                LiquidityPoolModule,
                LiquidityPoolModule2,
                OrderModule,
                TradeModule,
            });
            await testTrade.createPerpetual(
                oracle.address,
                // imr         mmr            operatorfr       lpfr             rebate      penalty         keeper      insur            oi
                [toWei("0.1"), toWei("0.05"), toWei("0.0001"), toWei("0.0008"), toWei("0"), toWei("0.005"), toWei("2"), toWei("0.0001"), toWei("1")],
                [toWei("0.001"), toWei("0.014285714285714285"), toWei("0.012857142857142857"), toWei("0.005"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1"), toWei("0")],
            )
            await testTrade.setOperator(user0.address)
            await testTrade.setVault(user4.address, toWei("0.0001"))
            await testTrade.setCollateralToken(ctk.address, 18);
            await ctk.mint(testTrade.address, toWei("10000000000"));
        })


        it('broker', async () => {

            await testTrade.setState(0, 2);
            await testTrade.setTotalCollateral(0, toWei("10000000000"));
            await testTrade.setUnitAccumulativeFunding(0, toWei("9.9059375"))

            let now = Math.floor(Date.now() / 1000);
            await oracle.setMarkPrice(toWei("6965"), now);
            await oracle.setIndexPrice(toWei("7000"), now);
            await testTrade.updatePrice(0);

            await testTrade.setMarginAccount(0, user1.address, toWei('7698.86'), toWei('2.3'));
            await testTrade.setMarginAccount(0, testTrade.address, toWei('83941.29865625'), toWei('2.3'));
            let blockNumber = await ethers.provider.getBlockNumber()
            let block = await ethers.provider.getBlock(blockNumber)
            const order = {
                trader: user1.address, // trader
                broker: testRelay.address, // broker
                relayer: user0.address, // relayer
                // broker: user0.address,
                // relayer: user0.address,
                liquidityPool: testTrade.address, // liquidityPool
                referrer: "0x0000000000000000000000000000000000000000", // referrer
                minTradeAmount: toWei("0.1"),
                amount: toWei("-0.5"),
                limitPrice: toWei("0"),
                triggerPrice: toWei("0"),
                chainID: 31337,
                expiredAt: block["timestamp"] + 10000,
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
            await testRelay.batchTrade([compressed], [toWei("-0.5")], [toWei("0")]);
            // await testTrade.brokerTrade(compressed, toWei("-0.5"));

            var { cash } = await testTrade.callStatic.getMarginAccount(0, user1.address);
            expect(cash).approximateBigNumber(toWei("11178.8766232"));
        })

        it('broker - 2', async () => {
            await testTrade.setState(0, 2);
            await testTrade.setTotalCollateral(0, toWei("10000000000"));
            await testTrade.setUnitAccumulativeFunding(0, toWei("9.9059375"))

            let now = Math.floor(Date.now() / 1000);
            await oracle.setMarkPrice(toWei("6965"), now);
            await oracle.setIndexPrice(toWei("7000"), now);
            await testTrade.updatePrice(0);

            await testTrade.setMarginAccount(0, user1.address, toWei('7698.86'), toWei('2.3'));
            await testTrade.setMarginAccount(0, testTrade.address, toWei('83941.29865625'), toWei('2.3'));

            var compressed = "0x276eb779d7ca51a5f7fba02bf83d9739da11e3baf39fd6e51aad88f6f4ce6ab8827279cfffb92266f39fd6e51aad88f6f4ce6ab8827279cfffb92266000000000000000000000000000000000000000039b5b39de93e60081dcdc94a8b4180a8063959cc0000000000000000000000000000000000000000000000000de0b6b3a7640000fffffffffffffffffffffffffffffffffffffffffffffffff21f494c589c0000000000000000000000000000000000000000000000000031d1afdeede7fc000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000539000000006006d7c200000000000186a000000000000000011b00f1d8654ec02fb8136a1c19c3d2c1cfc4d9d1861c832e8be053c7398e4e83ad8e46b420bfaf95ab5453c6280c5550ccf47cd503968ed8a932405ee29cedba5e6b";
            await testRelay.batchTrade([compressed], [toWei("-0.5")], [toWei("0")]);
            // await testTrade.brokerTrade(compressed, toWei("-0.5"));

            var { cash, position } = await testTrade.callStatic.getMarginAccount(0, user1.address);
            console.log(fromWei(cash), fromWei(position))

            console.log(user0.address);
            console.log(user1.address);
        })

        it('test', async () => {
            const provider = new ethers.providers.JsonRpcProvider("https://kovan2.arbitrum.io/rpc");
            const signer = new ethers.Wallet("0x0f6c64cd13b5d8e4917231fd9da19589ff604f98e0651f9a551dbede20806155", provider)

            var orderHash = "0xc0e683add1cccb722c3e5973ee1e3ed60af5148ff9b0013a2c00f6ae5a90d68b";
            const sig = await signer.signMessage(ethers.utils.arrayify(orderHash));
            var { r, s, v } = ethers.utils.splitSignature(sig);

            console.log(r)
            console.log(s)
            console.log(v)

            const order = {
                trader: "0x276eb779d7ca51a5f7fba02bf83d9739da11e3ba", // trader
                broker: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // broker
                relayer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // relayer
                referrer: "0x0000000000000000000000000000000000000000", // referrer
                liquidityPool: "0x39b5B39dE93e60081dCDC94a8b4180A8063959cc", // liquidityPool
                minTradeAmount: toWei("1"),
                amount: toWei("1"),
                limitPrice: toWei("919"),
                triggerPrice: toWei("0"),
                chainID: 1337,
                expiredAt: 1611057160,
                perpetualIndex: 0,
                brokerFeeLimit: 100000,  // 20 gwei
                flags: 0x00000000,
                salt: 1,
            };
            var orderHash2 = await testOrder.orderHash(order);
            console.log("orderHash", orderHash2);
        })
    })
})