const { ethers } = require("hardhat");
const { expect } = require("chai");
import "./helper";
import {
    toWei,
    fromWei,
    createFactory,
    createContract,
    createLiquidityPoolFactory,
    deployPoolCreator
} from "../scripts/utils";
import BigNumber from 'bignumber.js';

const weis = new BigNumber('1000000000000000000');
const toWad = (x: any) => {
    return new BigNumber(x).times(weis).toFixed(0);
}
const _0 = toWad('0')

describe("Reader", () => {
    var accounts;
    var user0;
    var user1;
    var user2;
    var user3;
    var vault;
    var none;
    var symbol;
    var ctk;
    var perp0Template;
    var perp1Template;
    var govTemplate;
    var poolCreator;
    var perp;
    var oracle1;
    var oracle2;
    var reader;
    var inverseStateService;
    const vaultFeeRate = toWei("0.001");

    let updatePrice = async (price1, price2) => {
        let now = Math.floor(Date.now() / 1000);
        await oracle1.setMarkPrice(price1, now);
        await oracle1.setIndexPrice(price1, now);
        await oracle2.setMarkPrice(price2, now);
        await oracle2.setIndexPrice(price2, now);
    }

    beforeEach(async () => {
        // users
        accounts = await ethers.getSigners();
        user0 = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];
        vault = accounts[9];
        none = "0x0000000000000000000000000000000000000000";
        const LiquidityPoolFactory = await createLiquidityPoolFactory()

        // create components
        symbol = await createContract("SymbolService");
        await symbol.initialize(10000);
        ctk = await createContract("CustomERC20", ["collateral", "CTK", 6]);
        perp0Template = await LiquidityPoolFactory[0].deploy();
        perp1Template = await LiquidityPoolFactory[1].deploy();
        govTemplate = await createContract("TestLpGovernor");
        poolCreator = await deployPoolCreator(symbol, vault, toWei("0.001"));
        await poolCreator.addVersion([perp0Template.address, perp1Template.address], govTemplate.address, 0, "initial version");
        await symbol.addWhitelistedFactory(poolCreator.address);

        const { liquidityPool, governor } = await poolCreator.callStatic.createLiquidityPool(
            ctk.address,
            6,
            998,
            ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1]),
        );
        await poolCreator.createLiquidityPool(
            ctk.address,
            6,
            998,
            ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1]),
        );
        perp = await ethers.getContractAt("LiquidityPoolAllHops", liquidityPool);
        inverseStateService = await createContract("InverseStateService");
        reader = await createContract("Reader", [poolCreator.address, inverseStateService.address]);

        // oracle
        oracle1 = await createContract("OracleAdaptor", ["USD", "BTC"]);
        oracle2 = await createContract("OracleAdaptor", ["USD", "ETH"]);
        await updatePrice(toWei("500"), toWei("500"))
        await perp.createPerpetual(oracle1.address,
            [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("1")],
            [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1"), toWei("0")],
            [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
            [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1"), toWei("0")],
        )
        await perp.createPerpetual(oracle2.address,
            [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("1")],
            [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1"), toWei("0")],
            [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
            [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1"), toWei("0")],
        )
        await perp.runLiquidityPool();

        // get initial coins
        await ctk.mint(user1.address, toWei("10000"));
        await ctk.mint(user2.address, toWei("10000"));
        await ctk.connect(user1).approve(perp.address, toWei("100000"));
        await ctk.connect(user2).approve(perp.address, toWei("100000"));

        // deposit
        await perp.connect(user1).deposit(0, user1.address, toWei("100"));

        // lp
        await updatePrice(toWei("501"), toWei("601"));
        await perp.connect(user2).addLiquidity(toWei("1000"));

        // trade 1
        await updatePrice(toWei("502"), toWei("603"));
        let now = Math.floor(Date.now() / 1000);
        await perp.connect(user1).trade(0, user1.address, toWei("0.1"), toWei("1000"), now + 999999, none, 0);
    });

    it('getAccountStorage', async () => {
        const account = await reader.callStatic.getAccountStorage(
            perp.address, 0, user1.address
        );
        expect(account.isSynced).to.be.true;
        expect(account.accountStorage.position).approximateBigNumber(toWei("0.1"));
        expect(account.accountStorage.cash).approximateBigNumber(toWei("49.145894"));
        expect(account.accountStorage.availableMargin).approximateBigNumber(toWei("94.32589398"));
        expect(account.accountStorage.margin).approximateBigNumber(toWei("99.345894"));
        expect(account.accountStorage.settleableMargin).approximateBigNumber(toWei("0"));
        expect(account.accountStorage.targetLeverage).approximateBigNumber(toWei("1"));
        expect(account.accountStorage.isInitialMarginSafe).to.be.true;
        expect(account.accountStorage.isMaintenanceMarginSafe).to.be.true;
        expect(account.accountStorage.isMarginSafe).to.be.true;
    });

    it('getLiquidityPoolStorage', async () => {
        const pool = await reader.callStatic.getLiquidityPoolStorage(perp.address);
        expect(pool.isSynced).to.be.true;
        expect(pool.pool.isRunning).to.be.true;
        expect(pool.pool.isFastCreationEnabled).to.be.false;
        expect(pool.pool.isAMMMaintenanceSafe).to.be.true;
        expect(pool.pool.addresses[0]).to.equal(poolCreator.address) // creator
        expect(pool.pool.addresses[1]).to.equal(user0.address) // operator
        expect(pool.pool.addresses[2]).to.equal(none) // transferringOperator
        // expect(pool.pool.addresses[3]).to.equal(gov.address) // governor is a template
        // expect(pool.pool.addresses[4]).to.equal(lpToken.address) // shareToken is a template
        expect(pool.pool.addresses[5]).to.equal(ctk.address) // collateralToken
        expect(pool.pool.addresses[6]).to.equal(vault.address) // vault
        expect(pool.pool.intNums[0]).approximateBigNumber(vaultFeeRate);
        expect(pool.pool.intNums[1]).approximateBigNumber(toWei("1000"));
        expect(pool.pool.intNums[2]).approximateBigNumber(toWei("1000000"));
        expect(pool.pool.intNums[3]).approximateBigNumber(toWei("0"));
        expect(pool.pool.intNums[4]).approximateBigNumber(toWei("0"));
        expect(pool.pool.uintNums[0]).to.equal(6);
        expect(pool.pool.uintNums[1]).to.equal(2);
        expect(pool.pool.uintNums[2]).not.to.equal(0);
        expect(pool.pool.perpetuals[0].state).to.equal(2);
        expect(pool.pool.perpetuals[0].oracle).to.equal(oracle1.address);
        expect(pool.pool.perpetuals[0].nums[0].gt('0')).to.be.true; // totalCollateral
        expect(pool.pool.perpetuals[0].nums[1]).approximateBigNumber(toWei("502")); // markPrice
        expect(pool.pool.perpetuals[0].nums[2]).approximateBigNumber(toWei("502")); // indexPrice
        expect(pool.pool.perpetuals[0].symbol).to.equal(10000);
        expect(pool.pool.perpetuals[0].underlyingAsset).to.equal('BTC');
        expect(pool.pool.perpetuals[0].isMarketClosed).to.be.false;
        expect(pool.pool.perpetuals[0].isTerminated).to.be.false;
        expect(pool.pool.perpetuals[0].ammCashBalance.gt(0)).to.be.true;;
        expect(pool.pool.perpetuals[0].ammPositionAmount).approximateBigNumber(toWei("-0.1"));
        expect(pool.pool.perpetuals[0].isInversePerpetual).to.be.false;
        expect(pool.pool.perpetuals[1].state).to.equal(2);
        expect(pool.pool.perpetuals[1].oracle).to.equal(oracle2.address);
        expect(pool.pool.perpetuals[1].nums[0]).approximateBigNumber(toWei("0")); // totalCollateral
        expect(pool.pool.perpetuals[1].nums[1]).approximateBigNumber(toWei("603")); // markPrice
        expect(pool.pool.perpetuals[1].nums[2]).approximateBigNumber(toWei("603")); // indexPrice
        expect(pool.pool.perpetuals[1].symbol).to.equal(10001);
        expect(pool.pool.perpetuals[1].underlyingAsset).to.equal('ETH');
        expect(pool.pool.perpetuals[1].isMarketClosed).to.be.false;
        expect(pool.pool.perpetuals[1].isTerminated).to.be.false;
        expect(pool.pool.perpetuals[1].ammCashBalance).approximateBigNumber(toWei("0"));
        expect(pool.pool.perpetuals[1].ammPositionAmount).approximateBigNumber(toWei("0"));
        expect(pool.pool.perpetuals[1].isInversePerpetual).to.be.false;
    });

    it('zero price', async () => {
        await updatePrice(toWei("501"), toWei("0"));
        const pool = await reader.callStatic.getLiquidityPoolStorage(perp.address);
        expect(pool.isSynced).to.be.false;

        expect(pool.pool.isFastCreationEnabled).to.be.false;
        expect(pool.pool.addresses[0]).to.equal(poolCreator.address) // creator
        expect(pool.pool.addresses[1]).to.equal(user0.address) // operator
        expect(pool.pool.addresses[2]).to.equal(none) // transferringOperator
        // expect(pool.pool.addresses[3]).to.equal(gov.address) // governor is a template
        // expect(pool.pool.addresses[4]).to.equal(lpToken.address) // shareToken is a template
        expect(pool.pool.addresses[5]).to.equal(ctk.address) // collateralToken
        expect(pool.pool.addresses[6]).to.equal(vault.address) // vault
        expect(pool.pool.intNums[0]).approximateBigNumber(vaultFeeRate);
        expect(pool.pool.intNums[1]).approximateBigNumber(toWei("1000"));
        expect(pool.pool.intNums[2]).approximateBigNumber(toWei("1000000"));
        expect(pool.pool.intNums[3]).approximateBigNumber(toWei("0"));
        expect(pool.pool.intNums[4]).approximateBigNumber(toWei("0"));
        expect(pool.pool.uintNums[0]).to.equal(6);
        expect(pool.pool.uintNums[1]).to.equal(2);
        expect(pool.pool.uintNums[2]).not.to.equal(0);
        expect(pool.pool.perpetuals[0].state).to.equal(2);
        expect(pool.pool.perpetuals[0].oracle).to.equal(oracle1.address);
        expect(pool.pool.perpetuals[0].nums[0].gt('0')).to.be.true; // totalCollateral
        expect(pool.pool.perpetuals[0].nums[1]).approximateBigNumber(toWei("502")); // markPrice
        expect(pool.pool.perpetuals[0].nums[2]).approximateBigNumber(toWei("502")); // indexPrice
        expect(pool.pool.perpetuals[0].symbol).to.equal(10000);
        expect(pool.pool.perpetuals[0].underlyingAsset).to.equal('BTC');
        expect(pool.pool.perpetuals[0].isMarketClosed).to.be.false;
        expect(pool.pool.perpetuals[0].ammCashBalance.gt(0)).to.be.true;;
        expect(pool.pool.perpetuals[0].ammPositionAmount).approximateBigNumber(toWei("-0.1"));
        expect(pool.pool.perpetuals[1].state).to.equal(2);
        expect(pool.pool.perpetuals[1].oracle).to.equal(oracle2.address);
        expect(pool.pool.perpetuals[1].nums[0]).approximateBigNumber(toWei("0")); // totalCollateral
        expect(pool.pool.perpetuals[1].nums[1]).approximateBigNumber(toWei("603")); // markPrice
        expect(pool.pool.perpetuals[1].nums[2]).approximateBigNumber(toWei("603")); // indexPrice
        expect(pool.pool.perpetuals[1].symbol).to.equal(10001);
        expect(pool.pool.perpetuals[1].underlyingAsset).to.equal('ETH');
        expect(pool.pool.perpetuals[1].isMarketClosed).to.be.false;
        expect(pool.pool.perpetuals[1].ammCashBalance).approximateBigNumber(toWei("0"));
        expect(pool.pool.perpetuals[1].ammPositionAmount).approximateBigNumber(toWei("0"));
    });

    it('readIndexPrices', async () => {
        await updatePrice(toWei("501"), toWei("0"));
        const { isSuccess, indexPrices } = await reader.callStatic.readIndexPrices([
            oracle1.address, // normal
            oracle2.address, // normal but 0
            // user0.address, // bad isContract not work in optimism
            // ctk.address, // bad isContract not work in optimism
            // none, // bad isContract not work in optimism
        ]);
        expect(isSuccess.length).to.equal(2)
        expect(isSuccess[0]).to.equal(true)
        expect(isSuccess[1]).to.equal(true)
        // expect(isSuccess[2]).to.equal(false)
        // expect(isSuccess[3]).to.equal(false)
        // expect(isSuccess[4]).to.equal(false)
        expect(indexPrices.length).to.equal(2)
        expect(indexPrices[0]).to.equal(toWad('501'))
        expect(indexPrices[1]).to.equal(toWad('0'))
    })
})
