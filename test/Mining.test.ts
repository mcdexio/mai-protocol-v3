import { expect } from "chai";
import {
    toWei,
    fromWei,
    toBytes32,
    getAccounts,
    createContract,
} from '../scripts/utils';

describe('Minging', () => {
    let accounts;
    let user0;
    let user1;
    let user2;
    let user3;
    let miner;
    let stk;
    let rtk;

    before(async () => {
        accounts = await getAccounts();
        user0 = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];
    })

    beforeEach(async () => {
        stk = await createContract("TestLpGovernor");
        rtk = await createContract("CustomERC20", ["RTK", "RTK", 18]);
        miner = stk;

        const poolCreator = await createContract("MockPoolCreator", [user1.address])

        await stk.initialize(
            "MCDEX governor token",
            "MGT",
            user0.address,
            "0x0000000000000000000000000000000000000000",
            rtk.address,
            poolCreator.address
        );
    });

    // it("notifyRewardAmountV1", async () => {

    //     await expect(miner.setRewardRateV1(2)).to.be.revertedWith("caller must be owner of pool creator");
    //     await expect(miner.notifyRewardAmountV1(toWei("100"))).to.be.revertedWith("caller must be owner of pool creator");
    //     await expect(miner.connect(user1).notifyRewardAmountV1(toWei("100"))).to.be.revertedWith("rewardRate is zero");

    //     expect(await miner.lastUpdateTimeV1()).to.equal(0);
    //     expect(await miner.periodFinishV1()).to.equal(0);
    //     await miner.connect(user1).setRewardRateV1(toWei("2"));
    //     let tx = await miner.connect(user1).notifyRewardAmountV1(toWei("10"));
    //     let receipt = await tx.wait();
    //     let blockNumber = receipt.blockNumber;
    //     expect(await miner.lastUpdateTimeV1()).to.equal(blockNumber);
    //     expect(await miner.periodFinishV1()).to.equal(blockNumber + 5);

    //     await miner.connect(user1).notifyRewardAmountV1(toWei("20"));
    //     expect(await miner.lastUpdateTimeV1()).to.equal(blockNumber + 1);
    //     expect(await miner.periodFinishV1()).to.equal(blockNumber + 5 + 10);

    //     let blockNumber2;
    //     // 150 block / end passed
    //     for (let i = 0; i < 20; i++) {
    //         let tx = await stk.connect(user1).approve(miner.address, toWei("10000"));
    //         let receipt = await tx.wait();
    //         blockNumber2 = receipt.blockNumber;
    //     }

    //     expect(blockNumber2).to.be.greaterThan(blockNumber + 5 + 10)

    //     let tx3 = await miner.connect(user1).notifyRewardAmountV1(toWei("30"));
    //     let receipt3 = await tx3.wait();
    //     let blockNumber3 = receipt3.blockNumber;
    //     expect(await miner.lastUpdateTimeV1()).to.equal(blockNumber3);
    //     expect(await miner.periodFinishV1()).to.equal(blockNumber3 + 15);
    // })

    // it("setRewardRateV1", async () => {
    //     await miner.connect(user1).setRewardRateV1(toWei("2"));
    //     let tx = await miner.connect(user1).notifyRewardAmountV1(toWei("100"));
    //     let receipt = await tx.wait();
    //     let blockNumber = receipt.blockNumber;
    //     expect(await miner.lastUpdateTimeV1()).to.equal(blockNumber);
    //     expect(await miner.periodFinishV1()).to.equal(blockNumber + 50);
    //     // (105 - 55) * 2 / 5 + now
    //     await miner.connect(user1).setRewardRateV1(toWei("5"));
    //     expect(await miner.lastUpdateTimeV1()).to.equal(blockNumber + 1);
    //     expect(await miner.periodFinishV1()).to.equal(blockNumber + 20);

    //     let tx2 = await miner.connect(user1).setRewardRateV1(toWei("0"));
    //     let receipt2 = await tx2.wait();
    //     let blockNumber2 = receipt2.blockNumber;
    //     expect(await miner.lastUpdateTimeV1()).to.equal(blockNumber2);
    //     expect(await miner.periodFinishV1()).to.equal(blockNumber2);
    // })

    // it("earnedV1", async () => {
    //     await stk.mint(user1.address, toWei("100"));

    //     await miner.connect(user1).setRewardRateV1(toWei("2"));
    //     await miner.connect(user1).notifyRewardAmountV1(toWei("20"));
    //     expect(await miner.earnedV1(user1.address)).to.equal(toWei("0"))

    //     await stk.connect(user1).approve(miner.address, toWei("10000"));
    //     expect(await miner.earnedV1(user1.address)).to.equal(toWei("2"))

    //     // 10 round max
    //     for (let i = 0; i < 20; i++) {
    //         await stk.connect(user1).approve(miner.address, toWei("10000"));
    //     }
    //     expect(await miner.earnedV1(user1.address)).to.equal(toWei("20"))
    // })

    // it("rewardPerTokenV1", async () => {
    //     await miner.connect(user1).setRewardRateV1(toWei("2"));
    //     await miner.connect(user1).notifyRewardAmountV1(toWei("40"));

    //     expect(await miner.rewardPerTokenV1()).to.equal(toWei("0"));

    //     await rtk.mint(miner.address, toWei("10000"));
    //     await stk.mint(user1.address, toWei("100"));

    //     expect(await miner.rewardPerTokenV1()).to.equal(toWei("0"));

    //     await stk.connect(user1).approve(miner.address, toWei("10000"));
    //     expect(await miner.rewardPerTokenV1()).to.equal(toWei("0.02"));

    //     await stk.connect(user1).approve(miner.address, toWei("10000"));
    //     expect(await miner.rewardPerTokenV1()).to.equal(toWei("0.04"));

    //     await miner.burn(user1.address, toWei("100"));
    //     expect(await miner.rewardPerTokenV1()).to.equal(toWei("0.06"));

    //     expect(await rtk.balanceOf(user1.address)).to.equal(toWei("0"));
    //     expect(await miner.rewardsV1(user1.address)).to.equal(toWei("6"))
    //     await miner.connect(user1).getRewardV1();
    //     expect(await rtk.balanceOf(user1.address)).to.equal(toWei("6"));

    //     await miner.connect(user1).getRewardV1();
    //     expect(await rtk.balanceOf(user1.address)).to.equal(toWei("6"));
    //     expect(await miner.userRewardPerTokenPaidV1(user1.address)).to.equal(toWei("0.06"));

    //     await stk.connect(user1).approve(miner.address, toWei("10000"));
    //     expect(await miner.rewardPerTokenV1()).to.equal(toWei("0.06"));

    //     await stk.mint(user1.address, toWei("200"));
    //     expect(await miner.rewardPerTokenV1()).to.equal(toWei("0.06"));

    //     await stk.connect(user1).approve(miner.address, toWei("10000")); // +2
    //     expect(await miner.rewardPerTokenV1()).to.equal(toWei("0.07"));

    //     // 0.07 * 200
    //     expect(await miner.earnedV1(user1.address)).to.equal(toWei("2"))
    //     await miner.connect(user1).getRewardV1(); // +2
    //     expect(await rtk.balanceOf(user1.address)).to.equal(toWei("10"));

    //     expect(await miner.earnedV1(user1.address)).to.equal(toWei("0"))
    //     await stk.connect(user1).approve(miner.address, toWei("10000")); // +2
    //     await stk.connect(user1).approve(miner.address, toWei("10000")); // +2
    // })

    // it("rewardPerTokenV1 - 2", async () => {
    //     await miner.connect(user1).setRewardRateV1(toWei("2"));
    //     await miner.connect(user1).notifyRewardAmountV1(toWei("40"));

    //     expect(await miner.rewardPerTokenV1()).to.equal(toWei("0"));

    //     await rtk.mint(miner.address, toWei("10000"));
    //     await stk.mint(user1.address, toWei("100"));

    //     expect(await miner.rewardPerTokenV1()).to.equal(toWei("0"));

    //     await stk.connect(user1).approve(miner.address, toWei("10000"));
    //     expect(await miner.rewardPerTokenV1()).to.equal(toWei("0.02"));

    //     await stk.connect(user1).approve(miner.address, toWei("10000"));
    //     expect(await miner.rewardPerTokenV1()).to.equal(toWei("0.04"));

    //     await miner.burn(user1.address, toWei("100"));
    //     expect(await miner.rewardPerTokenV1()).to.equal(toWei("0.06"));

    //     expect(await rtk.balanceOf(user1.address)).to.equal(toWei("0"));
    //     expect(await miner.rewardsV1(user1.address)).to.equal(toWei("6"))
    //     await miner.connect(user1).getRewardV1();
    //     expect(await rtk.balanceOf(user1.address)).to.equal(toWei("6"));

    //     await miner.connect(user1).getRewardV1();
    //     expect(await rtk.balanceOf(user1.address)).to.equal(toWei("6"));
    //     expect(await miner.userRewardPerTokenPaidV1(user1.address)).to.equal(toWei("0.06"));

    //     await stk.connect(user1).approve(miner.address, toWei("10000"));
    //     expect(await miner.rewardPerTokenV1()).to.equal(toWei("0.06"));

    //     await stk.mint(user1.address, toWei("200"));
    //     expect(await miner.rewardPerTokenV1()).to.equal(toWei("0.06"));
    //     await stk.mint(user2.address, toWei("50"));
    //     expect(await miner.rewardPerTokenV1()).to.equal(toWei("0.07"));

    //     await stk.connect(user1).approve(miner.address, toWei("10000")); // +2
    //     expect(await miner.rewardPerTokenV1()).to.equal(toWei("0.078")); // 2/250 + 0.07

    //     // // 0.07 * 200
    //     expect(await miner.earnedV1(user1.address)).to.equal(toWei("3.6"))
    //     expect(await miner.earnedV1(user2.address)).to.equal(toWei("0.4"))
    //     await miner.connect(user1).getRewardV1(); // +2
    //     expect(await rtk.balanceOf(user1.address)).to.equal(toWei("11.2")); // 6 + 3.6 + 1.6

    //     await miner.connect(user2).getRewardV1(); // +2
    //     expect(await rtk.balanceOf(user2.address)).to.equal(toWei("1.2"));  // 0.4 + 0.4 + 0.4

    //     await miner.burn(user1.address, toWei("150")); // + 2

    //     expect(await miner.earnedV1(user1.address)).to.equal(toWei("3.2"))
    //     expect(await miner.earnedV1(user2.address)).to.equal(toWei("0.4"))

    //     await stk.connect(user1).approve(miner.address, toWei("10000")); // +2

    //     expect(await miner.earnedV1(user1.address)).to.equal(toWei("4.2"))
    //     expect(await miner.earnedV1(user2.address)).to.equal(toWei("1.4"))

    //     await miner.burn(user1.address, toWei("50")); // + 2

    //     expect(await miner.earnedV1(user1.address)).to.equal(toWei("5.2"))
    //     expect(await miner.earnedV1(user2.address)).to.equal(toWei("2.4"))

    //     await stk.connect(user1).approve(miner.address, toWei("10000")); // +2

    //     expect(await miner.earnedV1(user1.address)).to.equal(toWei("5.2"))
    //     expect(await miner.earnedV1(user2.address)).to.equal(toWei("4.4"))
    // })

    // it("rewardPerTokenV1 - reward tuncation", async () => {
    //     await miner.connect(user1).setRewardRateV1(toWei("3"));

    //     await rtk.mint(miner.address, toWei("10000"));
    //     await stk.mint(user1.address, toWei("100"));
    //     await stk.mint(user2.address, toWei("25"));

    //     const tx = await miner.connect(user1).notifyRewardAmountV1(toWei("40"));
    //     // period = 13
    //     expect(await miner.periodFinishV1()).to.equal(tx.blockNumber + 13)


    //     for (let i = 0; i < 20; i++) {
    //         await miner.connect(user1).getRewardV1()
    //         await miner.connect(user2).getRewardV1()
    //     }
    //     expect(await rtk.balanceOf(user1.address)).to.equal(toWei("31.2"))
    //     expect(await rtk.balanceOf(user2.address)).to.equal(toWei("7.8"))
    // })

    const expectRewards = async (d, a, tokens, rewards) => {
        const result = await d.allEarned(a)
        // console.log(a, rewards, result)
        tokens.forEach((t, i) => expect(t).to.equal(result.tokens[i]))
        rewards.forEach((r, i) => expect(r).to.equal(result.earnedAmounts[i]))
    }

    it("mining - 2 rewards", async () => {
        const atk = await createContract("CustomERC20", ["ATK", "ATK", 6]);
        await atk.mint(miner.address, toWei("100"));
        await rtk.mint(miner.address, toWei("100"));
        await stk.mint(user1.address, toWei("100"));

        await miner.setOperator(user2.address);

        await miner.connect(user1).setRewardRate(rtk.address, toWei("2"));
        await miner.connect(user1).notifyRewardAmount(rtk.address, toWei("100"));

        await expectRewards(miner, user1.address, [rtk.address], [toWei("0")])
        await stk.connect(user1).approve(miner.address, toWei("10000")); // +2
        await expectRewards(miner, user1.address, [rtk.address], [toWei("2")])
        // 10 round max
        for (let i = 0; i < 10; i++) {
            await stk.connect(user1).approve(miner.address, toWei("20"));
        }
        await expectRewards(miner, user1.address, [rtk.address], [toWei("22")])

        // await expect(miner.connect(user1).setRewardRate(atk.address, toWei("2"))).to.be.revertedWith("caller must be operator");
        // await expect(miner.connect(user2).setRewardRate(atk.address, toWei("2"))).to.be.revertedWith("distribution not exists");
        await miner.connect(user2).createDistribution(atk.address, toWei("5"), toWei("50"))
        // await miner.connect(user1).setRewardRate(atk.address, toWei("2"))
        // await miner.connect(user1).notifyRewardAmount(atk.address, toWei("20"));

        await expectRewards(miner, user1.address, [rtk.address, atk.address], [toWei("24"), toWei("0")])
        for (let i = 1; i <= 10; i++) {
            await stk.connect(user1).approve(miner.address, toWei("0"));
            await expectRewards(miner, user1.address, [rtk.address, atk.address], [toWei((24 + 2 * i).toString()), toWei((5 * i).toString())])
        }
        await expectRewards(miner, user1.address, [rtk.address, atk.address], [toWei("44"), toWei("50")])
        await miner.connect(user1).getAllRewards() // +2

        await expectRewards(miner, user1.address, [rtk.address, atk.address], [toWei("0"), toWei("0")])
        expect(await rtk.balanceOf(user1.address)).to.equal(toWei("46"))
        expect(await atk.balanceOf(user1.address)).to.equal(toWei("50"))

        for (let i = 1; i <= 10; i++) {
            await stk.connect(user1).approve(miner.address, toWei("0"));
        }

        await expectRewards(miner, user1.address, [rtk.address, atk.address], [toWei("20"), toWei("0")])
        await miner.connect(user1).setRewardRate(rtk.address, toWei("1"))

        for (let i = 1; i <= 10; i++) {
            await stk.connect(user1).approve(miner.address, toWei("0"));
        }
        await expectRewards(miner, user1.address, [rtk.address, atk.address], [toWei("32"), toWei("0")])
        await miner.connect(user1).getAllRewards() // +2
        await expectRewards(miner, user1.address, [rtk.address, atk.address], [toWei("0"), toWei("0")])
        expect(await rtk.balanceOf(user1.address)).to.equal(toWei("79"))
        expect(await atk.balanceOf(user1.address)).to.equal(toWei("50"))

        await miner.connect(user2).notifyRewardAmount(atk.address, toWei("10"));
        await expectRewards(miner, user1.address, [rtk.address, atk.address], [toWei("1"), toWei("0")])
        await stk.connect(user1).approve(miner.address, toWei("0"));

        await expectRewards(miner, user1.address, [rtk.address, atk.address], [toWei("2"), toWei("5")])
    })
})