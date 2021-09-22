import { expect } from "chai";
const { ethers } = require("hardhat");
import {
    toWei,
    fromWei,
    toBytes32,
    getAccounts,
    createContract,
} from '../scripts/utils';

describe('LpGovernor', () => {
    let accounts;
    let user0;
    let user1;
    let user2;
    let user3;

    let stk;
    let rtk;
    let governor;
    let target;
    let poolCreator;

    enum ProposalState { Pending, Active, Canceled, Defeated, Succeeded, Queued, Expired, Executed }

    const fromState = (state) => {
        return ProposalState[state]
    }

    before(async () => {
        accounts = await getAccounts();
        user0 = accounts[0];
        user1 = accounts[0];
        user2 = accounts[2];
        user3 = accounts[3];
    })

    beforeEach(async () => {
        stk = await createContract("TestLpGovernor");
        rtk = await createContract("CustomERC20", ["RTK", "RTK", 18]);
        target = await createContract("MockLiquidityPool");
        governor = stk;

        poolCreator = await createContract("MockPoolCreator", [user0.address, rtk.address])

        await stk.initialize(
            "MCDEX governor token",
            "MGT",
            user0.address,
            target.address,
            poolCreator.address
        );
    });


    it("mint / redeem", async () => {
        await stk.mint(user1.address, toWei("1000"));
        expect(await stk.balanceOf(user1.address)).to.equal(toWei("1000"))

        await expect(stk.connect(user2).mint(user2.address, toWei("1000"))).to.be.revertedWith("must be minter to mint")

        await stk.burn(user1.address, toWei("1000"));
        expect(await stk.balanceOf(user1.address)).to.equal(toWei("0"))

        await expect(stk.connect(user2).burn(user2.address, toWei("1000"))).to.be.revertedWith("must be minter to burn")


        await stk.mint(user1.address, toWei("1000"));
        await expect(stk.burn(user1.address, toWei("2000"))).to.be.revertedWith("burn amount exceeds balance")
    });
})