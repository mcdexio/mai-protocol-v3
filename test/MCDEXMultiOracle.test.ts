const { ethers } = require("hardhat");
const { expect } = require("chai");
import { BigNumber, BigNumber as BN } from "ethers";
import {
    toWei,
    fromWei,
    createContract,
    getAccounts
} from "../scripts/utils";
import "./helper";

describe("MCDEXMultiOracle", () => {
    let accounts;
    let oracle0;
    let oracle1;
    let oracle2;

    before(async () => {
        accounts = await getAccounts();
    })

    beforeEach(async () => {
        oracle0 = await createContract("MCDEXMultiOracle");
        await oracle0.initialize();
        await oracle0.grantRole(await oracle0.PRICE_SETTER_ROLE(), accounts[2].address);
        await oracle0.grantRole(await oracle0.MARKET_CLOSER_ROLE(), accounts[3].address);
        await oracle0.grantRole(await oracle0.TERMINATER_ROLE(), accounts[4].address);
        await oracle0.revokeRole(await oracle0.PRICE_SETTER_ROLE(), accounts[0].address);
        await oracle0.revokeRole(await oracle0.MARKET_CLOSER_ROLE(), accounts[0].address);
        await oracle0.revokeRole(await oracle0.TERMINATER_ROLE(), accounts[0].address);

        oracle1 = await createContract("MCDEXSingleOracle");
        oracle2 = await createContract("MCDEXSingleOracle");
        await oracle1.initialize(oracle0.address, 10);
        await oracle2.initialize(oracle0.address, 11);
    })

    it("auth", async () => {
        await expect(oracle0.connect(accounts[1]).setMarket(10, "a", "b")).to.be.revertedWith("role");
        await expect(oracle0.connect(accounts[1]).setPrice(10, toWei('1000'), 100)).to.be.revertedWith("role");
        await expect(oracle0.connect(accounts[1]).setPrices([[10, toWei('1000')], [11, toWei('2000')]], 100)).to.be.revertedWith("role");
        await expect(oracle0.connect(accounts[1]).setMarketClosed(10, true)).to.be.revertedWith("role");
        await expect(oracle0.connect(accounts[1]).setTerminated(10)).to.be.revertedWith("role");
        await expect(oracle0.connect(accounts[1]).setAllTerminated()).to.be.revertedWith("role");
    })

    it("normal", async () => {
        await oracle0.setMarket(10, "a", "b");
        expect(await oracle1.collateral()).to.equal("a");
        expect(await oracle1.underlyingAsset()).to.equal("b");

        await oracle0.connect(accounts[2]).setPrice(10, toWei('1000'), 100);
        let p = await oracle1.callStatic.priceTWAPShort();
        expect(p.newPrice).approximateBigNumber(toWei('1000'));
        expect(p.newTimestamp).to.equal(100);
        await oracle0.connect(accounts[2]).setPrices([[10, toWei('1000')], [11, toWei('2000')]], 200);
        p = await oracle2.callStatic.priceTWAPShort();
        expect(p.newPrice).approximateBigNumber(toWei('2000'));
        expect(p.newTimestamp).to.equal(200);

        await oracle0.connect(accounts[3]).setMarketClosed(10, true);
        expect(await oracle1.isMarketClosed()).to.equal(true);
        await oracle0.connect(accounts[3]).setMarketClosed(10, false);
        expect(await oracle1.isMarketClosed()).to.equal(false);
    })

    it("terminate", async () => {
        await oracle0.connect(accounts[4]).setTerminated(10);
        expect(await oracle1.isTerminated()).to.equal(true);
        expect(await oracle2.isTerminated()).to.equal(false);
        await expect(oracle0.connect(accounts[4]).setTerminated(10)).to.be.revertedWith("terminated");
        await oracle0.connect(accounts[4]).setAllTerminated();
        expect(await oracle2.isTerminated()).to.equal(true);

        await expect(oracle0.connect(accounts[0]).setMarket(10, "a", "b")).to.be.revertedWith("all terminated");
        await expect(oracle0.connect(accounts[1]).setPrice(10, toWei('1000'), 100)).to.be.revertedWith("all terminated");
        await expect(oracle0.connect(accounts[1]).setPrices([[10, toWei('1000')], [11, toWei('2000')]], 100)).to.be.revertedWith("all terminated");
        await expect(oracle0.connect(accounts[2]).setMarketClosed(10, true)).to.be.revertedWith("all terminated");
        await expect(oracle0.connect(accounts[3]).setTerminated(11)).to.be.revertedWith("all terminated");
        await expect(oracle0.connect(accounts[4]).setAllTerminated()).to.be.revertedWith("all terminated");
    })
})

