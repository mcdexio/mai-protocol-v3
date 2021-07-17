const { ethers } = require("hardhat");
const { expect } = require("chai");
import { BigNumber as BN } from "ethers";
import { toWei, fromWei, createFactory, createContract, createLiquidityPoolFactory, deployPoolCreator } from "../scripts/utils";

type Pair = Array<string>;

class GasStat {
  collection: Array<Pair> = [];

  format(x) {
    return x
      .split("")
      .reverse()
      .map(function (a, i) {
        return a + ((i || 1) % 3 || a == "-" ? "" : ",");
      })
      .reverse()
      .join("");
  }

  async collect(name, f) {
    const tx = await f;
    const receipt = await tx.wait();
    this.collection.push([name.padEnd(24), this.format(receipt.gasUsed.toString()).padStart(10)]);
  }

  summary() {
    console.table(this.collection);
  }
}

describe("integration - 4 perps, 1 trader. open + close", () => {

  function toString(n) {
    if (n instanceof BN) {
      return fromWei(n.toString());
    } else if (n instanceof Array) {
      return n.map(toString);
    }
    return n;
  }

  function print(obj) {
    return;
    var props = [];
    for (var n in obj) {
      props.push([n, toString(obj[n])]);
    }
    console.table(props);
  }

  it("main", async () => {
    var gs = new GasStat();
    // users
    const accounts = await ethers.getSigners();
    const user0 = accounts[0];
    const user1 = accounts[1];
    const user2 = accounts[2];
    const user3 = accounts[3];
    const vault = accounts[9];
    const none = "0x0000000000000000000000000000000000000000";
    const LiquidityPoolFactory = await createLiquidityPoolFactory();

    // create components
    var symbol = await createContract("SymbolService");
    await symbol.initialize(10000);
    var ctk = await createContract("CustomERC20", ["collateral", "CTK", 18]);
    var perp0Template = await LiquidityPoolFactory[0].deploy();
    var perp1Template = await LiquidityPoolFactory[1].deploy();
    var govTemplate = await createContract("TestLpGovernor");
    var poolCreator = await deployPoolCreator(symbol, vault, toWei("0.001"));
    await poolCreator.addVersion([perp0Template.address, perp1Template.address], govTemplate.address, 0, "initial version");
    await symbol.addWhitelistedFactory(poolCreator.address);

    const { liquidityPool, governor } = await poolCreator.callStatic.createLiquidityPool(
      ctk.address,
      18,
      998,
      ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1])
    );
    await poolCreator.createLiquidityPool(ctk.address, 18, 998, ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1]));
    const perp = await ethers.getContractAt("LiquidityPoolAllHops", liquidityPool);

    // oracle
    let oracle1 = await createContract("OracleAdaptor", ["USD", "ETH"]);
    let oracle2 = await createContract("OracleAdaptor", ["USD", "ETH"]);
    let oracle3 = await createContract("OracleAdaptor", ["USD", "ETH"]);
    let oracle4 = await createContract("OracleAdaptor", ["USD", "ETH"]);
    let updatePrice = async (price1, price2, price3, price4) => {
      let now = Math.floor(Date.now() / 1000);
      await oracle1.setMarkPrice(price1, now);
      await oracle1.setIndexPrice(price1, now);
      await oracle2.setMarkPrice(price2, now);
      await oracle2.setIndexPrice(price2, now);
      await oracle3.setMarkPrice(price3, now);
      await oracle3.setIndexPrice(price3, now);
      await oracle4.setMarkPrice(price4, now);
      await oracle4.setIndexPrice(price4, now);
    };
    await updatePrice(toWei("500"), toWei("500"), toWei("500"), toWei("500"));

    await perp.createPerpetual(
      oracle1.address,
      // imr          mmr           operatorfr      lpfr            rebate        penalty        keeper               insur         oi
      [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("5")],
      // alpha         beta1        beta2          frLimit       lev         maxClose       frFactor
      [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1")],
      [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
      [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1")]
    );

    await perp.createPerpetual(
      oracle2.address,
      [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("5")],
      [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1")],
      [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
      [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1")]
    );
    await perp.createPerpetual(
      oracle3.address,
      [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("5")],
      [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1")],
      [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
      [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1")]
    );
    await perp.createPerpetual(
      oracle4.address,
      [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("5")],
      [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1")],
      [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
      [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1")]
    );

    await perp.runLiquidityPool();

    // overview
    const info = await perp.getLiquidityPoolInfo();
    const stk = await (await createFactory("TestLpGovernor")).attach(info[2][4]);

    print(info);
    print(await perp.callStatic.getPerpetualInfo(0));

    // get initial coins
    await ctk.mint(user1.address, toWei("10000"));
    await ctk.mint(user2.address, toWei("10000"));
    await ctk.connect(user1).approve(perp.address, toWei("100000"));
    await ctk.connect(user2).approve(perp.address, toWei("100000"));

    await perp.forceToSyncState();

    // deposit
    await gs.collect("deposit", perp.connect(user1).deposit(0, user1.address, toWei("100")));
    print(await perp.connect(user1).callStatic.getMarginAccount(0, user1.address));

    // lp
    await updatePrice(toWei("501"), toWei("601"), toWei("701"), toWei("801"));
    await gs.collect("addLiquidity", perp.connect(user2).addLiquidity(toWei("1000")));
    // console.log("share:", fromWei(await stk.balanceOf(user2.address)));
    // console.log("ctk  :", fromWei(await ctk.balanceOf(user2.address)));

    // print(await perp.callStatic.getLiquidityPoolInfo());

    let now = Math.floor(Date.now() / 1000);

    // trade 1
    await updatePrice(toWei("502"), toWei("603"), toWei("704"), toWei("805"));
    await gs.collect("trade 1 - open", perp.connect(user1).trade(0, user1.address, toWei("0.1"), toWei("1000"), now + 999999, none, 0));
    print(await perp.connect(user1).callStatic.getMarginAccount(0, user1.address));

    // trade 2
    await updatePrice(toWei("503"), toWei("604"), toWei("705"), toWei("806"));
    await gs.collect("trade 2 - open", perp.connect(user1).trade(0, user1.address, toWei("0.05"), toWei("1000"), now + 999999, none, 0));
    print(await perp.connect(user1).callStatic.getMarginAccount(0, user1.address));

    // trade 3
    await updatePrice(toWei("504"), toWei("605"), toWei("706"), toWei("807"));
    await gs.collect("trade 3 - revert", perp.connect(user1).trade(0, user1.address, toWei("-0.2"), toWei("0"), now + 999999, none, 0));
    print(await perp.connect(user1).callStatic.getMarginAccount(0, user1.address));

    // trade 4
    await updatePrice(toWei("505"), toWei("606"), toWei("707"), toWei("808"));
    await gs.collect("trade 4 - close all", perp.connect(user1).trade(0, user1.address, toWei("0.05"), toWei("1000"), now + 999999, none, 0));
    print(await perp.connect(user1).callStatic.getMarginAccount(0, user1.address));

    // broker
    var broker = await createContract("Broker");
    await broker.connect(user1).deposit({ value: toWei("0.2") });
    console.log((await broker.balanceOf(user1.address)).toString());

    // const order = {
    //     trader: user1.address, // trader
    //     broker: broker.address, // broker
    //     relayer: user1.address, // relayer
    //     liquidityPool: perp.address, // liquidityPool
    //     minTradeAmount: 0,
    //     referrer: "0x0000000000000000000000000000000000000000", // referrer
    //     amount: toWei("0.1"),
    //     limitPrice: toWei("1000"),
    //     triggerPrice: 0,
    //     chainID: 31337,
    //     expiredAt: 2616217568,
    //     perpetualIndex: 0,
    //     brokerFeeLimit: 1000000000,
    //     flags: 0x00000000,
    //     salt: 667,
    // };
    // const OrderModule = await createContract("OrderModule");
    // const testOrder = await createContract("TestOrder", [], { OrderModule });
    // const orderHash = await testOrder.orderHash(order);
    // const signature = await user1.signMessage(ethers.utils.arrayify(orderHash));
    // await gs.collect("trade 5 - batchTrade", broker.batchTrade([order], [toWei("0.1")], [signature], [toWei("0.01")]));
    // await gs.collect("trade 5 - batchTrade", perp.brokerTrade(order, toWei("0.1"), signature));
    // print(await perp.callStatic.getMarginAccount(0, user1.address));

    // // trade 4
    // await updatePrice(toWei("505"), toWei("606"), toWei("707"), toWei("808"))
    // await gs.collect("trade 6 - close all", perp.trade(0, user1.address, toWei("-0.1"), toWei("0"), now + 999999, none, false));
    // print(await perp.callStatic.getMarginAccount(0, user1.address));

    // withdraw
    await updatePrice(toWei("506"), toWei("607"), toWei("708"), toWei("809"));
    await gs.collect("withdraw", perp.connect(user1).withdraw(0, user1.address, toWei("10")));
    // console.log(fromWei(await ctk.connect(user1).balanceOf(user1.address)));

    var { cash, position } = await perp.connect(user2).callStatic.getMarginAccount(0, perp.address);
    // console.log(fromWei(cash), fromWei(position));

    // remove lp
    await updatePrice(toWei("507"), toWei("608"), toWei("709"), toWei("800"));
    await gs.collect("removeLiquidity", perp.connect(user2).removeLiquidity(await stk.balanceOf(user2.address), 0));
    console.log("share:", fromWei(await stk.balanceOf(user2.address)));
    console.log("ctk  :", fromWei(await ctk.connect(user2).balanceOf(user2.address)));

    gs.summary();
  });

  it("main - 6 decimals", async () => {
    var gs = new GasStat();
    // users
    const accounts = await ethers.getSigners();
    const user0 = accounts[0];
    const user1 = accounts[1];
    const user2 = accounts[2];
    const user3 = accounts[3];
    const vault = accounts[9];
    const none = "0x0000000000000000000000000000000000000000";
    const LiquidityPoolFactory = await createLiquidityPoolFactory();

    // create components
    var symbol = await createContract("SymbolService");
    await symbol.initialize(10000);
    var ctk = await createContract("CustomERC20", ["collateral", "CTK", 6]);
    var perp0Template = await LiquidityPoolFactory[0].deploy();
    var perp1Template = await LiquidityPoolFactory[1].deploy();
    var govTemplate = await createContract("TestLpGovernor");
    var poolCreator = await deployPoolCreator(symbol, vault, toWei("0.001"));
    await poolCreator.addVersion([perp0Template.address, perp1Template.address], govTemplate.address, 0, "initial version");
    await symbol.addWhitelistedFactory(poolCreator.address);

    const { liquidityPool, governor } = await poolCreator.callStatic.createLiquidityPool(
      ctk.address,
      6,
      998,
      ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1])
    );
    await poolCreator.createLiquidityPool(ctk.address, 6, 998, ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1]));
    const perp = await ethers.getContractAt("LiquidityPoolAllHops", liquidityPool);

    // oracle
    let oracle1 = await createContract("OracleAdaptor", ["USD", "ETH"]);
    let oracle2 = await createContract("OracleAdaptor", ["USD", "ETH"]);
    let oracle3 = await createContract("OracleAdaptor", ["USD", "ETH"]);
    let oracle4 = await createContract("OracleAdaptor", ["USD", "ETH"]);
    let updatePrice = async (price1, price2, price3, price4) => {
      let now = Math.floor(Date.now() / 1000);
      await oracle1.setMarkPrice(price1, now);
      await oracle1.setIndexPrice(price1, now);
      await oracle2.setMarkPrice(price2, now);
      await oracle2.setIndexPrice(price2, now);
      await oracle3.setMarkPrice(price3, now);
      await oracle3.setIndexPrice(price3, now);
      await oracle4.setMarkPrice(price4, now);
      await oracle4.setIndexPrice(price4, now);
    };
    await updatePrice(toWei("500"), toWei("500"), toWei("500"), toWei("500"));

    await perp.createPerpetual(
      oracle1.address,
      [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("5")],
      [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1")],
      [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
      [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1")]
    );

    await perp.createPerpetual(
      oracle2.address,
      [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("5")],
      [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1")],
      [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
      [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1")]
    );
    await perp.createPerpetual(
      oracle3.address,
      [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("5")],
      [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1")],
      [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
      [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1")]
    );
    await perp.createPerpetual(
      oracle4.address,
      [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("5")],
      [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1")],
      [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
      [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1")]
    );

    await perp.runLiquidityPool();

    // overview
    const info = await perp.getLiquidityPoolInfo();
    const stk = await (await createFactory("LpGovernor")).attach(info[2][4]);

    print(info);
    print(await perp.callStatic.getPerpetualInfo(0));

    // get initial coins
    await ctk.mint(user1.address, toWei("10000"));
    await ctk.mint(user2.address, toWei("10000"));
    await ctk.connect(user1).approve(perp.address, toWei("100000"));
    await ctk.connect(user2).approve(perp.address, toWei("100000"));

    // deposit
    await gs.collect("deposit", perp.connect(user1).deposit(0, user1.address, toWei("100")));
    print(await perp.connect(user1).callStatic.getMarginAccount(0, user1.address));

    // lp
    await updatePrice(toWei("501"), toWei("601"), toWei("701"), toWei("801"));
    await gs.collect("addLiquidity", perp.connect(user2).addLiquidity(toWei("1000")));
    console.log("share:", fromWei(await stk.balanceOf(user2.address)));
    console.log("ctk  :", fromWei(await ctk.balanceOf(user2.address)));

    print(await perp.callStatic.getLiquidityPoolInfo());

    let now = Math.floor(Date.now() / 1000);
    // trade 1
    await updatePrice(toWei("502"), toWei("603"), toWei("704"), toWei("805"));
    await gs.collect("trade 1 - open", perp.connect(user1).trade(0, user1.address, toWei("0.1"), toWei("1000"), now + 999999, none, 0));
    print(await perp.connect(user1).callStatic.getMarginAccount(0, user1.address));

    // trade 2
    await updatePrice(toWei("503"), toWei("604"), toWei("705"), toWei("806"));
    await gs.collect("trade 2 - open", perp.connect(user1).trade(0, user1.address, toWei("0.05"), toWei("1000"), now + 999999, none, 0));
    print(await perp.connect(user1).callStatic.getMarginAccount(0, user1.address));

    // trade 3
    await updatePrice(toWei("504"), toWei("605"), toWei("706"), toWei("807"));
    await gs.collect("trade 3 - revert", perp.connect(user1).trade(0, user1.address, toWei("-0.2"), toWei("0"), now + 999999, none, 0));
    print(await perp.connect(user1).callStatic.getMarginAccount(0, user1.address));

    // trade 4
    await updatePrice(toWei("505"), toWei("606"), toWei("707"), toWei("808"));
    await gs.collect("trade 4 - close all", perp.connect(user1).trade(0, user1.address, toWei("0.05"), toWei("1000"), now + 999999, none, 0));
    print(await perp.connect(user1).callStatic.getMarginAccount(0, user1.address));
  });

  it("main", async () => {
    var gs = new GasStat();
    // users
    const accounts = await ethers.getSigners();
    const user0 = accounts[0];
    const user1 = accounts[1];
    const user2 = accounts[2];
    const user3 = accounts[3];
    const vault = accounts[9];
    const none = "0x0000000000000000000000000000000000000000";
    const vaultFeeRate = toWei("0.001");
    const LiquidityPoolFactory = await createLiquidityPoolFactory();

    // create components
    var symbol = await createContract("SymbolService");
    await symbol.initialize(10000);
    var ctk = await createContract("CustomERC20", ["collateral", "CTK", 18]);
    var perp0Template = await LiquidityPoolFactory[0].deploy();
    var perp1Template = await LiquidityPoolFactory[1].deploy();
    var govTemplate = await createContract("TestLpGovernor");
    var poolCreator = await deployPoolCreator(symbol, vault, toWei("0.001"));
    await poolCreator.addVersion([perp0Template.address, perp1Template.address], govTemplate.address, 0, "initial version");
    await symbol.addWhitelistedFactory(poolCreator.address);

    const { liquidityPool, governor } = await poolCreator.callStatic.createLiquidityPool(
      ctk.address,
      18,
      998,
      ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1])
    );
    await poolCreator.createLiquidityPool(ctk.address, 18, 998, ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1]));
    const perp = await ethers.getContractAt("LiquidityPoolAllHops", liquidityPool);

    // oracle
    let oracle1 = await createContract("OracleAdaptor", ["USD", "ETH"]);
    let oracle2 = await createContract("OracleAdaptor", ["USD", "ETH"]);
    let oracle3 = await createContract("OracleAdaptor", ["USD", "ETH"]);
    let oracle4 = await createContract("OracleAdaptor", ["USD", "ETH"]);
    let updatePrice = async (price1, price2, price3, price4) => {
      let now = Math.floor(Date.now() / 1000);
      await oracle1.setMarkPrice(price1, now);
      await oracle1.setIndexPrice(price1, now);
      await oracle2.setMarkPrice(price2, now);
      await oracle2.setIndexPrice(price2, now);
      await oracle3.setMarkPrice(price3, now);
      await oracle3.setIndexPrice(price3, now);
      await oracle4.setMarkPrice(price4, now);
      await oracle4.setIndexPrice(price4, now);
    };
    await updatePrice(toWei("500"), toWei("500"), toWei("500"), toWei("500"));

    await perp.createPerpetual(
      oracle1.address,
      [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("5")],
      [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1")],
      [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
      [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1")]
    );

    await perp.createPerpetual(
      oracle2.address,
      [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("5")],
      [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1")],
      [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
      [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1")]
    );
    await perp.createPerpetual(
      oracle3.address,
      [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("5")],
      [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1")],
      [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
      [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1")]
    );
    await perp.createPerpetual(
      oracle4.address,
      [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("5")],
      [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1")],
      [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
      [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1")]
    );

    await perp.runLiquidityPool();

    // overview
    const info = await perp.getLiquidityPoolInfo();
    const stk = await (await createFactory("LpGovernor")).attach(info[2][4]);

    print(info);
    print(await perp.callStatic.getPerpetualInfo(0));

    // get initial coins
    await ctk.mint(user1.address, toWei("10000"));
    await ctk.mint(user2.address, toWei("10000"));
    await ctk.mint(user3.address, toWei("100"));
    await ctk.connect(user1).approve(perp.address, toWei("100000"));
    await ctk.connect(user2).approve(perp.address, toWei("100000"));
    await ctk.connect(user3).approve(perp.address, toWei("100000"));
    await ctk.mint(user3.address, toWei("100"));

    // lp - user2
    await updatePrice(toWei("500"), toWei("500"), toWei("500"), toWei("500"));
    await perp.connect(user2).addLiquidity(toWei("1000"));

    // deposit - user1 user3
    await perp.connect(user1).deposit(0, user1.address, toWei("100"));
    await perp.connect(user3).deposit(0, user3.address, toWei("100"));

    let now = Math.floor(Date.now() / 1000);
    // trade 1
    await perp.connect(user1).trade(0, user1.address, toWei("0.1"), toWei("1000"), now + 999999, none, 0);
    // trade 4
    await perp.connect(user1).trade(0, user1.address, toWei("-0.1"), toWei("0"), now + 999999, none, 0);

    // withdraw
    var { cash } = await perp.getMarginAccount(0, user1.address);
    await perp.connect(user1).withdraw(0, user1.address, cash);
    await perp.connect(user3).withdraw(0, user3.address, toWei("100"));
    await perp.connect(user2).removeLiquidity(toWei("1000"), 0);

    console.log(fromWei(await ctk.balanceOf(perp.address)));
  });

  it("liquidate", async () => {
    // users
    const accounts = await ethers.getSigners();
    const user0 = accounts[0];
    const user1 = accounts[1];
    const user2 = accounts[2];
    const user3 = accounts[3];
    const vault = accounts[9];
    const none = "0x0000000000000000000000000000000000000000";
    const LiquidityPoolFactory = await createLiquidityPoolFactory();

    // create components
    var symbol = await createContract("SymbolService");
    await symbol.initialize(10000);
    var ctk = await createContract("CustomERC20", ["collateral", "CTK", 18]);
    var perp0Template = await LiquidityPoolFactory[0].deploy();
    var perp1Template = await LiquidityPoolFactory[1].deploy();
    var govTemplate = await createContract("TestLpGovernor");
    var poolCreator = await deployPoolCreator(symbol, vault, toWei("0.001"));
    await poolCreator.addVersion([perp0Template.address, perp1Template.address], govTemplate.address, 0, "initial version");
    await symbol.addWhitelistedFactory(poolCreator.address);

    const { liquidityPool, governor } = await poolCreator.callStatic.createLiquidityPool(
      ctk.address,
      18,
      998,
      ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1])
    );
    await poolCreator.createLiquidityPool(ctk.address, 18, 998, ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1]));
    const perp = await ethers.getContractAt("LiquidityPoolAllHops", liquidityPool);

    // oracle
    let oracle = await createContract("OracleAdaptor", ["USD", "ETH"]);
    let updatePrice = async (price) => {
      let now = Math.floor(Date.now() / 1000);
      await oracle.setMarkPrice(price, now);
      await oracle.setIndexPrice(price, now);
    };
    await updatePrice(toWei("500"));

    await perp.createPerpetual(
      oracle.address,
      [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0"), toWei("0.5"), toWei("5")],
      [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("0")],
      [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
      [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1")]
    );

    await perp.runLiquidityPool();
    await poolCreator.addKeeper(user3.address);

    // overview
    const info = await perp.getLiquidityPoolInfo();
    const stk = await (await createFactory("LpGovernor")).attach(info[2][4]);

    // get initial coins
    await ctk.mint(user1.address, toWei("10000"));
    await ctk.mint(user2.address, toWei("10000"));
    await ctk.connect(user1).approve(perp.address, toWei("100000"));
    await ctk.connect(user2).approve(perp.address, toWei("100000"));

    // deposit
    await perp.connect(user1).deposit(0, user1.address, toWei("500"));

    // lp
    await perp.connect(user2).addLiquidity(toWei("1000"));
    // console.log("share:", fromWei(await stk.balanceOf(user2.address)));
    // console.log("ctk  :", fromWei(await ctk.balanceOf(user2.address)));

    // trade
    let now = Math.floor(Date.now() / 1000);
    await perp.connect(user1).trade(0, user1.address, toWei("3"), toWei("1000"), now + 999999, none, 0);

    // var { cash, position, margin, isMaintenanceMarginSafe } = await perp.getMarginAccount(0, user1.address);
    // console.log("cash:", fromWei(cash), "position:", fromWei(position), "margin:", fromWei(margin), "isSafe:", isMaintenanceMarginSafe);
    await updatePrice(toWei("100"));
    await perp.connect(user1).forceToSyncState();

    // var { cash, position, margin, isMaintenanceMarginSafe, _ } = await perp.getMarginAccount(0, user1.address);
    // console.log("cash:", fromWei(cash), "position:", fromWei(position), "margin:", fromWei(margin), "isSafe:", isMaintenanceMarginSafe);
    // var { deltaCash } = await perp.queryTradeWithAMM(0, toWei("0").sub(position))
    // console.log(deltaCash.add(margin))

    await perp.connect(user2).donateInsuranceFund(toWei("1000"));

    await perp.connect(user3).liquidateByAMM(0, user1.address);
    var { cash, position, margin, isMaintenanceMarginSafe, _ } = await perp.getMarginAccount(0, user1.address);
    expect(cash).to.equal(0);
    expect(position).to.equal(0);
    console.log("cash:", fromWei(cash), "position:", fromWei(position), "margin:", fromWei(margin), "isSafe:", isMaintenanceMarginSafe);
  });

  it("liquidate -> setEmergency", async () => {
    // users
    const accounts = await ethers.getSigners();
    const user0 = accounts[0];
    const user1 = accounts[1];
    const user2 = accounts[2];
    const user3 = accounts[3];
    const vault = accounts[9];
    const none = "0x0000000000000000000000000000000000000000";
    const LiquidityPoolFactory = await createLiquidityPoolFactory();

    // create components
    var symbol = await createContract("SymbolService");
    await symbol.initialize(10000);
    var ctk = await createContract("CustomERC20", ["collateral", "CTK", 18]);
    var perp0Template = await LiquidityPoolFactory[0].deploy();
    var perp1Template = await LiquidityPoolFactory[1].deploy();
    var govTemplate = await createContract("TestLpGovernor");
    var poolCreator = await createContract("PoolCreator");
    await poolCreator.initialize(symbol.address, vault.address, toWei("0.001"));
    await poolCreator.addVersion([perp0Template.address, perp1Template.address], govTemplate.address, 0, "initial version");
    await symbol.addWhitelistedFactory(poolCreator.address);

    const { liquidityPool, governor } = await poolCreator.callStatic.createLiquidityPool(
      ctk.address,
      18,
      998,
      ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1])
    );
    await poolCreator.createLiquidityPool(ctk.address, 18, 998, ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1]));
    const perp = await ethers.getContractAt("LiquidityPoolAllHops", liquidityPool);

    // oracle
    let oracle = await createContract("OracleAdaptor", ["USD", "ETH"]);
    let updatePrice = async (price) => {
      let now = Math.floor(Date.now() / 1000);
      await oracle.setMarkPrice(price, now);
      await oracle.setIndexPrice(price, now);
    };
    await updatePrice(toWei("500"));

    await perp.createPerpetual(
      oracle.address,
      [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0"), toWei("0.5"), toWei("5")],
      [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("0")],
      [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
      [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1")]
    );

    await perp.runLiquidityPool();
    await poolCreator.addKeeper(user3.address);

    // overview
    var info = await perp.getLiquidityPoolInfo();
    const stk = await (await createFactory("LpGovernor")).attach(info[2][4]);

    // get initial coins
    await ctk.mint(user1.address, toWei("10000"));
    await ctk.mint(user2.address, toWei("10000"));
    await ctk.connect(user1).approve(perp.address, toWei("100000"));
    await ctk.connect(user2).approve(perp.address, toWei("100000"));

    // deposit
    await perp.connect(user1).deposit(0, user1.address, toWei("500"));

    // lp
    await perp.connect(user2).addLiquidity(toWei("1000"));
    // console.log("share:", fromWei(await stk.balanceOf(user2.address)));
    // console.log("ctk  :", fromWei(await ctk.balanceOf(user2.address)));

    // trade
    let now = Math.floor(Date.now() / 1000);
    await perp.connect(user1).trade(0, user1.address, toWei("3"), toWei("1000"), now + 999999, none, 0);

    // var { cash, position, margin, isMaintenanceMarginSafe } = await perp.getMarginAccount(0, user1.address);
    // console.log("cash:", fromWei(cash), "position:", fromWei(position), "margin:", fromWei(margin), "isSafe:", isMaintenanceMarginSafe);
    await updatePrice(toWei("100"));
    await perp.connect(user1).forceToSyncState();

    // var { cash, position, margin, isMaintenanceMarginSafe, _ } = await perp.getMarginAccount(0, user1.address);
    // console.log("cash:", fromWei(cash), "position:", fromWei(position), "margin:", fromWei(margin), "isSafe:", isMaintenanceMarginSafe);
    // var { deltaCash } = await perp.queryTradeWithAMM(0, toWei("0").sub(position))
    // console.log(deltaCash.add(margin))

    await perp.connect(user3).liquidateByAMM(0, user1.address);
    var { cash, position, margin, isMaintenanceMarginSafe, _ } = await perp.getMarginAccount(0, user1.address);
    info = await perp.getPerpetualInfo(0);
    expect(position).to.equal(0);
    // perpetual state = emergency
    expect(info[0]).to.equal(3)
    console.log("cash:", fromWei(cash), "position:", fromWei(position), "margin:", fromWei(margin), "isSafe:", isMaintenanceMarginSafe);
  });

  it("access control", async () => {
    // users
    const accounts = await ethers.getSigners();
    const user0 = accounts[0];
    const user1 = accounts[1];
    const user2 = accounts[2];
    const user3 = accounts[3];
    const user4 = accounts[4];
    const vault = accounts[9];
    const none = "0x0000000000000000000000000000000000000000";
    const LiquidityPoolFactory = await createLiquidityPoolFactory();

    // create components
    var symbol = await createContract("SymbolService");
    await symbol.initialize(10000);
    var ctk = await createContract("CustomERC20", ["collateral", "CTK", 18]);
    var perp0Template = await LiquidityPoolFactory[0].deploy();
    var perp1Template = await LiquidityPoolFactory[1].deploy();
    var govTemplate = await createContract("TestLpGovernor");
    var poolCreator = await deployPoolCreator(symbol, vault, toWei("0.001"));
    await poolCreator.addVersion([perp0Template.address, perp1Template.address], govTemplate.address, 0, "initial version");
    await symbol.addWhitelistedFactory(poolCreator.address);

    const { liquidityPool, governor } = await poolCreator.callStatic.createLiquidityPool(
      ctk.address,
      18,
      998,
      ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1])
    );
    await poolCreator.createLiquidityPool(ctk.address, 18, 998, ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1]));
    const perp = await ethers.getContractAt("LiquidityPoolAllHops", liquidityPool);

    // oracle
    let oracle = await createContract("OracleAdaptor", ["USD", "ETH"]);
    let updatePrice = async (price) => {
      let now = Math.floor(Date.now() / 1000);
      await oracle.setMarkPrice(price, now);
      await oracle.setIndexPrice(price, now);
    };
    await updatePrice(toWei("500"));

    await perp.createPerpetual(
      oracle.address,
      [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0"), toWei("0.5"), toWei("5")],
      [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1")],
      [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
      [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1")]
    );

    await perp.runLiquidityPool();

    // overview
    const info = await perp.getLiquidityPoolInfo();
    const stk = await (await createFactory("LpGovernor")).attach(info[2][4]);

    // get initial coins
    await ctk.mint(user1.address, toWei("10000"));
    await ctk.mint(user2.address, toWei("10000"));
    await ctk.connect(user1).approve(perp.address, toWei("100000"));
    await ctk.connect(user2).approve(perp.address, toWei("100000"));

    await poolCreator.connect(user1).grantPrivilege(user4.address, 0x7); // deposit withdraw

    // deposit
    await perp.connect(user4).deposit(0, user1.address, toWei("500"));
    var u1Account = await perp.getMarginAccount(0, user1.address);
    expect(u1Account.cash).to.equal(toWei("500"));
    expect(await ctk.balanceOf(user1.address)).to.equal(toWei("9500"));

    var u4Account = await perp.getMarginAccount(0, user4.address);
    expect(u4Account.cash).to.equal(toWei("0"));
    expect(await ctk.balanceOf(user4.address)).to.equal(toWei("0"));

    // lp
    await perp.connect(user2).addLiquidity(toWei("1000"));

    let now = Math.floor(Date.now() / 1000);
    await perp.connect(user4).trade(0, user1.address, toWei("3"), toWei("1000"), now + 999999, none, 0);

    await perp.connect(user4).withdraw(0, user1.address, toWei("100"));
    expect(await ctk.balanceOf(user1.address)).to.equal(toWei("9600"));
    expect(await ctk.balanceOf(user4.address)).to.equal(toWei("0"));

    var u4Account = await perp.getMarginAccount(0, user4.address);
    expect(u4Account.cash).to.equal(toWei("0"));
    expect(await ctk.balanceOf(user4.address)).to.equal(toWei("0"));
  });

  describe("liquidate whitelist", async () => {
    let user0;
    let user1;
    let user2;
    let user3;
    let user4;
    let vault;

    let poolCreator;
    let perp;
    let oracle;

    before(async () => {
      const accounts = await ethers.getSigners();
      user0 = accounts[0];
      user1 = accounts[1];
      user2 = accounts[2];
      user3 = accounts[3];
      user4 = accounts[4];
      vault = accounts[9];
    });

    const updatePrice = async (price) => {
      let now = Math.floor(Date.now() / 1000);
      await oracle.setMarkPrice(price, now);
      await oracle.setIndexPrice(price, now);
    };

    beforeEach(async () => {
      // users
      const LiquidityPoolFactory = await createLiquidityPoolFactory();

      // create components
      var symbol = await createContract("SymbolService");
      await symbol.initialize(10000);
      var ctk = await createContract("CustomERC20", ["collateral", "CTK", 18]);
      var perp0Template = await LiquidityPoolFactory[0].deploy();
      var perp1Template = await LiquidityPoolFactory[1].deploy();
      var govTemplate = await createContract("TestLpGovernor");
      poolCreator = await deployPoolCreator(symbol, vault, toWei("0.001"));
      await poolCreator.addVersion([perp0Template.address, perp1Template.address], govTemplate.address, 0, "initial version");
      await symbol.addWhitelistedFactory(poolCreator.address);

      const { liquidityPool, governor } = await poolCreator.callStatic.createLiquidityPool(
        ctk.address,
        18,
        998,
        ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1])
      );
      await poolCreator.createLiquidityPool(ctk.address, 18, 998, ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1]));
      perp = await ethers.getContractAt("LiquidityPoolAllHops", liquidityPool);

      // oracle
      oracle = await createContract("OracleAdaptor", ["USD", "ETH"]);
      await updatePrice(toWei("1000"));

      await perp.createPerpetual(
        oracle.address,
        [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0"), toWei("0.5"), toWei("5")],
        [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1")],
        [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
        [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1")]
      );

      await perp.runLiquidityPool();

      // overview
      const info = await perp.getLiquidityPoolInfo();
      const stk = await (await createFactory("LpGovernor")).attach(info[2][4]);

      // get initial coins
      await ctk.mint(user1.address, toWei("10000"));
      await ctk.mint(user2.address, toWei("10000"));
      await ctk.mint(user3.address, toWei("10000"));
      await ctk.connect(user1).approve(perp.address, toWei("100000"));
      await ctk.connect(user2).approve(perp.address, toWei("100000"));
      await ctk.connect(user3).approve(perp.address, toWei("100000"));

      await poolCreator.connect(user1).grantPrivilege(user4.address, 0x7); // deposit withdraw

      // deposit
      await perp.connect(user1).deposit(0, user1.address, toWei("200"));
      // lp
      await perp.connect(user2).addLiquidity(toWei("1000"));
    });

    it("default amm keeper whitelist", async () => {
      let now = Math.floor(Date.now() / 1000);
      const none = "0x0000000000000000000000000000000000000000";
      await perp.connect(user1).trade(0, user1.address, toWei("1"), toWei("2000"), now + 999999, none, 0);
      await updatePrice(toWei("850"));
      await expect(perp.liquidateByAMM(0, user1.address)).to.be.revertedWith("caller must be keeper");
      await poolCreator.addKeeper(user0.address);
      await perp.liquidateByAMM(0, user1.address);
    });

    it("local amm keeper whitelist", async () => {
      let now = Math.floor(Date.now() / 1000);
      const none = "0x0000000000000000000000000000000000000000";
      await perp.connect(user1).trade(0, user1.address, toWei("1"), toWei("2000"), now + 999999, none, 0);
      await updatePrice(toWei("850"));

      await expect(perp.connect(user3).liquidateByAMM(0, user1.address)).to.be.revertedWith("caller must be keeper");
      await expect(perp.connect(user4).liquidateByAMM(0, user1.address)).to.be.revertedWith("caller must be keeper");

      await poolCreator.addKeeper(user3.address);
      await perp.addAMMKeeper(0, user4.address); // 3 is local

      await expect(perp.connect(user3).liquidateByAMM(0, user1.address)).to.be.revertedWith("caller must be keeper");
      await perp.connect(user4).liquidateByAMM(0, user1.address);
    });
  });
});
