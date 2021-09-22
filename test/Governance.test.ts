const { ethers } = require("hardhat");
const { expect } = require("chai");

import {
    toWei,
    toBytes32,
    getAccounts,
    createContract,
    createFactory,
} from '../scripts/utils';

describe('Governance', () => {
    let accounts;
    let user0;
    let user1;
    let user2;
    let governance;
    let TestGovernance;
    let creator;
    let oracle;

    before(async () => {
        accounts = await getAccounts();
        user0 = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];

        const AMMModule = await createContract("AMMModule");
        const CollateralModule = await createContract("CollateralModule")
        const PerpetualModule = await createContract("PerpetualModule");
        const LiquidityPoolModule = await createContract("LiquidityPoolModule", [], { CollateralModule, AMMModule, PerpetualModule });
        const LiquidityPoolModule2 = await createContract("LiquidityPoolModule2", [], { CollateralModule, PerpetualModule, LiquidityPoolModule });

        TestGovernance = await createFactory(
            "TestGovernance",
            { PerpetualModule, LiquidityPoolModule, LiquidityPoolModule2, CollateralModule }
        );
        oracle = await createContract("OracleAdaptor", ["USD", "ETH"]);
        var now = Math.floor(Date.now() / 1000);
        await oracle.setIndexPrice(toWei("1000"), now)
        await oracle.setMarkPrice(toWei("1000"), now)
    })

    beforeEach(async () => {
        governance = await TestGovernance.deploy();
        await governance.initializeParameters(
            oracle.address,
            [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("1")],
            [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.2"), toWei("0.04"), toWei("1")],
            [toWei("0.01"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
            [toWei("0.9"), toWei("1"), toWei("1"), toWei("1"), toWei("10"), toWei("1"), toWei("1"), toWei("1")],
        )
        creator = await createContract("TestTracer");
        await governance.setCreator(creator.address);
    })

    it('checkIn', async () => {
        expect(await governance.operatorExpiration()).to.equal(0);
        expect(await governance.getOperator()).to.equal("0x0000000000000000000000000000000000000000")
        await expect(governance.checkIn()).to.be.revertedWith("only operator is allowed")

        await governance.setOperatorNoAuth(user0.address);
        const tx = await governance.checkIn();
        const block = await ethers.provider.getBlock(tx.blockNumber)
        // var now = Math.floor(Date.now() / 1000);
        expect(await governance.operatorExpiration()).to.equal(block.timestamp + 86400 * 10);
        expect(await governance.getOperator()).to.equal(user0.address);
        await governance.setOperatorExpiration(block.timestamp - 1);
        expect(await governance.getOperator()).to.equal("0x0000000000000000000000000000000000000000")
    })


    it('operatorship', async () => {
        await expect(governance.transferOperator(user1.address)).to.be.revertedWith("can only be initiated by governor")

        await governance.setOperatorNoAuth(user0.address);
        await creator.registerLiquidityPool(governance.address, user0.address);

        await governance.transferOperator(user1.address);
        await expect(governance.connect(user1).transferOperator(user0.address)).to.be.revertedWith("can only be initiated by operator")

        await governance.connect(user1).claimOperator();
        let pools = await creator.listLiquidityPoolOwnedBy(user0.address, 0, 1);
        await expect(pools.length).to.equal(0);
        pools = await creator.listLiquidityPoolOwnedBy(user1.address, 0, 1);
        await expect(pools[0]).to.equal(governance.address);
        await expect(governance.connect(user0).transferOperator(user1.address)).to.be.revertedWith("can only be initiated by operator")

        await governance.connect(user1).transferOperator(user0.address);
        await governance.connect(user1).transferOperator(user2.address);
        await expect(governance.connect(user0).claimOperator()).to.be.revertedWith("caller is not qualified")
        await governance.connect(user2).claimOperator();

        await expect(governance.connect(user1).revokeOperator()).to.be.revertedWith("only operator is allowed")
        await governance.connect(user2).revokeOperator();
        await expect(governance.connect(user1).transferOperator(user0.address)).to.be.revertedWith("can only be initiated by governor")
        pools = await creator.listLiquidityPoolOwnedBy(user2.address, 0, 1);
        await expect(pools.length).to.equal(0);

        await governance.setGovernor(user2.address);
        await governance.connect(user2).transferOperator(user0.address);
        await governance.connect(user0).claimOperator();
    });

    it('forceToSetEmergencyState', async () => {
        const oracle = await createContract("OracleAdaptor", ["A", "B"])
        var now = Math.floor(Date.now() / 1000);
        await oracle.setIndexPrice(toWei("1000"), now)
        await oracle.setMarkPrice(toWei("1000"), now)
        await governance.setGovernor(user0.address);
        await governance.setOracle(0, oracle.address);

        await expect(governance.connect(user1).forceToSetEmergencyState(0, toWei("771"))).to.be.revertedWith("only governor is allowed")

        const tx = await governance.forceToSetEmergencyState(0, toWei("771"));
        const block = await ethers.provider.getBlock(tx.blockNumber)

        const result = await governance.settlementPrice(0)
        expect(result[0]).to.equal(toWei("771"));
        expect(result[1]).to.equal(block.timestamp);
        expect(await governance.state(0)).to.equal(3)
    })

    it('setOracle', async () => {
        const alterOracle = await createContract("OracleAdaptor", ["A", "B"])
        var now = Math.floor(Date.now() / 1000);
        await alterOracle.setIndexPrice(toWei("1000"), now)
        await alterOracle.setMarkPrice(toWei("1000"), now)
        await governance.setGovernor(user0.address);

        expect(await governance.oracle(0)).to.equal(oracle.address)
        await governance.setOracle(0, alterOracle.address);
        expect(await governance.oracle(0)).to.equal(alterOracle.address)

        await expect(governance.setOracle(0, "0x0000000000000000000000000000000000000000")).to.be.revertedWith("invalid oracle address")
        await expect(governance.setOracle(0, alterOracle.address)).to.be.revertedWith("oracle not changed")
        await expect(governance.setOracle(0, user0.address)).to.be.revertedWith("oracle must be contract")

        const alterOracle2 = await createContract("OracleAdaptor", ["A", "B"])
        await expect(governance.setOracle(0, alterOracle2.address)).to.be.revertedWith("oracle's twap long price is not updated")
    })


    it('setEmergencyState', async () => {
        const oracle = await createContract("OracleAdaptor", ["A", "B"])
        var now = Math.floor(Date.now() / 1000);
        await oracle.setIndexPrice(toWei("1000"), now)
        await oracle.setMarkPrice(toWei("1000"), now)

        await governance.setGovernor(user0.address);
        await governance.setOracle(0, oracle.address);

        await expect(governance.setEmergencyState(0)).to.be.revertedWith("prerequisite not met")

        await oracle.setTerminated(true);
        await governance.setEmergencyState(0);

        const result = await governance.settlementPrice(0)
        expect(result[0]).to.equal(toWei("1000"));
        expect(result[1]).to.equal(now);
        expect(await governance.state(0)).to.equal(3)
    })

    const cases = [
        {
            poolCash: toWei('100'),
            cash1: toWei('25100'),
            cash2: toWei('-4900'),
            newPoolCash: toWei('0'),
            newCash1: toWei('25250'), // new margin1 = 250
            newCash2: toWei('-4950'), // new margin1 = 50
        },
        {
            poolCash: toWei('-20'),
            cash1: toWei('25100'),
            cash2: toWei('-4900'),
            newPoolCash: toWei('0'),
            newCash1: toWei('25150'), // new margin1 = 150
            newCash2: toWei('-4970'), // new margin1 = 30
        },
        {
            poolCash: toWei('100'),
            cash1: toWei('25100'),
            cash2: toWei('-5800'),
            newPoolCash: toWei('0'),
            newCash1: toWei('24500'), // new margin1 = -500
            newCash2: toWei('-5100'), // new margin2 = -100
        },
        {
            poolCash: toWei('-100'),
            cash1: toWei('24900'),
            cash2: toWei('-5100'),
            newPoolCash: toWei('0'),
            newCash1: toWei('24750'), // new margin1 = -250
            newCash2: toWei('-5050'), // new margin2 = -50
        },
    ]

    cases.forEach((element, index) => {
        it(`setAllPerpetualsToEmergencyState-${index}`, async () => {
            await governance.initializeParameters(
                oracle.address,
                [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("1")],
                [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.2"), toWei("0.04"), toWei("1")],
                [toWei("0.01"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
                [toWei("0.9"), toWei("1"), toWei("1"), toWei("1"), toWei("10"), toWei("1"), toWei("1"), toWei("1")],
            )

            const alterOracle = await createContract("OracleAdaptor", ["A", "B"])
            var now = Math.floor(Date.now() / 1000);
            await alterOracle.setIndexPrice(toWei("1000"), now)
            await alterOracle.setMarkPrice(toWei("1000"), now)

            await governance.setGovernor(user0.address);
            await governance.setOracle(0, alterOracle.address);
            await governance.setOracle(1, alterOracle.address);
            await governance.setTotalCollateral(0, toWei("999999999"));
            await governance.setTotalCollateral(1, toWei("999999999"));

            await governance.setMarginAccount(0, governance.address, element.cash1, toWei("-25"));
            await governance.setMarginAccount(1, governance.address, element.cash2, toWei("5"));
            await governance.setPoolCash(element.poolCash);
            await governance.setEmergencyState("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
            const result = await governance.settlementPrice(0)
            expect(result[0]).to.equal(toWei("1000"));
            expect(result[1]).to.equal(now);
            expect(await governance.state(0)).to.equal(3)
            var { cash, position } = await governance.getMarginAccount(0, governance.address)
            expect(cash).to.equal(element.newCash1);
            expect(position).to.equal(toWei("-25"));
            var { cash, position } = await governance.getMarginAccount(1, governance.address)
            expect(cash).to.equal(element.newCash2);
            expect(position).to.equal(toWei("5"));
            expect(await governance.getPoolCash()).to.equal(element.newPoolCash)
        })
    })

    it(`setAllPerpetualsToEmergencyState - has operator`, async () => {

        const element = {
            poolCash: toWei('100'),
            cash1: toWei('25100'),
            cash2: toWei('-4900'),
            newPoolCash: toWei('0'),
            newCash1: toWei('25250'), // new margin1 = 250
            newCash2: toWei('-4950'), // new margin1 = 50
        }

        await governance.initializeParameters(
            oracle.address,
            [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("1")],
            [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.2"), toWei("0.04"), toWei("1")],
            [toWei("0.01"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
            [toWei("0.9"), toWei("1"), toWei("1"), toWei("1"), toWei("10"), toWei("1"), toWei("1"), toWei("1")],
        )

        const alterOracle = await createContract("OracleAdaptor", ["A", "B"])
        var now = Math.floor(Date.now() / 1000);
        await alterOracle.setIndexPrice(toWei("1000"), now)
        await alterOracle.setMarkPrice(toWei("1000"), now)

        const ctk = await createContract("CustomERC20", ["CTK", "CTK", 18])
        await governance.setCollateralToken(ctk.address, 18)
        await governance.setOperatorNoAuth(user0.address)
        await ctk.connect(user0).approve(governance.address, toWei("996"))
        await ctk.mint(user0.address, toWei("10"))
        await governance.donateInsuranceFund(toWei("10"))

        await governance.setGovernor(user0.address);
        await governance.setOracle(0, alterOracle.address);
        await governance.setOracle(1, alterOracle.address);
        await governance.setTotalCollateral(0, toWei("999999999"));
        await governance.setTotalCollateral(1, toWei("999999999"));

        await governance.setMarginAccount(0, governance.address, element.cash1, toWei("-25"));
        await governance.setMarginAccount(1, governance.address, element.cash2, toWei("5"));
        await governance.setPoolCash(element.poolCash);

        expect(await ctk.balanceOf(user0.address)).to.equal(toWei("0"))
        await governance.setEmergencyState("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
        expect(await ctk.balanceOf(user0.address)).to.equal(toWei("10"))
        const result = await governance.settlementPrice(0)
        expect(result[0]).to.equal(toWei("1000"));
        expect(result[1]).to.equal(now);
        expect(await governance.state(0)).to.equal(3)
        var { cash, position } = await governance.getMarginAccount(0, governance.address)
        expect(cash).to.equal(element.newCash1);
        expect(position).to.equal(toWei("-25"));
        var { cash, position } = await governance.getMarginAccount(1, governance.address)
        expect(cash).to.equal(element.newCash2);
        expect(position).to.equal(toWei("5"));
        expect(await governance.getPoolCash()).to.equal(element.newPoolCash)
    })

    it(`setAllPerpetualsToEmergencyState-fail`, async () => {
        await governance.initializeParameters(
            oracle.address,
            [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("1")],
            [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.2"), toWei("0.04"), toWei("1")],
            [toWei("0.01"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
            [toWei("0.9"), toWei("1"), toWei("1"), toWei("1"), toWei("10"), toWei("1"), toWei("1"), toWei("1")],
        )
        const alterOracle = await createContract("OracleAdaptor", ["A", "B"])
        var now = Math.floor(Date.now() / 1000);
        await alterOracle.setIndexPrice(toWei("1000"), now)
        await alterOracle.setMarkPrice(toWei("1000"), now)

        await governance.setGovernor(user0.address);
        await governance.setOracle(0, alterOracle.address);
        await governance.setOracle(1, alterOracle.address);
        await governance.setTotalCollateral(0, toWei("999999999"));
        await governance.setTotalCollateral(1, toWei("999999999"));

        await governance.setMarginAccount(0, governance.address, toWei('20000'), toWei('-25'));
        await governance.setMarginAccount(1, governance.address, toWei('3500'), toWei('5'));
        await governance.setPoolCash(toWei('-2000'));
        // margin = -2000 + 20000 + (-25) * 1000 + 3500 + 5 * 1000 = 1500
        // maintenance margin = 25 * 1000 * 0.05 + 5 * 1000 * 0.05 = 1500
        await expect(governance.setEmergencyState("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")).to.be.revertedWith("AMM's margin >= maintenance margin or not universe settled");
    })

    it('setPerpetualBaseParameter', async () => {
        await governance.setGovernor(user0.address);
        expect(await governance.initialMarginRate(0)).to.equal(toWei("0.1"));

        await governance.setPerpetualBaseParameter(0, [
            toWei("0.05"),
            toWei("0.025"),
            toWei("0.002"),
            toWei("0.002"),
            toWei("0.5"),
            toWei("0.01"),
            toWei("1"),
            toWei("0.2"),
            toWei("1"),
        ]);

        expect(await governance.initialMarginRate(0)).to.equal(toWei("0.05"));
        expect(await governance.maintenanceMarginRate(0)).to.equal(toWei("0.025"));
        expect(await governance.operatorFeeRate(0)).to.equal(toWei("0.002"));
        expect(await governance.lpFeeRate(0)).to.equal(toWei("0.002"));
        expect(await governance.referralRebateRate(0)).to.equal(toWei("0.5"));
        expect(await governance.liquidationPenaltyRate(0)).to.equal(toWei("0.01"));
        expect(await governance.keeperGasReward(0)).to.equal(toWei("1"));
        expect(await governance.insuranceFundRate(0)).to.equal(toWei("0.2"));
    })

    it('setPerpetualBaseParameter - exception', async () => {
        await governance.setGovernor(user1.address);
        await expect(governance.setPerpetualBaseParameter(0, [
            toWei("0.05"),
            toWei("0.025"),
            toWei("0.002"),
            toWei("0.002"),
            toWei("0.5"),
            toWei("0.01"),
            toWei("1"),
            toWei("0.2"),
            toWei("1"),
        ])).to.be.revertedWith("only governor is allowed");

        await governance.setGovernor(user0.address);
        await expect(governance.setPerpetualBaseParameter(0, [
            toWei("0.11"),
            toWei("0.05"),
            toWei("0.001"),
            toWei("0.001"),
            toWei("0.2"),
            toWei("0.02"),
            toWei("0.00000002"),
            toWei("0.5"),
            toWei("1"),
        ])).to.be.revertedWith("cannot increase initialMarginRate");

        await expect(governance.setPerpetualBaseParameter(0, [
            toWei("0.05"),
            toWei("0.051"),
            toWei("0.001"),
            toWei("0.001"),
            toWei("0.2"),
            toWei("0.02"),
            toWei("0.00000002"),
            toWei("0.5"),
            toWei("1"),
        ])).to.be.revertedWith("cannot increase maintenanceMarginRate");

        await expect(governance.setPerpetualBaseParameter(0, [
            toWei("0.04"),
            toWei("0.05"),
            toWei("0.001"),
            toWei("0.001"),
            toWei("0.2"),
            toWei("0.02"),
            toWei("0.00000002"),
            toWei("0.5"),
            toWei("1"),
        ])).to.be.revertedWith("maintenanceMarginRate > initialMarginRate");

        await expect(governance.setPerpetualBaseParameter(0, [
            toWei("0"),
            toWei("0.05"),
            toWei("0.001"),
            toWei("0.001"),
            toWei("0.2"),
            toWei("0.02"),
            toWei("0.00000002"),
            toWei("0.5"),
            toWei("1"),
        ])).to.be.revertedWith("initialMarginRate <= 0");

        await expect(governance.setPerpetualBaseParameter(0, [
            toWei("-0.01"),
            toWei("0.05"),
            toWei("0.001"),
            toWei("0.001"),
            toWei("0.2"),
            toWei("0.02"),
            toWei("0.00000002"),
            toWei("0.5"),
            toWei("1"),
        ])).to.be.revertedWith("initialMarginRate <= 0");

        await expect(governance.setPerpetualBaseParameter(0, [
            toWei("0.05"),
            toWei("0"),
            toWei("0.001"),
            toWei("0.001"),
            toWei("0.2"),
            toWei("0.02"),
            toWei("0.00000002"),
            toWei("0.5"),
            toWei("1"),
        ])).to.be.revertedWith("maintenanceMarginRate <= 0");

        await expect(governance.setPerpetualBaseParameter(0, [
            toWei("0.05"),
            toWei("-0.05"),
            toWei("0.001"),
            toWei("0.001"),
            toWei("0.2"),
            toWei("0.02"),
            toWei("0.00000002"),
            toWei("0.5"),
            toWei("1"),
        ])).to.be.revertedWith("maintenanceMarginRate <= 0");

        await expect(governance.setPerpetualBaseParameter(0, [
            toWei("0.05"),
            toWei("0.025"),
            toWei("-0.01"),
            toWei("0.001"),
            toWei("0.2"),
            toWei("0.02"),
            toWei("0.00000002"),
            toWei("0.5"),
            toWei("1"),
        ])).to.be.revertedWith("operatorFeeRate < 0");

        await expect(governance.setPerpetualBaseParameter(0, [
            toWei("0.05"),
            toWei("0.025"),
            toWei("0.011"),
            toWei("0.001"),
            toWei("0.2"),
            toWei("0.02"),
            toWei("0.00000002"),
            toWei("0.5"),
            toWei("1"),
        ])).to.be.revertedWith("operatorFeeRate > 1%");

        await expect(governance.setPerpetualBaseParameter(0, [
            toWei("0.05"),
            toWei("0.025"),
            toWei("0.01"),
            toWei("-0.01"),
            toWei("0.2"),
            toWei("0.02"),
            toWei("0.00000002"),
            toWei("0.5"),
            toWei("1"),
        ])).to.be.revertedWith("lpFeeRate < 0");

        await expect(governance.setPerpetualBaseParameter(0, [
            toWei("0.05"),
            toWei("0.025"),
            toWei("0.01"),
            toWei("0.011"),
            toWei("0.2"),
            toWei("0.02"),
            toWei("0.00000002"),
            toWei("0.5"),
            toWei("1"),
        ])).to.be.revertedWith("lpFeeRate > 1%");

        await expect(governance.setPerpetualBaseParameter(0, [
            toWei("0.05"),
            toWei("0.025"),
            toWei("0.002"),
            toWei("0.002"),
            toWei("0.5"),
            toWei("-0.01"),
            toWei("1"),
            toWei("0.2"),
            toWei("1"),
        ])).to.be.revertedWith("liquidationPenaltyRate < 0");

        await expect(governance.setPerpetualBaseParameter(0, [
            toWei("0.05"),
            toWei("0.025"),
            toWei("0.002"),
            toWei("0.002"),
            toWei("0.5"),
            toWei("0.026"),
            toWei("1"),
            toWei("0.2"),
            toWei("1"),
        ])).to.be.revertedWith("liquidationPenaltyRate > maintenanceMarginRate");

        await expect(governance.setPerpetualBaseParameter(0, [
            toWei("0.05"),
            toWei("0.025"),
            toWei("0.002"),
            toWei("0.002"),
            toWei("0.5"),
            toWei("0.01"),
            toWei("-1"),
            toWei("0.2"),
            toWei("1"),
        ])).to.be.revertedWith("keeperGasReward < 0");

        await expect(governance.setPerpetualBaseParameter(0, [
            toWei("0.05"),
            toWei("0.025"),
            toWei("0.002"),
            toWei("0.002"),
            toWei("0.5"),
            toWei("0.01"),
            toWei("1"),
            toWei("-0.2"),
            toWei("1"),
        ])).to.be.revertedWith("insuranceFundRate < 0");
    })

    it('updatePerpetualRiskParameter', async () => {
        await governance.setOperatorNoAuth(user0.address);
        await governance.updatePerpetualRiskParameter(0, [
            toWei("0.5"),
            toWei("0.6"),
            toWei("0.45"),
            toWei("0.1"),
            toWei("5"),
            toWei("0.05"),
            toWei("0.04"),
            toWei("1")
        ])
        expect(await governance.halfSpread(0)).to.equal(toWei("0.5"));
        expect(await governance.openSlippageFactor(0)).to.equal(toWei("0.6"));
        expect(await governance.closeSlippageFactor(0)).to.equal(toWei("0.45"));
        expect(await governance.fundingRateLimit(0)).to.equal(toWei("0.1"));
        expect(await governance.ammMaxLeverage(0)).to.equal(toWei("5"));
        expect(await governance.maxClosePriceDiscount(0)).to.equal(toWei("0.05"));
        expect(await governance.fundingRateFactor(0)).to.equal(toWei("0.04"));
    })

    it('setPerpetualRiskParameter', async () => {
        await governance.setGovernor(user0.address);
        await governance.setPerpetualRiskParameter(0,
            [toWei("0.05"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.2"), toWei("0.04"), toWei("1")],
            [toWei("0.01"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
            [toWei("0.9"), toWei("1"), toWei("1"), toWei("1"), toWei("10"), toWei("1"), toWei("1"), toWei("1")],
        );
        expect(await governance.halfSpread(0)).to.equal(toWei("0.05"));

        await expect(governance.setPerpetualRiskParameter(0,
            [toWei("0.99"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.2"), toWei("0.04"), toWei("1")],
            [toWei("0.01"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
            [toWei("0.9"), toWei("1"), toWei("1"), toWei("1"), toWei("10"), toWei("1"), toWei("1"), toWei("1")],
        )).to.be.revertedWith("value out of range");
        await expect(governance.setPerpetualRiskParameter(0,
            [toWei("0.009"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei("0.2"), toWei("0.04"), toWei("1")],
            [toWei("0.01"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
            [toWei("0.9"), toWei("1"), toWei("1"), toWei("1"), toWei("10"), toWei("1"), toWei("1"), toWei("1")],
        )).to.be.revertedWith("value out of range");
    })

    it('updatePerpetualRiskParameter - exception', async () => {

        await governance.setOperatorNoAuth(user0.address);
        await expect(governance.updatePerpetualRiskParameter(0, [
            toWei("-1"),
            toWei("0.6"),
            toWei("0.45"),
            toWei("0.1"),
            toWei("5"),
            toWei("0.05"),
            toWei("0.04"),
            toWei("1")
        ])).to.be.revertedWith("halfSpread < 0");
        await expect(governance.updatePerpetualRiskParameter(0, [
            toWei("1"),
            toWei("0.6"),
            toWei("0.45"),
            toWei("0.1"),
            toWei("5"),
            toWei("0.05"),
            toWei("0.04"),
            toWei("1")
        ])).to.be.revertedWith("halfSpread >= 100%");

        await expect(governance.updatePerpetualRiskParameter(0, [
            toWei("0.5"),
            toWei("-0.1"),
            toWei("0.45"),
            toWei("0.1"),
            toWei("5"),
            toWei("0.05"),
            toWei("0.04"),
            toWei("1")
        ])).to.be.revertedWith("openSlippageFactor < 0");

        await expect(governance.updatePerpetualRiskParameter(0, [
            toWei("0.5"),
            toWei("0.6"),
            toWei("-0.1"),
            toWei("0.1"),
            toWei("5"),
            toWei("0.05"),
            toWei("0.04"),
            toWei("1")
        ])).to.be.revertedWith("closeSlippageFactor < 0");

        await expect(governance.updatePerpetualRiskParameter(0, [
            toWei("0.5"),
            toWei("0.6"),
            toWei("0.8"),
            toWei("0.1"),
            toWei("5"),
            toWei("0.05"),
            toWei("0.04"),
            toWei("1")
        ])).to.be.revertedWith("closeSlippageFactor > openSlippageFactor");

        await expect(governance.updatePerpetualRiskParameter(0, [
            toWei("0.5"),
            toWei("0.6"),
            toWei("0.45"),
            toWei("-0.1"),
            toWei("5"),
            toWei("0.05"),
            toWei("0.04"),
            toWei("1")
        ])).to.be.revertedWith("fundingRateLimit < 0");
        await expect(governance.updatePerpetualRiskParameter(0, [
            toWei("0.5"),
            toWei("0.6"),
            toWei("0.45"),
            toWei("0.1"),
            toWei("5"),
            toWei("0.05"),
            toWei("-0.04"),
            toWei("1")
        ])).to.be.revertedWith("fundingRateFactor < 0");
        await expect(governance.updatePerpetualRiskParameter(0, [
            toWei("0.5"),
            toWei("0.6"),
            toWei("0.45"),
            toWei("0.1"),
            toWei("-5"),
            toWei("0.05"),
            toWei("0.04"),
            toWei("1")
        ])).to.be.revertedWith("ammMaxLeverage < 0");
        await expect(governance.updatePerpetualRiskParameter(0, [
            toWei("0.5"),
            toWei("0.6"),
            toWei("0.45"),
            toWei("0.1"),
            toWei("5"),
            toWei("-0.05"),
            toWei("0.04"),
            toWei("1")
        ])).to.be.revertedWith("maxClosePriceDiscount < 0");
        await expect(governance.updatePerpetualRiskParameter(0, [
            toWei("0.5"),
            toWei("0.6"),
            toWei("0.45"),
            toWei("0.1"),
            toWei("5"),
            toWei("1"),
            toWei("0.04"),
            toWei("1")
        ])).to.be.revertedWith("maxClosePriceDiscount >= 100%");
    })

    it('updatePerpetualRiskParameter', async () => {
        await governance.setOperatorNoAuth(user1.address);
        await expect(governance.updatePerpetualRiskParameter(0, [
            toWei("0.5"),
            toWei("0.6"),
            toWei("0.45"),
            toWei("0.1"),
            toWei("5"),
            toWei("0.05"),
            toWei("0.04"),
            toWei("1")
        ])).to.be.revertedWith("operator is allowed");

        await governance.setOperatorNoAuth(user0.address);
        await governance.updatePerpetualRiskParameter(0, [
            toWei("0.1"),
            toWei("0.6"),
            toWei("0.45"),
            toWei("0.1"),
            toWei("5"),
            toWei("0.05"),
            toWei("0.04"),
            toWei("1")
        ]);
        await governance.updatePerpetualRiskParameter(0, [
            toWei("0.9"),
            toWei("0.6"),
            toWei("0.45"),
            toWei("0.1"),
            toWei("5"),
            toWei("0.05"),
            toWei("0.04"),
            toWei("1")
        ]);
        await expect(governance.updatePerpetualRiskParameter(0, [
            toWei("0.99"),
            toWei("0.6"),
            toWei("0.45"),
            toWei("0.1"),
            toWei("5"),
            toWei("0.05"),
            toWei("0.04"),
            toWei("1")
        ])).to.be.revertedWith("value out of range");
        await expect(governance.updatePerpetualRiskParameter(0, [
            toWei("0.001"),
            toWei("0.6"),
            toWei("0.45"),
            toWei("0.1"),
            toWei("5"),
            toWei("0.05"),
            toWei("0.04"),
            toWei("1")
        ])).to.be.revertedWith("value out of range");
    })

    it("setLiquidityPoolParameter", async () => {
        await governance.setGovernor(user1.address);
        await governance.connect(user1).setLiquidityPoolParameter([1, 1000, 0, 1]);

        expect(await governance.isFastCreationEnabled()).to.be.true;
        await expect(governance.connect(user1).setLiquidityPoolParameter([0, -1, 0, 1])).to.be.revertedWith("insuranceFundCap < 0");
        await governance.connect(user1).setLiquidityPoolParameter([0, 1000, 0, 1]);
        expect(await governance.isFastCreationEnabled()).to.be.false;

        await expect(governance.setLiquidityPoolParameter([1, 1000, 0, 1])).to.be.revertedWith("only governor is allowed");
    })
})
