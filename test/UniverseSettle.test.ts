const { ethers } = require("hardhat");
const { expect } = require("chai");
import { BigNumber as BN } from "ethers";
import { toWei, fromWei, createFactory, createContract, createLiquidityPoolFactory, deployPoolCreator } from "../scripts/utils";

describe("universeSettle", () => {
  it("main", async () => {
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
      [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1"), toWei("0")],
      [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
      [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1"), toWei("0")]
    );

    await perp.createPerpetual(
      oracle2.address,
      [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("5")],
      [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1"), toWei("0")],
      [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
      [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1"), toWei("0")]
    );
    await perp.createPerpetual(
      oracle3.address,
      [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("5")],
      [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1"), toWei("0")],
      [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
      [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1"), toWei("0")]
    );
    await perp.createPerpetual(
      oracle4.address,
      [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("5")],
      [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1"), toWei("0")],
      [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
      [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1"), toWei("0")]
    );

    await perp.runLiquidityPool();

    // overview
    const info = await perp.getLiquidityPoolInfo();
    const stk = await (await createFactory("TestLpGovernor")).attach(info[2][4]);

    // get initial coins
    await ctk.mint(user1.address, toWei("10000"));
    await ctk.mint(user2.address, toWei("10000"));
    await ctk.connect(user1).approve(perp.address, toWei("100000"));
    await ctk.connect(user2).approve(perp.address, toWei("100000"));

    await perp.forceToSyncState();

    // deposit
    await perp.connect(user1).deposit(0, user1.address, toWei("100"));

    // lp
    await updatePrice(toWei("501"), toWei("601"), toWei("701"), toWei("801"));
    await perp.connect(user2).addLiquidity(toWei("1000"));

    let now = Math.floor(Date.now() / 1000);

    await poolCreator.addGuardian(user3.address);
    expect(await poolCreator.isGuardian(user3.address)).to.be.true;

    await expect(poolCreator.setUniverseSettled()).to.be.revertedWith("sender is not guardian");
    await poolCreator.connect(user3).setUniverseSettled();

    await expect(perp.connect(user1).deposit(0, user1.address, toWei("100"))).to.be.revertedWith("universe settled");
    // trade 1
    await expect(perp.connect(user1).trade(0, user1.address, toWei("0.1"), toWei("1000"), now + 999999, none, 0)).to.be.revertedWith(
      "universe settled"
    );
    // withdraw
    await expect(perp.connect(user1).withdraw(0, user1.address, toWei("10"))).to.be.revertedWith("universe settled");
  });

  it("guardian", async () => {
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

    expect(await poolCreator.guardianCount()).to.equal(0);

    await poolCreator.addGuardian(user2.address);
    expect(await poolCreator.guardianCount()).to.equal(1);
    await poolCreator.addGuardian(user3.address);
    expect(await poolCreator.guardianCount()).to.equal(2);

    await poolCreator.connect(user3).renounceGuardian();
    await expect(poolCreator.connect(user3).renounceGuardian()).to.be.revertedWith("sender is not guardian");
    expect(await poolCreator.guardianCount()).to.equal(1);

    expect(await poolCreator.isGuardian(user2.address)).to.be.true;
    expect(await poolCreator.isGuardian(user3.address)).to.be.false;
    await poolCreator.connect(user2).transferGuardian(user3.address);
    await expect(poolCreator.connect(user2).transferGuardian(user3.address)).to.be.revertedWith("sender is not guardian");
    expect(await poolCreator.isGuardian(user2.address)).to.be.false;
    expect(await poolCreator.isGuardian(user3.address)).to.be.true;

    await expect(poolCreator.setUniverseSettled()).to.be.revertedWith("sender is not guardian");
    await expect(poolCreator.connect(user2).setUniverseSettled()).to.be.revertedWith("sender is not guardian");
    await poolCreator.connect(user3).setUniverseSettled();
    expect(await poolCreator.isUniverseSettled()).to.be.true;
  });

  it("no trade", async () => {
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
      [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1"), toWei("0")],
      [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
      [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1"), toWei("0")]
    );

    await perp.createPerpetual(
      oracle2.address,
      [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("5")],
      [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1"), toWei("0")],
      [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
      [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1"), toWei("0")]
    );
    await perp.createPerpetual(
      oracle3.address,
      [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("5")],
      [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1"), toWei("0")],
      [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
      [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1"), toWei("0")]
    );
    await perp.createPerpetual(
      oracle4.address,
      [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("5")],
      [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1"), toWei("0")],
      [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
      [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1"), toWei("0")]
    );

    await perp.runLiquidityPool();

    // overview
    const info = await perp.getLiquidityPoolInfo();
    const stk = await (await createFactory("TestLpGovernor")).attach(info[2][4]);

    // get initial coins
    await ctk.mint(user1.address, toWei("10000"));
    await ctk.mint(user2.address, toWei("10000"));
    await ctk.connect(user1).approve(perp.address, toWei("100000"));
    await ctk.connect(user2).approve(perp.address, toWei("100000"));

    await perp.forceToSyncState();

    // deposit
    await perp.connect(user1).deposit(0, user1.address, toWei("100"));

    // lp
    await updatePrice(toWei("501"), toWei("601"), toWei("701"), toWei("801"));
    await perp.connect(user2).addLiquidity(toWei("1000"));


    await poolCreator.addGuardian(user3.address);
    expect(await poolCreator.isGuardian(user3.address)).to.be.true;

    await expect(poolCreator.setUniverseSettled()).to.be.revertedWith("sender is not guardian");
    await poolCreator.connect(user3).setUniverseSettled();
    await perp.setEmergencyState("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
    var state = await perp.getPerpetualInfo(0)
    expect(state.state).to.equal(3)
    state = await perp.getPerpetualInfo(1)
    expect(state.state).to.equal(3)
    state = await perp.getPerpetualInfo(2)
    expect(state.state).to.equal(3)
    state = await perp.getPerpetualInfo(3)
    expect(state.state).to.equal(3)
  });
});
