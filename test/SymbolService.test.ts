import BigNumber from 'bignumber.js';
import { ethers } from "hardhat";
import { expect } from "chai";

import "./helper";
import {
    createContract,
    toWei,
    createLiquidityPoolFactory
} from '../scripts/utils';

import { SymbolServiceFactory } from "../typechain/SymbolServiceFactory"

describe('SymbolService', () => {
    let symbolService;
    let accounts;

    beforeEach(async () => {
        symbolService = await createContract("SymbolService", [10000]);
        accounts = await ethers.getSigners();
    });

    describe('whitelisted factory', function () {
        it('add and remove', async () => {
            const factory = accounts[1].address;
            expect(await symbolService.isWhitelistedFactory(factory)).to.be.false;
            await symbolService.addWhitelistedFactory(factory);
            expect(await symbolService.isWhitelistedFactory(factory)).to.be.true;
            await symbolService.removeWhitelistedFactory(factory);
            expect(await symbolService.isWhitelistedFactory(factory)).to.be.false;
        })
        it('not owner', async () => {
            const factory = accounts[1].address;
            const user = accounts[2];
            const symbolServiceUser = await SymbolServiceFactory.connect(symbolService.address, user);
            await expect(symbolServiceUser.addWhitelistedFactory(factory)).to.be.revertedWith('Ownable: caller is not the owner');
        })
    })

    describe('allocate symbol', function () {

        it('normal', async () => {
            await symbolService.addWhitelistedFactory(accounts[1].address);
            const testSymbolService = await createContract("TestSymbolService", [accounts[1].address, symbolService.address]);
            await testSymbolService.allocateSymbol(0);
            expect((await testSymbolService.getSymbols(0))[0]).to.equal(10000);
            var context = await testSymbolService.getPerpetualUID(10000);
            expect(context.liquidityPool).to.equal(testSymbolService.address);
            expect(context.perpetualIndex).to.equal(0);
            await testSymbolService.allocateSymbol(1);
            expect((await testSymbolService.getSymbols(1))[0]).to.equal(10001);
            context = await testSymbolService.getPerpetualUID(10001);
            expect(context.liquidityPool).to.equal(testSymbolService.address);
            expect(context.perpetualIndex).to.equal(1);
        })

        it('not contract', async () => {
            const liquidityPool = accounts[1].address;
            await expect(symbolService.allocateSymbol(liquidityPool, 0)).to.be.revertedWith('must called by contract');
        })

        it('wrong factory', async () => {
            const testSymbolService = await createContract("TestSymbolService", [accounts[1].address, symbolService.address]);
            await expect(testSymbolService.allocateSymbol(0)).to.be.revertedWith("wrong factory");
        })

        it('perpetual exists', async () => {
            await symbolService.addWhitelistedFactory(accounts[1].address);
            const testSymbolService = await createContract("TestSymbolService", [accounts[1].address, symbolService.address]);
            await testSymbolService.allocateSymbol(0);
            await expect(testSymbolService.allocateSymbol(0)).to.be.revertedWith("perpetual already exists");
        })

        it('not enough symbol', async () => {
            symbolService = await createContract("SymbolService", ["115792089237316195423570985008687907853269984665640564039457584007913129639934"]);
            await symbolService.addWhitelistedFactory(accounts[1].address);
            const testSymbolService = await createContract("TestSymbolService", [accounts[1].address, symbolService.address]);
            await testSymbolService.allocateSymbol(0);
            await expect(testSymbolService.allocateSymbol(1)).to.be.revertedWith("not enough symbol");
        })

    })

    describe('assign reserved symbol', function () {

        it('normal', async () => {
            await symbolService.addWhitelistedFactory(accounts[1].address);
            const testSymbolService = await createContract("TestSymbolService", [accounts[1].address, symbolService.address]);
            await testSymbolService.allocateSymbol(0);
            await symbolService.assignReservedSymbol(testSymbolService.address, 0, 888);
            const symbols = await testSymbolService.getSymbols(0);
            expect(symbols[0]).to.equal(10000);
            expect(symbols[1]).to.equal(888);
            var context = await testSymbolService.getPerpetualUID(888);
            expect(context.liquidityPool).to.equal(testSymbolService.address);
            expect(context.perpetualIndex).to.equal(0);
            context = await testSymbolService.getPerpetualUID(10000);
            expect(context.liquidityPool).to.equal(testSymbolService.address);
            expect(context.perpetualIndex).to.equal(0);
        })

        it('not owner', async () => {
            await symbolService.addWhitelistedFactory(accounts[1].address);
            const testSymbolService = await createContract("TestSymbolService", [accounts[1].address, symbolService.address]);
            await testSymbolService.allocateSymbol(0);
            const user = accounts[2];
            const symbolServiceUser = await SymbolServiceFactory.connect(symbolService.address, user);
            await expect(symbolServiceUser.assignReservedSymbol(testSymbolService.address, 0, 888)).to.be.revertedWith('Ownable: caller is not the owner');
        })

        it('not contract', async () => {
            const liquidityPool = accounts[1].address;
            await expect(symbolService.assignReservedSymbol(liquidityPool, 0, 888)).to.be.revertedWith('must called by contract');
        })

        it('wrong factory', async () => {
            const testSymbolService = await createContract("TestSymbolService", [accounts[1].address, symbolService.address]);
            await expect(symbolService.assignReservedSymbol(testSymbolService.address, 0, 888)).to.be.revertedWith("wrong factory");
        })

        it('symbol too large', async () => {
            await symbolService.addWhitelistedFactory(accounts[1].address);
            const testSymbolService = await createContract("TestSymbolService", [accounts[1].address, symbolService.address]);
            await testSymbolService.allocateSymbol(0);
            await expect(symbolService.assignReservedSymbol(testSymbolService.address, 0, 10000)).to.be.revertedWith("symbol exceeds reserved symbol count");
        })

        it('symbol exists', async () => {
            await symbolService.addWhitelistedFactory(accounts[1].address);
            const testSymbolService = await createContract("TestSymbolService", [accounts[1].address, symbolService.address]);
            await testSymbolService.allocateSymbol(0);
            await symbolService.assignReservedSymbol(testSymbolService.address, 0, 888);
            await testSymbolService.allocateSymbol(1);
            await expect(symbolService.assignReservedSymbol(testSymbolService.address, 1, 888)).to.be.revertedWith("symbol already exists");
        })

        it('invalid symbol', async () => {
            await symbolService.addWhitelistedFactory(accounts[1].address);
            const testSymbolService = await createContract("TestSymbolService", [accounts[1].address, symbolService.address]);
            await expect(symbolService.assignReservedSymbol(testSymbolService.address, 0, 888)).to.be.revertedWith("perpetual must have normal symbol and mustn't have reversed symbol");
            await testSymbolService.allocateSymbol(0);
            await symbolService.assignReservedSymbol(testSymbolService.address, 0, 888);
            await expect(symbolService.assignReservedSymbol(testSymbolService.address, 0, 999)).to.be.revertedWith("perpetual must have normal symbol and mustn't have reversed symbol");
        })

    })

})

