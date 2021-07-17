import BigNumber from 'bignumber.js';
import { expect, use } from "chai";
import {
    toWei,
    fromWei,
    toBytes32,
    getAccounts,
    createContract,
    deployPoolCreator,
} from '../scripts/utils';
import "./helper";


describe('LiquidityPool', () => {
    let accounts;
    let user0;
    let user1;
    let user2;
    let user3;
    let liquidityPool;

    before(async () => {
        accounts = await getAccounts();
        user0 = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];
    })

    beforeEach(async () => {
        const CollateralModule = await createContract("CollateralModule")
        const PerpetualModule = await createContract("PerpetualModule");
        const AMMModule = await createContract("AMMModule");
        const LiquidityPoolModule = await createContract("LiquidityPoolModule", [], {
            AMMModule,
            CollateralModule,
            PerpetualModule
        });
        const LiquidityPoolModule2 = await createContract("LiquidityPoolModule2", [], {
            CollateralModule,
            PerpetualModule,
            LiquidityPoolModule
        });
        liquidityPool = await createContract("TestLiquidityPool", [], {
            LiquidityPoolModule,
            LiquidityPoolModule2,
            CollateralModule,
            PerpetualModule
        });
    });

    describe("2 liquidityPool group", async () => {
        let oracle0;
        let oracle1;

        beforeEach(async () => {
            oracle0 = await createContract("OracleAdaptor", ["USD", "ETH"]);
            oracle1 = await createContract("OracleAdaptor", ["USD", "ETH"]);
            var now = 1000;
            await oracle0.setMarkPrice(toWei("100"), now);
            await oracle0.setIndexPrice(toWei("100"), now);
            await oracle1.setMarkPrice(toWei("100"), now);
            await oracle1.setIndexPrice(toWei("100"), now);
            await liquidityPool.createPerpetual(
                oracle0.address,
                // imr         mmr            operatorfr       lpfr             rebate      penalty         keeper      insur       oi
                [toWei("0.1"), toWei("0.05"), toWei("0.0001"), toWei("0.0007"), toWei("0"), toWei("0.005"), toWei("1"), toWei("0"), toWei("1")],
                [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei('0.05'), toWei("0.01"), toWei("1")],
            )
            await liquidityPool.createPerpetual(
                oracle1.address,
                // imr         mmr           operatorfr       lpfr             rebate      penalty         keeper      insur       oi
                [toWei("0.2"), toWei("0.1"), toWei("0.0001"), toWei("0.0007"), toWei("0"), toWei("0.005"), toWei("1"), toWei("0"), toWei("1")],
                [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei('0.05'), toWei("0.01"), toWei("1")],
            )
            await liquidityPool.setState(0, 2);
            await liquidityPool.setState(1, 2);
        })

        it("updatePrice", async () => {
            var now = 1000;
            await oracle0.setMarkPrice(toWei("100"), now);
            await oracle0.setIndexPrice(toWei("101"), now);
            await oracle1.setMarkPrice(toWei("200"), now);
            await oracle1.setIndexPrice(toWei("201"), now);

            await liquidityPool.updatePrice(1000);
            expect(await liquidityPool.getMarkPrice(0)).to.equal(toWei("100"));
            expect(await liquidityPool.getIndexPrice(0)).to.equal(toWei("101"));
            expect(await liquidityPool.getMarkPrice(1)).to.equal(toWei("200"));
            expect(await liquidityPool.getIndexPrice(1)).to.equal(toWei("201"));

            now = 2000;
            await oracle0.setMarkPrice(toWei("100.1"), now);
            await oracle0.setIndexPrice(toWei("101.1"), now);
            await oracle1.setMarkPrice(toWei("200.1"), now);
            await oracle1.setIndexPrice(toWei("201.1"), now);

            await liquidityPool.updatePrice(1000);
            expect(await liquidityPool.getMarkPrice(0)).to.equal(toWei("100.1"));
            expect(await liquidityPool.getIndexPrice(0)).to.equal(toWei("101.1"));
            expect(await liquidityPool.getMarkPrice(1)).to.equal(toWei("200.1"));
            expect(await liquidityPool.getIndexPrice(1)).to.equal(toWei("201.1"));

            now = 1000;
            await oracle0.setMarkPrice(toWei("100"), now);
            await oracle0.setIndexPrice(toWei("101"), now);
            await oracle1.setMarkPrice(toWei("200"), now);
            await oracle1.setIndexPrice(toWei("201"), now);
            await liquidityPool.updatePrice(2000);
            expect(await liquidityPool.getMarkPrice(0)).to.equal(toWei("100.1"));
            expect(await liquidityPool.getIndexPrice(0)).to.equal(toWei("101.1"));
            expect(await liquidityPool.getMarkPrice(1)).to.equal(toWei("200.1"));
            expect(await liquidityPool.getIndexPrice(1)).to.equal(toWei("201.1"));
        })

        it("getAvailablePoolCash", async () => {
            var now = 1000;
            await oracle0.setMarkPrice(toWei("100"), now);
            await oracle0.setIndexPrice(toWei("100"), now);
            await oracle1.setMarkPrice(toWei("200"), now);
            await oracle1.setIndexPrice(toWei("200"), now);
            await liquidityPool.updatePrice(1000);

            await liquidityPool.setMarginAccount(0, liquidityPool.address, toWei("100"), toWei("1"));
            await liquidityPool.setMarginAccount(1, liquidityPool.address, toWei("50"), toWei("-1"));
            await liquidityPool.setPoolCash(toWei("10"));
            // all = 10 + [100 + (1*100 - 1*100*0.1)] + [50 + (-1*200 - |-1*200|*0.2)]
            //     = 10 + 190 - 190
            expect(await liquidityPool.getAvailablePoolCash(0)).to.equal(toWei("-180"));
            expect(await liquidityPool.getAvailablePoolCash(2)).to.equal(toWei("10"));

            await liquidityPool.setMarginAccount(0, liquidityPool.address, toWei("100"), toWei("1"));
            await liquidityPool.setMarginAccount(1, liquidityPool.address, toWei("50"), toWei("-1"));
            await liquidityPool.setPoolCash(toWei("-100"));
            // all = 10 + [100 + (1*100 - 1*100*0.1)] + [50 + (-1*200 - |-1*200|*0.2)]
            //     = 10 + 190 - 190
            expect(await liquidityPool.getAvailablePoolCash(0)).to.equal(toWei("-290"));
            expect(await liquidityPool.getAvailablePoolCash(2)).to.equal(toWei("-100"));
        })

        it("rebalance", async () => {
            var now = 1000;
            await oracle0.setMarkPrice(toWei("100"), now);
            await oracle0.setIndexPrice(toWei("100"), now);
            await oracle1.setMarkPrice(toWei("100"), now);
            await oracle1.setIndexPrice(toWei("100"), now);
            await liquidityPool.updatePrice(1000);

            // no pos
            await liquidityPool.setPoolCash(toWei("10"));
            await liquidityPool.setMarginAccount(0, liquidityPool.address, toWei("100"), toWei("0")); // im = 10
            await liquidityPool.setTotalCollateral(0, toWei("100"));

            await liquidityPool.rebalance(0);
            expect(await liquidityPool.getTotalCollateral(0)).to.equal(toWei("0"));
            expect(await liquidityPool.getPoolCash()).to.equal(toWei("110"));
            var { cash, position } = await liquidityPool.callStatic.getMarginAccount(0, liquidityPool.address);
            expect(cash).to.equal(toWei("0"));
            expect(position).to.equal(toWei("0"));

            // =pos
            await liquidityPool.setPoolCash(toWei("10"));
            await liquidityPool.setMarginAccount(0, liquidityPool.address, toWei("-90"), toWei("1")); // im = 10
            await liquidityPool.setTotalCollateral(0, toWei("10"));
            await liquidityPool.rebalance(0);
            expect(await liquidityPool.getTotalCollateral(0)).to.equal(toWei("10"));
            expect(await liquidityPool.getPoolCash()).to.equal(toWei("10"));
            var { cash, position } = await liquidityPool.callStatic.getMarginAccount(0, liquidityPool.address);
            expect(cash).to.equal(toWei("-90"));
            expect(position).to.equal(toWei("1"));

            // +pos
            await liquidityPool.setPoolCash(toWei("10"));
            await liquidityPool.setMarginAccount(0, liquidityPool.address, toWei("100"), toWei("1")); // im = 10
            await liquidityPool.setTotalCollateral(0, toWei("200"));
            await liquidityPool.rebalance(0);
            expect(await liquidityPool.getTotalCollateral(0)).to.equal(toWei("10"));
            expect(await liquidityPool.getPoolCash()).to.equal(toWei("200"));
            var { cash, position } = await liquidityPool.callStatic.getMarginAccount(0, liquidityPool.address);
            expect(cash).to.equal(toWei("-90"));
            expect(position).to.equal(toWei("1"));

            // -pos
            await liquidityPool.setPoolCash(toWei("120"));
            await liquidityPool.setMarginAccount(0, liquidityPool.address, toWei("-200"), toWei("1")); // im = 10 / m = -100
            await liquidityPool.setTotalCollateral(0, toWei("200"));
            await liquidityPool.rebalance(0);
            expect(await liquidityPool.getTotalCollateral(0)).to.equal(toWei("310"));
            expect(await liquidityPool.getPoolCash()).to.equal(toWei("10"));
            var { cash, position } = await liquidityPool.callStatic.getMarginAccount(0, liquidityPool.address);
            expect(cash).to.equal(toWei("-90"));
            expect(position).to.equal(toWei("1"));

            // -pos but only 10 available
            await liquidityPool.setPoolCash(toWei("10"));
            await liquidityPool.setMarginAccount(0, liquidityPool.address, toWei("-200"), toWei("1")); // im = 10 / m = -100
            await liquidityPool.setTotalCollateral(0, toWei("200"));
            await liquidityPool.rebalance(0);
            expect(await liquidityPool.getTotalCollateral(0)).to.equal(toWei("210"));
            expect(await liquidityPool.getPoolCash()).to.equal(toWei("0"));
            var { cash, position } = await liquidityPool.callStatic.getMarginAccount(0, liquidityPool.address);
            expect(cash).to.equal(toWei("-190"));
            expect(position).to.equal(toWei("1"));
        })

        it("rebalance - 2", async () => {
            var now = 1000;
            await oracle0.setMarkPrice(toWei("100"), now);
            await oracle0.setIndexPrice(toWei("100"), now);
            await oracle1.setMarkPrice(toWei("200"), now);
            await oracle1.setIndexPrice(toWei("200"), now);
            await liquidityPool.updatePrice(1000);

            await liquidityPool.setPoolCash(toWei("0"));
            await liquidityPool.setMarginAccount(0, liquidityPool.address, toWei("-100"), toWei("1")); // im = 10 / m = 0
            await liquidityPool.setTotalCollateral(0, toWei("200"));
            await liquidityPool.setMarginAccount(1, liquidityPool.address, toWei("200"), toWei("1")); // im = 40 / m = 400 // available = 360
            await liquidityPool.setTotalCollateral(1, toWei("250"));
            await liquidityPool.rebalance(0);
            expect(await liquidityPool.getPoolCash()).to.equal(toWei("-10"));
            expect(await liquidityPool.getTotalCollateral(0)).to.equal(toWei("210"));
            var { cash, position } = await liquidityPool.callStatic.getMarginAccount(0, liquidityPool.address);
            expect(cash).to.equal(toWei("-90"));
            expect(position).to.equal(toWei("1"));

            await liquidityPool.setPoolCash(toWei("0"));
            await liquidityPool.setMarginAccount(0, liquidityPool.address, toWei("-500"), toWei("1")); // im = 10 / m = -400
            await liquidityPool.setTotalCollateral(0, toWei("200"));
            await liquidityPool.setMarginAccount(1, liquidityPool.address, toWei("200"), toWei("1")); // im = 40 / m = 400 // available = 360
            await liquidityPool.setTotalCollateral(1, toWei("250"));
            await liquidityPool.rebalance(0);
            expect(await liquidityPool.getPoolCash()).to.equal(toWei("-360"));
            expect(await liquidityPool.getTotalCollateral(0)).to.equal(toWei("560"));
            var { cash, position } = await liquidityPool.callStatic.getMarginAccount(0, liquidityPool.address);
            expect(cash).to.equal(toWei("-140")); // -500 + 360
            expect(position).to.equal(toWei("1"));
        })
    })

    describe("operator", async () => {

        it("transferOperator", async () => {
            var poolCreator = await createContract("TestTracer");
            await poolCreator.testRegisterLiquidityPool(liquidityPool.address, user0.address);

            await liquidityPool.setFactory(poolCreator.address);
            await liquidityPool.setOperator(user0.address);
            expect(await liquidityPool.getOperator()).to.equal(user0.address);

            await expect(liquidityPool.transferOperator("0x0000000000000000000000000000000000000000")).to.be.revertedWith("new operator is invalid");

            await liquidityPool.transferOperator(user1.address);
            expect(await liquidityPool.getOperator()).to.equal(user0.address);
            expect(await liquidityPool.getTransferringOperator()).to.equal(user1.address);
            await expect(liquidityPool.connect(user2).claimOperator()).to.be.revertedWith("caller is not qualified");

            await liquidityPool.transferOperator(user2.address);
            expect(await liquidityPool.getOperator()).to.equal(user0.address);
            expect(await liquidityPool.getTransferringOperator()).to.equal(user2.address);

            await liquidityPool.connect(user2).claimOperator();
            expect(await liquidityPool.getOperator()).to.equal(user2.address);
            expect(await liquidityPool.getTransferringOperator()).to.equal("0x0000000000000000000000000000000000000000");

            await liquidityPool.connect(user2).revokeOperator();
            expect(await liquidityPool.getOperator()).to.equal("0x0000000000000000000000000000000000000000");
            expect(await liquidityPool.getTransferringOperator()).to.equal("0x0000000000000000000000000000000000000000");

        })
    })

    describe("trader", async () => {
        let poolCreator;
        let oracle;
        let ctk;

        beforeEach(async () => {
            poolCreator = await createContract("TestTracer");
            oracle = await createContract("OracleAdaptor", ["USD", "ETH"]);
            var now = 1000;
            await oracle.setMarkPrice(toWei("100"), now);
            await oracle.setIndexPrice(toWei("100"), now);
            ctk = await createContract("CustomERC20", ["collateral", "CTK", 18]);

            await liquidityPool.setCollateralToken(ctk.address, 18);
            await liquidityPool.createPerpetual(
                oracle.address,
                // imr         mmr            operatorfr       lpfr             rebate      penalty         keeper      insur       oi
                [toWei("0.1"), toWei("0.05"), toWei("0.0001"), toWei("0.0007"), toWei("0"), toWei("0.005"), toWei("1"), toWei("0"), toWei("1")],
                [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei('0.05'), toWei("0.01"), toWei("1")],
            )
            await liquidityPool.setState(0, 2);

            await liquidityPool.setOperator(user0.address);
            await liquidityPool.setFactory(poolCreator.address);
            await poolCreator.testRegisterLiquidityPool(liquidityPool.address, user0.address);
        })

        it("donateInsuranceFund", async () => {
            await ctk.mint(user0.address, toWei("100"));
            await ctk.connect(user0).approve(liquidityPool.address, toWei("100"));

            expect(await ctk.balanceOf(user0.address), toWei("100"));

            expect(await liquidityPool.getDonatedInsuranceFund()).to.equal(toWei("0"));
            await liquidityPool.donateInsuranceFundP(toWei("10"));
            expect(await liquidityPool.getDonatedInsuranceFund()).to.equal(toWei("10"));
            expect(await liquidityPool.getTotalCollateral(0)).to.equal(toWei("0"));

            await liquidityPool.donateInsuranceFundP(toWei("11"));
            expect(await liquidityPool.getDonatedInsuranceFund()).to.equal(toWei("21"));
            expect(await liquidityPool.getTotalCollateral(0)).to.equal(toWei("0"));

            expect(await ctk.balanceOf(user0.address), toWei("79"));
            expect(await ctk.balanceOf(liquidityPool.address), toWei("21"));
            await expect(liquidityPool.donateInsuranceFund(toWei("0"))).to.be.revertedWith("invalid amount");
            await expect(liquidityPool.donateInsuranceFund(toWei("-1"))).to.be.revertedWith("invalid amount");
        })

        it("deposit", async () => {
            await liquidityPool.setState(0, 2);

            await ctk.mint(user0.address, toWei("100"));
            await ctk.connect(user0).approve(liquidityPool.address, toWei("100"));
            expect(await ctk.balanceOf(user0.address), toWei("100"));

            expect(await poolCreator.isActiveLiquidityPoolOf(user0.address, liquidityPool.address, 0)).to.be.false;

            await liquidityPool.depositP(0, user0.address, toWei("10"));
            var { cash, position } = await liquidityPool.callStatic.getMarginAccount(0, user0.address);
            expect(cash).to.equal(toWei("10")); // -500 + 360
            expect(position).to.equal(toWei("0"));
            expect(await ctk.balanceOf(user0.address), toWei("90"));
            expect(await ctk.balanceOf(liquidityPool.address), toWei("10"));

            expect(await poolCreator.isActiveLiquidityPoolOf(user0.address, liquidityPool.address, 0)).to.be.true;

        })

        it("withdraw", async () => {
            await liquidityPool.setState(0, 2);

            await ctk.mint(user0.address, toWei("100"));
            await ctk.connect(user0).approve(liquidityPool.address, toWei("100"));

            await liquidityPool.depositP(0, user0.address, toWei("10"));
            expect(await poolCreator.isActiveLiquidityPoolOf(user0.address, liquidityPool.address, 0)).to.be.true;
            expect(await ctk.balanceOf(user0.address), toWei("90"));
            expect(await ctk.balanceOf(liquidityPool.address), toWei("10"));

            await liquidityPool.withdrawP(0, user0.address, toWei("10"));
            var { cash, position } = await liquidityPool.callStatic.getMarginAccount(0, user0.address);
            expect(cash).to.equal(toWei("0")); // -500 + 360
            expect(position).to.equal(toWei("0"));
            expect(await ctk.balanceOf(user0.address), toWei("100"));
            expect(await ctk.balanceOf(liquidityPool.address), toWei("00"));

            expect(await poolCreator.isActiveLiquidityPoolOf(user0.address, liquidityPool.address, 0)).to.be.false;
        })

        it("clear-no-account", async () => {
            await liquidityPool.setState(0, 2);
            const keeper = accounts[9];

            expect(await liquidityPool.getPoolCash()).to.equal(toWei("0"))

            await liquidityPool.setEmergencyState(0);
            await liquidityPool.connect(keeper).clearP(0);

            expect(await liquidityPool.getState(0)).to.equal(4)
            expect(await ctk.balanceOf(liquidityPool.address)).to.equal(toWei("0"))
            expect(await ctk.balanceOf(keeper.address)).to.equal(toWei("0"));
            expect(await liquidityPool.getPoolCash()).to.equal(toWei("0"))
        })

        it("clear", async () => {
            await liquidityPool.setState(0, 2);
            const keeper = accounts[9];

            await ctk.mint(user0.address, toWei("100"));
            await ctk.connect(user0).approve(liquidityPool.address, toWei("100"));
            await ctk.mint(user1.address, toWei("100"));
            await ctk.connect(user1).approve(liquidityPool.address, toWei("100"));
            await ctk.mint(user2.address, toWei("100"));
            await ctk.connect(user2).approve(liquidityPool.address, toWei("100"));
            await ctk.mint(user3.address, toWei("100"));
            await ctk.connect(user3).approve(liquidityPool.address, toWei("100"));

            await liquidityPool.connect(user0).depositP(0, user0.address, toWei("1"));
            await liquidityPool.connect(user1).depositP(0, user1.address, toWei("2"));
            await liquidityPool.connect(user2).depositP(0, user2.address, toWei("3"));
            await liquidityPool.connect(user3).depositP(0, user3.address, toWei("4"));

            expect(await ctk.balanceOf(liquidityPool.address)).to.equal(toWei("10"))
            expect(await ctk.balanceOf(keeper.address)).to.equal(toWei("0"))
            expect(await liquidityPool.getPoolCash()).to.equal(toWei("0"))

            await liquidityPool.setEmergencyState(0);
            await liquidityPool.connect(keeper).clearP(0);
            await liquidityPool.connect(keeper).clearP(0);
            await liquidityPool.connect(keeper).clearP(0);
            await liquidityPool.connect(keeper).clearP(0);

            expect(await ctk.balanceOf(liquidityPool.address)).to.equal(toWei("6"))
            expect(await ctk.balanceOf(keeper.address)).to.equal(toWei("4"));
            expect(await liquidityPool.getPoolCash()).to.equal(toWei("0"))
        })

        it("clear - 2", async () => {
            await liquidityPool.setState(0, 2);
            const keeper = accounts[9];

            var now = 1000;
            await oracle.setMarkPrice(toWei("100"), now);
            await oracle.setIndexPrice(toWei("100"), now);
            await liquidityPool.updatePrice(1000);

            await ctk.mint(user0.address, toWei("100"));
            await ctk.connect(user0).approve(liquidityPool.address, toWei("100"));
            await ctk.mint(user1.address, toWei("100"));
            await ctk.connect(user1).approve(liquidityPool.address, toWei("100"));
            await ctk.mint(user2.address, toWei("100"));
            await ctk.connect(user2).approve(liquidityPool.address, toWei("100"));
            await ctk.mint(user3.address, toWei("100"));
            await ctk.connect(user3).approve(liquidityPool.address, toWei("100"));

            await ctk.mint(liquidityPool.address, toWei("5"));
            await liquidityPool.setTotalCollateral(0, toWei("5"));
            await liquidityPool.setMarginAccount(0, liquidityPool.address, toWei("0"), toWei("0.05")); // 0.05 * 100 = 5 | 0.5(im) + 4.5(cash)

            await liquidityPool.connect(user0).depositP(0, user0.address, toWei("1"));
            await liquidityPool.connect(user1).depositP(0, user1.address, toWei("2"));
            await liquidityPool.connect(user2).depositP(0, user2.address, toWei("3"));
            await liquidityPool.connect(user3).depositP(0, user3.address, toWei("4"));

            expect(await ctk.balanceOf(liquidityPool.address)).to.equal(toWei("15"))
            expect(await ctk.balanceOf(keeper.address)).to.equal(toWei("0"))
            expect(await liquidityPool.getPoolCash()).to.equal(toWei("0"))
            expect(await liquidityPool.getTotalCollateral(0)).to.equal(toWei("15"))

            await liquidityPool.setEmergencyState(0);
            expect(await liquidityPool.getTotalCollateral(0)).to.equal(toWei("10.5"))

            await liquidityPool.connect(keeper).clearP(0);
            await liquidityPool.connect(keeper).clearP(0);
            await liquidityPool.connect(keeper).clearP(0);
            await liquidityPool.connect(keeper).clearP(0);

            expect(await liquidityPool.getRedemptionRateWithoutPosition(0)).to.equal(toWei("0.65"));
            expect(await liquidityPool.getRedemptionRateWithPosition(0)).to.equal(toWei("0"));

            expect(await liquidityPool.getState(0)).to.equal(4);
            expect(await ctk.balanceOf(liquidityPool.address)).to.equal(toWei("11"))
            expect(await ctk.balanceOf(keeper.address)).to.equal(toWei("4"));
            expect(await liquidityPool.getTotalCollateral(0)).to.equal(toWei("6.5"))
            expect(await liquidityPool.getPoolCash()).to.equal(toWei("4.5"));
        })

        it("clear - 3", async () => {
            await liquidityPool.setState(0, 2);
            const keeper = accounts[9];
            await liquidityPool.setPerpetualBaseParameter(0, toBytes32("keeperGasReward"), 0);

            var now = 1000;
            await oracle.setMarkPrice(toWei("100"), now);
            await oracle.setIndexPrice(toWei("100"), now);
            await liquidityPool.updatePrice(1000);

            await ctk.mint(user0.address, toWei("100"));
            await ctk.connect(user0).approve(liquidityPool.address, toWei("100"));
            await ctk.mint(user1.address, toWei("100"));
            await ctk.connect(user1).approve(liquidityPool.address, toWei("100"));
            await ctk.mint(user2.address, toWei("100"));
            await ctk.connect(user2).approve(liquidityPool.address, toWei("100"));
            await ctk.mint(user3.address, toWei("100"));
            await ctk.connect(user3).approve(liquidityPool.address, toWei("100"));

            await ctk.mint(liquidityPool.address, toWei("0.1"));
            await liquidityPool.setTotalCollateral(0, toWei("0.1"));
            await liquidityPool.setMarginAccount(0, liquidityPool.address, toWei("-4.5"), toWei("0.05")); // 0.05 * 100 = 5 | 0.5(im) + 4.5(cash)

            await liquidityPool.connect(user0).depositP(0, user0.address, toWei("1"));
            await liquidityPool.connect(user1).depositP(0, user1.address, toWei("2"));
            await liquidityPool.connect(user2).depositP(0, user2.address, toWei("3"));
            await liquidityPool.connect(user3).depositP(0, user3.address, toWei("4"));

            expect(await ctk.balanceOf(liquidityPool.address)).to.equal(toWei("10.1"))
            expect(await ctk.balanceOf(keeper.address)).to.equal(toWei("0"))
            expect(await liquidityPool.getPoolCash()).to.equal(toWei("0"))
            expect(await liquidityPool.getTotalCollateral(0)).to.equal(toWei("10.1"))

            await liquidityPool.setEmergencyState(0);
            expect(await liquidityPool.getTotalCollateral(0)).to.equal(toWei("10.1"))

            await liquidityPool.connect(keeper).clearP(0);
            await liquidityPool.connect(keeper).clearP(0);
            await liquidityPool.connect(keeper).clearP(0);
            await liquidityPool.connect(keeper).clearP(0);

            expect(await liquidityPool.getRedemptionRateWithoutPosition(0)).to.equal(toWei("1"));
            expect(await liquidityPool.getRedemptionRateWithPosition(0)).to.equal(toWei("0.2"));

            expect(await liquidityPool.getState(0)).to.equal(4);
            expect(await ctk.balanceOf(keeper.address)).to.equal(toWei("0"));
            expect(await ctk.balanceOf(liquidityPool.address)).to.equal(toWei("10.1"))
            expect(await liquidityPool.getTotalCollateral(0)).to.equal(toWei("10"))
            expect(await liquidityPool.getPoolCash()).to.equal(toWei("0.1"));
        })

        it("settle", async () => {
            await liquidityPool.setState(0, 2);
            await liquidityPool.setPerpetualBaseParameter(0, toBytes32("keeperGasReward"), 0);

            var now = Math.floor(Date.now() / 1000);
            await oracle.setMarkPrice(toWei("100"), now);
            await oracle.setIndexPrice(toWei("100"), now);
            await liquidityPool.updatePrice(1000);

            await liquidityPool.registerActiveAccount(0, user0.address);
            await liquidityPool.registerActiveAccount(0, user1.address);
            await liquidityPool.registerActiveAccount(0, user2.address);
            await liquidityPool.registerActiveAccount(0, user3.address);
            await liquidityPool.setMarginAccount(0, user0.address, toWei("100"), toWei("0"));
            await liquidityPool.setMarginAccount(0, user1.address, toWei("200"), toWei("0"));
            await liquidityPool.setMarginAccount(0, user2.address, toWei("-200"), toWei("1"));
            await liquidityPool.setMarginAccount(0, user3.address, toWei("0"), toWei("1"));
            await liquidityPool.setTotalCollateral(0, toWei("350"))
            await ctk.mint(liquidityPool.address, toWei("350"));


            await liquidityPool.setEmergencyState(0);
            await liquidityPool.clearP(0);
            await liquidityPool.clearP(0);
            await liquidityPool.clearP(0);
            await liquidityPool.clearP(0);

            // console.log(fromWei(await liquidityPool.getTotalMarginWithPosition(0)));
            // console.log(fromWei(await liquidityPool.getTotalMarginWithoutPosition(0)));
            // p = 100, nop = 300
            // await liquidityPool.settleCollateral(0);
            expect(await liquidityPool.getRedemptionRateWithoutPosition(0)).to.equal(toWei("1"));
            expect(await liquidityPool.getRedemptionRateWithPosition(0)).to.equal(toWei("0.5"));

            expect(await liquidityPool.getSettleableMargin(0, user0.address)).to.equal(toWei("100"));
            expect(await liquidityPool.getSettleableMargin(0, user1.address)).to.equal(toWei("200"));
            expect(await liquidityPool.getSettleableMargin(0, user2.address)).to.equal(toWei("0"));
            expect(await liquidityPool.getSettleableMargin(0, user3.address)).to.equal(toWei("50"));


            expect(await liquidityPool.callStatic.settle(0, user0.address)).to.equal(toWei("100"));
            await liquidityPool.settleP(0, user0.address);
            var { cash, position } = await liquidityPool.callStatic.getMarginAccount(0, user0.address);
            expect(cash).to.equal(toWei("0"));
            expect(position).to.equal(toWei("0"));
            await expect(liquidityPool.settleP(0, user0.address)).to.be.revertedWith("no margin to settle")

            expect(await liquidityPool.getTotalCollateral(0)).to.equal(toWei("250"));

            expect(await liquidityPool.callStatic.settle(0, user1.address)).to.equal(toWei("200"));
            await liquidityPool.settleP(0, user1.address);
            var { cash, position } = await liquidityPool.callStatic.getMarginAccount(0, user1.address);
            expect(cash).to.equal(toWei("0"));
            expect(position).to.equal(toWei("0"));
            expect(await liquidityPool.getTotalCollateral(0)).to.equal(toWei("50"));

            expect(await liquidityPool.callStatic.settle(0, user2.address)).to.equal(toWei("0"));
            await expect(liquidityPool.settleP(0, user2.address)).to.be.revertedWith("no margin to settle")

            expect(await liquidityPool.callStatic.settle(0, user3.address)).to.equal(toWei("50"));
            await liquidityPool.settleP(0, user3.address);
            var { cash, position } = await liquidityPool.callStatic.getMarginAccount(0, user3.address);
            expect(cash).to.equal(toWei("0"));
            expect(position).to.equal(toWei("0"));
            expect(await liquidityPool.getTotalCollateral(0)).to.equal(toWei("0"));
        })

        it("updateInsuranceFund", async () => {
            await liquidityPool.setLiquidityPoolParameter(toBytes32("insuranceFundCap"), toWei("100"));

            expect(await liquidityPool.getInsuranceFund()).to.equal(toWei("0"));
            expect(await liquidityPool.getDonatedInsuranceFund()).to.equal(toWei("0"));

            expect(await liquidityPool.callStatic.updateInsuranceFund(toWei("1"))).to.equal(toWei("0"))
            await liquidityPool.updateInsuranceFund(toWei("100"));
            expect(await liquidityPool.getInsuranceFund()).to.equal(toWei("100"));

            expect(await liquidityPool.callStatic.updateInsuranceFund(toWei("1"))).to.equal(toWei("1"))
            await liquidityPool.updateInsuranceFund(toWei("1"));
            expect(await liquidityPool.getInsuranceFund()).to.equal(toWei("100"));
            expect(await liquidityPool.getDonatedInsuranceFund()).to.equal(toWei("0"));

            expect(await liquidityPool.callStatic.updateInsuranceFund(toWei("-100"))).to.equal(toWei("0"))
            await liquidityPool.updateInsuranceFund(toWei("-100"));
            expect(await liquidityPool.getInsuranceFund()).to.equal(toWei("0"));
            expect(await liquidityPool.getDonatedInsuranceFund()).to.equal(toWei("0"));

            await expect(liquidityPool.updateInsuranceFund(toWei("-1"))).to.be.revertedWith("negative donated insurance fund");;
        })

    })

})

