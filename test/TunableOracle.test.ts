const { ethers } = require("hardhat");
const { expect } = require("chai");
import {
    toWei,
    createContract,
    getAccounts,
    createLiquidityPoolFactory
} from "../scripts/utils";
import "./helper";

describe("TunableOracle", () => {
    let accounts;
    let register;
    let externalOracle;
    let oracle0;
    let now;
    let pool;

    before(async () => {
        accounts = await getAccounts();
    })

    beforeEach(async () => {
        // liquidity pool
        const LiquidityPoolFactory = await createLiquidityPoolFactory();
        var symbol = await createContract("SymbolService");
        await symbol.initialize(10000);
        let ctk = await createContract("CustomERC20", ["collateral", "CTK", 18]);
        var poolTemplate = await LiquidityPoolFactory.deploy();
        var govTemplate = await createContract("TestLpGovernor");
        let poolCreator = await createContract("PoolCreator");
        await poolCreator.initialize(symbol.address, accounts[9].address, toWei("0.001"));
        await poolCreator.addVersion(poolTemplate.address, govTemplate.address, 0, "initial version");
        await symbol.addWhitelistedFactory(poolCreator.address);

        const { liquidityPool, governor } = await poolCreator.callStatic.createLiquidityPool(
            ctk.address,
            18,
            998,
            ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1])
        );
        await poolCreator.createLiquidityPool(ctk.address, 18, 998, ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1]));
        pool = await LiquidityPoolFactory.attach(liquidityPool);
        // external oracle
        externalOracle = await createContract("OracleAdaptor", ["USD", "ETH"]);
        now = (await ethers.provider.getBlock()).timestamp;
        externalOracle.setMarkPrice(toWei("1000"), now - 10);
        // register and tunable oracle
        register = await createContract("TunableOracleRegister");
        await register.initialize();
        await register.setExternalOracle(externalOracle.address, toWei("0.01"), 60);
        let testTunableOracleImp = await createContract("TestTunableOracle");
        await register.upgradeTunableOracle(testTunableOracleImp.address);
        let tx = await register.newTunableOracle(pool.address, externalOracle.address);
        let receipt = await tx.wait()
        let oracleAddress = receipt["events"][0]["args"][2];
        oracle0 = await ethers.getContractAt("TestTunableOracle", oracleAddress);
        await oracle0.setFineTuner(accounts[0].address);
    })

    it("auth", async () => {
        // register change role
        await expect(register.connect(accounts[1]).setExternalOracle(externalOracle.address, toWei("0.01"), 60)).to.be.revertedWith("role");
        await expect(register.connect(accounts[1]).setTerminated(externalOracle.address)).to.be.revertedWith("role");
        await expect(register.connect(accounts[1]).setAllTerminated()).to.be.revertedWith("role");
        await register.grantRole(await register.DEFAULT_ADMIN_ROLE(), accounts[1].address);
        await register.grantRole(await register.TERMINATER_ROLE(), accounts[1].address);
        await register.connect(accounts[1]).setExternalOracle(externalOracle.address, toWei("0.01"), 60);
        await register.connect(accounts[1]).setTerminated(externalOracle.address);
        await register.connect(accounts[1]).setAllTerminated();

        await expect(oracle0.connect(accounts[1]).setPrice(toWei("1005"))).to.be.revertedWith("only FineTuner");
    })

    it("no fine tune", async () => {
        await register.setExternalOracle(externalOracle.address, toWei("0.01"), 60);
        let now2 = (await ethers.provider.getBlock()).timestamp;
        await oracle0.setBlockTimestamp(now2);
        let p = await oracle0.callStatic.priceTWAPShort();
        expect(p[0]).approximateBigNumber(toWei("1000"));
        expect(p[1]).to.equal(now2);
        p = await oracle0.callStatic.priceTWAPLong();
        expect(p[0]).approximateBigNumber(toWei("1000"));
        expect(p[1]).to.equal(now - 10);

        externalOracle.setMarkPrice(toWei("1100"), now2 + 1);
        p = await oracle0.callStatic.priceTWAPShort();
        expect(p[0]).approximateBigNumber(toWei("1100"));
        expect(p[1]).to.equal(now2); // time will <= block.time
        p = await oracle0.callStatic.priceTWAPLong();
        expect(p[0]).approximateBigNumber(toWei("1100"));
        expect(p[1]).to.equal(now2); // time will <= block.time
    })

    it("normal fine tune & reach deviation & reach timeout", async () => {
        await register.setExternalOracle(externalOracle.address, toWei("0.01"), 60);
        let now2 = (await ethers.provider.getBlock()).timestamp;
        await oracle0.setBlockTimestamp(now2);

        await oracle0.setPrice(toWei("1005"));
        await oracle0.setBlockTimestamp(now2 + 1);
        let p = await oracle0.callStatic.priceTWAPShort();
        expect(p[0]).approximateBigNumber(toWei("1005"));
        expect(p[1]).to.equal(now2);
        p = await oracle0.callStatic.priceTWAPLong();
        expect(p[0]).approximateBigNumber(toWei("1000"));
        expect(p[1]).to.equal(now - 10);

        // reach deviation
        externalOracle.setMarkPrice(toWei("1100"), now + 1);
        p = await oracle0.callStatic.priceTWAPShort();
        // 1100 * (1 - 0.01) = 1089
        expect(p[0]).approximateBigNumber(toWei("1089"));
        expect(p[1]).to.equal(now2);
        p = await oracle0.callStatic.priceTWAPLong();
        expect(p[0]).approximateBigNumber(toWei("1100"));
        expect(p[1]).to.equal(now + 1);

        // reach timeout, external does not change
        await oracle0.setBlockTimestamp(now + 1000);
        p = await oracle0.callStatic.priceTWAPShort();
        expect(p[0]).approximateBigNumber(toWei("1100"));
        expect(p[1]).to.equal(now + 1000);
        p = await oracle0.callStatic.priceTWAPLong();
        expect(p[0]).approximateBigNumber(toWei("1100"));
        expect(p[1]).to.equal(now + 1);

        // reach timeout, external changes
        externalOracle.setMarkPrice(toWei("1101"), now + 1002);
        p = await oracle0.callStatic.priceTWAPShort();
        expect(p[0]).approximateBigNumber(toWei("1101"));
        expect(p[1]).to.equal(now + 1000);
        p = await oracle0.callStatic.priceTWAPLong();
        expect(p[0]).approximateBigNumber(toWei("1101"));
        expect(p[1]).to.equal(now + 1000);
    })

    it("release", async () => {
        await register.setExternalOracle(externalOracle.address, toWei("0.01"), 60);
        let now2 = (await ethers.provider.getBlock()).timestamp;
        await oracle0.setBlockTimestamp(now2);
        await oracle0.setPrice(toWei("1005"));
        await oracle0.setBlockTimestamp(now2 + 1);
        let p = await oracle0.callStatic.priceTWAPShort();
        expect(p[0]).approximateBigNumber(toWei("1005"));
        expect(p[1]).to.equal(now2);
        p = await oracle0.callStatic.priceTWAPLong();
        expect(p[0]).approximateBigNumber(toWei("1000"));
        expect(p[1]).to.equal(now - 10);

        // release
        await oracle0.release();
        p = await oracle0.callStatic.priceTWAPShort();
        expect(p[0]).approximateBigNumber(toWei("1000"));
        expect(p[1]).to.equal(now2 + 1);
        p = await oracle0.callStatic.priceTWAPLong();
        expect(p[0]).approximateBigNumber(toWei("1000"));
        expect(p[1]).to.equal(now - 10);

        // fine tune again
        await oracle0.setPrice(toWei("1009"));
        p = await oracle0.callStatic.priceTWAPShort();
        expect(p[0]).approximateBigNumber(toWei("1009"));
        expect(p[1]).to.equal(now2 + 1);
        p = await oracle0.callStatic.priceTWAPLong();
        expect(p[0]).approximateBigNumber(toWei("1000"));
        expect(p[1]).to.equal(now - 10);
    })

    it("externalOracle terminated, we also terminated and price should not change", async () => {
        let now2 = (await ethers.provider.getBlock()).timestamp;
        await oracle0.setBlockTimestamp(now2);
        await oracle0.setPrice(toWei("1005"));
        await oracle0.setBlockTimestamp(now2 + 1);
        let p = await oracle0.callStatic.priceTWAPShort();
        expect(p[0]).approximateBigNumber(toWei("1005"));
        expect(p[1]).to.equal(now2);
        p = await oracle0.callStatic.priceTWAPLong();
        expect(p[0]).approximateBigNumber(toWei("1000"));
        expect(p[1]).to.equal(now - 10);

        await externalOracle.setTerminated(true);
        expect(await oracle0.callStatic.isTerminated()).to.equal(true);
        await expect(oracle0.setPrice(toWei("1009"))).to.be.revertedWith("terminated");

        await oracle0.setBlockTimestamp(now2 + 10);
        p = await oracle0.callStatic.priceTWAPShort();
        expect(p[0]).approximateBigNumber(toWei("1005"));
        expect(p[1]).to.equal(now2);
        p = await oracle0.callStatic.priceTWAPLong();
        expect(p[0]).approximateBigNumber(toWei("1000"));
        expect(p[1]).to.equal(now - 10);

        await oracle0.setBlockTimestamp(now2 + 1000);
        p = await oracle0.callStatic.priceTWAPShort();
        expect(p[0]).approximateBigNumber(toWei("1005"));
        expect(p[1]).to.equal(now2);
        p = await oracle0.callStatic.priceTWAPLong();
        expect(p[0]).approximateBigNumber(toWei("1000"));
        expect(p[1]).to.equal(now - 10);
    })

    it("we terminated, and price should not change", async () => {
        let now2 = (await ethers.provider.getBlock()).timestamp;
        await oracle0.setBlockTimestamp(now2);
        await oracle0.setPrice(toWei("1005"));
        await oracle0.setBlockTimestamp(now2 + 1);
        let p = await oracle0.callStatic.priceTWAPShort();
        expect(p[0]).approximateBigNumber(toWei("1005"));
        expect(p[1]).to.equal(now2);
        p = await oracle0.callStatic.priceTWAPLong();
        expect(p[0]).approximateBigNumber(toWei("1000"));
        expect(p[1]).to.equal(now - 10);

        await register.setTerminated(externalOracle.address);
        expect(await oracle0.callStatic.isTerminated()).to.equal(true);
        await expect(oracle0.setPrice(toWei("1009"))).to.be.revertedWith("terminated");
        externalOracle.setMarkPrice(toWei("1010"), now + 10);

        await oracle0.setBlockTimestamp(now2 + 10);
        p = await oracle0.callStatic.priceTWAPShort();
        expect(p[0]).approximateBigNumber(toWei("1005"));
        expect(p[1]).to.equal(now2);
        p = await oracle0.callStatic.priceTWAPLong();
        expect(p[0]).approximateBigNumber(toWei("1000"));
        expect(p[1]).to.equal(now - 10);

        await oracle0.setBlockTimestamp(now2 + 1000);
        p = await oracle0.callStatic.priceTWAPShort();
        expect(p[0]).approximateBigNumber(toWei("1005"));
        expect(p[1]).to.equal(now2);
        p = await oracle0.callStatic.priceTWAPLong();
        expect(p[0]).approximateBigNumber(toWei("1000"));
        expect(p[1]).to.equal(now - 10);
    })

    describe("Second external", () => {
        let second
        
        beforeEach(async () => {
            second = await createContract("OracleAdaptor", ["USD", "ETH"]);
            second.setMarkPrice(toWei("1001"), now - 9);
            second.setIndexPrice(toWei("1001"), now - 9);
            let p = await oracle0.callStatic.priceTWAPShort();
            oracle0.setSecondExternalOracle(second.address)
        })

        it("release", async () => {
            let now2 = (await ethers.provider.getBlock()).timestamp;
            
            // secondPrice is default
            await oracle0.setBlockTimestamp(now2);
            let p = await oracle0.callStatic.priceTWAPShort();
            expect(p[0]).approximateBigNumber(toWei("1001"));
            expect(p[1]).to.equal(now2);
            p = await oracle0.callStatic.priceTWAPLong();
            expect(p[0]).approximateBigNumber(toWei("1000"));
            expect(p[1]).to.equal(now - 10);

            // tune
            await oracle0.setBlockTimestamp(now2 + 1);
            await oracle0.setPrice(toWei("1005"));
            await oracle0.setBlockTimestamp(now2 + 1);
            p = await oracle0.callStatic.priceTWAPShort();
            expect(p[0]).approximateBigNumber(toWei("1005"));
            expect(p[1]).to.equal(now2 + 1);
            p = await oracle0.callStatic.priceTWAPLong();
            expect(p[0]).approximateBigNumber(toWei("1000"));
            expect(p[1]).to.equal(now - 10);
    
            // release
            await oracle0.release();
            p = await oracle0.callStatic.priceTWAPShort();
            expect(p[0]).approximateBigNumber(toWei("1001"));
            expect(p[1]).to.equal(now2 + 1);
            p = await oracle0.callStatic.priceTWAPLong();
            expect(p[0]).approximateBigNumber(toWei("1000"));
            expect(p[1]).to.equal(now - 10);
        })
            
        it("we terminated, and price should not change", async () => {
            let now2 = (await ethers.provider.getBlock()).timestamp;
            await oracle0.setBlockTimestamp(now2);
            await register.setTerminated(externalOracle.address);
            second.setIndexPrice(toWei("1010"), now + 10);

            let p = await oracle0.callStatic.priceTWAPShort();
            expect(p[0]).approximateBigNumber(toWei("1001"));
            expect(p[1]).to.equal(now - 9);
            p = await oracle0.callStatic.priceTWAPLong();
            expect(p[0]).approximateBigNumber(toWei("1000"));
            expect(p[1]).to.equal(now - 10);
        })
        
    })

    describe("MultiTunableOracleSetter", () => {
        let setter

        const encodeSetPrice = (id, price) => {
            return ethers.utils.solidityPack([ 'uint32', 'uint32', 'int192' ], [ id, 0, price ]);
        }

        beforeEach(async () => {
            setter = await createContract("MultiTunableOracleSetter");
            await setter.initialize()
            await setter.setOracle(128, oracle0.address)
            await oracle0.setFineTuner(setter.address);
        })

        it("encoder", () => {
            expect(encodeSetPrice(1,           toWei('1'))).to.equal("0x0000000100000000000000000000000000000000000000000de0b6b3a7640000");
            expect(encodeSetPrice(4294967295, toWei('-1'))).to.equal("0xffffffff00000000fffffffffffffffffffffffffffffffff21f494c589c0000");
        })
        
        it("failed if not register", async () => {
            await expect(setter.setPrice1(encodeSetPrice(2, toWei("1001")))).to.be.revertedWith("unregistered");
        })

        it("set 1 price", async () => {
            await register.setExternalOracle(externalOracle.address, toWei("0.01"), 60);
            let now2 = (await ethers.provider.getBlock()).timestamp;
            await oracle0.setBlockTimestamp(now2);

            let p = await oracle0.callStatic.priceTWAPShort();
            expect(p[0]).approximateBigNumber(toWei("1000"));
            expect(p[1]).to.equal(now2);
            p = await oracle0.callStatic.priceTWAPLong();
            expect(p[0]).approximateBigNumber(toWei("1000"));
            expect(p[1]).to.equal(now - 10);

            await setter.setPrice1(encodeSetPrice(128, toWei("1001")))

            p = await oracle0.callStatic.priceTWAPShort();
            expect(p[0]).approximateBigNumber(toWei("1001"));
            expect(p[1]).to.equal(now2);
            p = await oracle0.callStatic.priceTWAPLong();
            expect(p[0]).approximateBigNumber(toWei("1000"));
            expect(p[1]).to.equal(now - 10);
        })

        it("set 2 prices", async () => {
            await register.setExternalOracle(externalOracle.address, toWei("0.01"), 60);
            let now2 = (await ethers.provider.getBlock()).timestamp;
            await oracle0.setBlockTimestamp(now2);

            let p = await oracle0.callStatic.priceTWAPShort();
            expect(p[0]).approximateBigNumber(toWei("1000"));
            expect(p[1]).to.equal(now2);
            p = await oracle0.callStatic.priceTWAPLong();
            expect(p[0]).approximateBigNumber(toWei("1000"));
            expect(p[1]).to.equal(now - 10);

            await setter.setPrice2(
                encodeSetPrice(128, toWei("1001")),
                encodeSetPrice(128, toWei("1002"))
            )

            p = await oracle0.callStatic.priceTWAPShort();
            expect(p[0]).approximateBigNumber(toWei("1002"));
            expect(p[1]).to.equal(now2);
            p = await oracle0.callStatic.priceTWAPLong();
            expect(p[0]).approximateBigNumber(toWei("1000"));
            expect(p[1]).to.equal(now - 10);
        })

        it("set 3 prices", async () => {
            await register.setExternalOracle(externalOracle.address, toWei("0.01"), 60);
            let now2 = (await ethers.provider.getBlock()).timestamp;
            await oracle0.setBlockTimestamp(now2);

            let p = await oracle0.callStatic.priceTWAPShort();
            expect(p[0]).approximateBigNumber(toWei("1000"));
            expect(p[1]).to.equal(now2);
            p = await oracle0.callStatic.priceTWAPLong();
            expect(p[0]).approximateBigNumber(toWei("1000"));
            expect(p[1]).to.equal(now - 10);

            await setter.setPrices([
                encodeSetPrice(128, toWei("1001")),
                encodeSetPrice(128, toWei("1002")),
                encodeSetPrice(128, toWei("1003")),
            ])

            p = await oracle0.callStatic.priceTWAPShort();
            expect(p[0]).approximateBigNumber(toWei("1003"));
            expect(p[1]).to.equal(now2);
            p = await oracle0.callStatic.priceTWAPLong();
            expect(p[0]).approximateBigNumber(toWei("1000"));
            expect(p[1]).to.equal(now - 10);
        })
    })
})
