import { expect } from "chai";
const { ethers } = require("hardhat");
import {
    toWei,
    fromWei,
    toBytes32,
    getAccounts,
    createContract,
    createLiquidityPoolFactory,
    createFactory,
    deployPoolCreator
} from '../scripts/utils';

describe('GovernorAlpha', () => {
    let accounts;
    let user0;
    let user1;
    let user2;
    let user3;
    let user4;
    let user5;

    let stk;
    let rtk;
    let governor;
    let target;

    // enum ProposalState { Pending, Active, Canceled, Defeated, Succeeded, Queued, Expired, Executed }
    enum ProposalState { Pending, Active, Defeated, Succeeded, Queued, Executed, Expired }


    const fromState = (state) => {
        return ProposalState[state]
    }

    before(async () => {
        accounts = await getAccounts();
        user0 = accounts[0];
        user1 = accounts[0];
        user2 = accounts[2];
        user3 = accounts[3];
        user4 = accounts[4];
        user5 = accounts[5];
    })

    beforeEach(async () => {
        stk = await createContract("TestLpGovernor");
        rtk = await createContract("CustomERC20", ["RTK", "RTK", 18]);
        target = await createContract("MockLiquidityPool");
        governor = stk;
        const poolCreator = await createContract("MockPoolCreator", [user0.address])

        await stk.initialize(
            "MCDEX governor token",
            "MGT",
            user0.address,
            target.address,
            rtk.address,
            poolCreator.address
        );

        // console.table([
        //     ["STK", stk.address],
        //     ["RTK", rtk.address],
        //     ["Target", target.address],
        //     ["LPGovernor", governor.address],
        // ])
    });

    const isDebugPrintOn = false

    const skipBlock = async (num) => {
        // console.log("blocknumber @", await ethers.provider.getBlockNumber());
        for (let i = 0; i < num; i++) {
            await rtk.approve(user3.address, 1);
        }
    }

    const printProposal = async (proposalId, accounts = [], padding = 12) => {
        const proposal = await governor.proposals(proposalId);
        const state = await governor.state(proposalId);
        console.log(`===== Proposal ${proposalId} by \x1b[36m${proposal.proposer}\x1b[0m =====`)
        console.log(`         state ${fromState(state).padStart(padding)}`)
        console.log(`         start ${proposal.startBlock.toString().padStart(padding)}`)
        console.log(`           end ${proposal.endBlock.toString().padStart(padding)}`)
        console.log(`      executed ${proposal.executed.toString().padStart(padding)}`)
        console.log(`      forVotes ${fromWei(proposal.forVotes).padStart(padding)}`)
        console.log(`  againstVotes ${fromWei(proposal.againstVotes).padStart(padding)}`)
        console.log(`   quorumVotes ${fromWei(proposal.quorumVotes).padStart(padding)}`)
        console.log(`      receipts`)

        for (let i = 0; i < accounts.length; i++) {
            const receipt = await governor.getReceipt(proposalId, accounts[i].address, { gasLimit: 8000000 });
            const unlockAt = await governor.callStatic.getUnlockBlock(accounts[i].address);
            const isLocked = await governor.callStatic.isLocked(accounts[i].address);

            if (receipt.hasVoted) {
                console.log(`             -  ${accounts[i].address} ${receipt.support ? '\x1b[36m√\x1b[0m' : '\x1b[31m×\x1b[0m'} ${isLocked ? '\x1b[31mLOCKED(' + unlockAt.toString() + ')\x1b[0m' : '\x1b[36mUNLOCK(' + unlockAt.toString() + ')\x1b[0m'} ${fromWei(receipt.votes)}`)
            } else {
                console.log(`             -  ${accounts[i].address} - ${isLocked ? '\x1b[31mLOCKED(' + unlockAt.toString() + ')\x1b[0m' : '\x1b[36mUNLOCK(' + unlockAt.toString() + ')\x1b[0m'}`)
            }
        }
        console.log("")
    }

    const printLock = async (proposalId, accounts = []) => {
        if (!isDebugPrintOn) {
            return;
        }
        console.log("block number =", await ethers.provider.getBlockNumber());
        await printProposal(proposalId, accounts);
    }

    it("exceptions", async () => {
        await expect(governor.state(1)).to.be.revertedWith("invalid proposal id")
        await expect(governor.connect(user1).propose(
            ["setFastCreationEnabled(bool)", "setFastCreationEnabled(bool)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        )).to.be.revertedWith("function information arity mismatch")
        await expect(governor.connect(user1).propose(
            [],
            [],
            "setFastCreationEnabled to true"
        )).to.be.revertedWith("must provide actions")
        await expect(governor.connect(user1).propose(
            [
                "setFastCreationEnabled(bool)",
                "setFastCreationEnabled(bool)",
                "setFastCreationEnabled(bool)",
                "setFastCreationEnabled(bool)",
                "setFastCreationEnabled(bool)",
                "setFastCreationEnabled(bool)",
                "setFastCreationEnabled(bool)",
                "setFastCreationEnabled(bool)",
                "setFastCreationEnabled(bool)",
                "setFastCreationEnabled(bool)",
                "setFastCreationEnabled(bool)",
            ],
            [
                "0x0000000000000000000000000000000000000000000000000000000000000001",
                "0x0000000000000000000000000000000000000000000000000000000000000001",
                "0x0000000000000000000000000000000000000000000000000000000000000001",
                "0x0000000000000000000000000000000000000000000000000000000000000001",
                "0x0000000000000000000000000000000000000000000000000000000000000001",
                "0x0000000000000000000000000000000000000000000000000000000000000001",
                "0x0000000000000000000000000000000000000000000000000000000000000001",
                "0x0000000000000000000000000000000000000000000000000000000000000001",
                "0x0000000000000000000000000000000000000000000000000000000000000001",
                "0x0000000000000000000000000000000000000000000000000000000000000001",
                "0x0000000000000000000000000000000000000000000000000000000000000001",
            ],
            "setFastCreationEnabled to true"
        )).to.be.revertedWith("too many actions")
    });

    it("validateProposer", async () => {
        await stk.mint(user1.address, toWei("991"));
        await stk.mint(user2.address, toWei("9"));
        expect(await governor.getProposalThreshold()).to.equal(toWei("10"))
        await expect(governor.connect(user2).propose(
            ["setFastCreationEnabled(bool)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        )).to.be.revertedWith("proposal threshold unmet");

        await governor.connect(user1).propose(
            ["setFastCreationEnabled(bool)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        );
        await expect(governor.connect(user1).propose(
            ["setFastCreationEnabled(bool)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        )).to.be.revertedWith("last proposal is pending");

        await skipBlock(2);

        await expect(governor.connect(user1).propose(
            ["setFastCreationEnabled(bool)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        )).to.be.revertedWith("last proposal is active");

        await target.setOperatorDebug(user2.address);
        await governor.connect(user2).propose(
            ["setFastCreationEnabled(bool)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        )

        await expect(governor.connect(user1).propose(
            ["setFastCreationEnabled(bool)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        )).to.be.revertedWith("proposer must be operator when operator exists");
    });


    it("params", async () => {
        expect(await governor.quorumRate()).to.equal(toWei("0.1"))
        expect(await governor.criticalQuorumRate()).to.equal(toWei("0.2"))
        expect(await governor.proposalThresholdRate()).to.equal(toWei("0.01"))
        expect(await governor.proposalMaxOperations()).to.equal(10)
        expect(await governor.votingDelay()).to.equal(1)
        expect(await governor.votingPeriod()).to.equal(20)
        expect(await governor.executionDelay()).to.equal(20)
        expect(await governor.unlockDelay()).to.equal(20)

        await stk.mint(user1.address, toWei("1000"));
        expect(await governor.getProposalThreshold()).to.equal(toWei("10"))

        await stk.mint(user1.address, toWei("1000"));
        expect(await governor.getProposalThreshold()).to.equal(toWei("20"))
    });


    it("quorum", async () => {
        await stk.mint(user1.address, toWei("1000"));

        await governor.connect(user1).propose(
            ["setFastCreationEnabled(bool)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        );
        expect(await governor.getQuorumVotes(1)).to.equal(toWei("100"));
    });

    it("quorum critical", async () => {
        await stk.mint(user1.address, toWei("1000"));
        await governor.connect(user1).propose(
            ["upgradeToAndCall(bytes32,bytes,bytes)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        );
        expect(await governor.getQuorumVotes(1)).to.equal(toWei("200"));

        await stk.mint(user2.address, toWei("1000"));
        await governor.connect(user2).propose(
            ["forceToSetEmergencyState(uint256,int256)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        );
        expect(await governor.getQuorumVotes(2)).to.equal(toWei("400"));

        await stk.mint(user3.address, toWei("1000"));
        await governor.connect(user3).propose(
            ["transferOperator(address)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        );
        expect(await governor.getQuorumVotes(3)).to.equal(toWei("600"));

    });

    it("quorum critical - upgrade", async () => {

        const versionKey = (lp1, lp2, gov) => {
            return ethers.utils.solidityKeccak256(["address[]", "address"], [[lp1, lp2], gov]);
        }

        const LiquidityPoolFactory = await createLiquidityPoolFactory();

        var symbol = await createContract("SymbolService");
        await symbol.initialize(10000);
        const ctk = await createContract("CustomERC20", ["collateral", "CTK", 18]);
        var vault = user0;
        var poolCreator = await deployPoolCreator(symbol, vault, toWei("0.001"));
        await symbol.addWhitelistedFactory(poolCreator.address);

        var lp0Version1 = await LiquidityPoolFactory[0].deploy();
        var lp1Version1 = await LiquidityPoolFactory[1].deploy();
        var govVersion1 = await createContract("TestLpGovernor");
        await poolCreator.addVersion(
            [lp0Version1.address, lp1Version1.address],
            govVersion1.address,
            1,
            "version1"
        );

        const deployed1 = await poolCreator.connect(user1).callStatic.createLiquidityPool(ctk.address, 18, 996, ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1]));
        await poolCreator.connect(user1).createLiquidityPool(ctk.address, 18, 996, ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1]));

        const oracle = await createContract("OracleAdaptor", ["USD", "ETH"]);
        await oracle.setIndexPrice(toWei("1000"), 1000)
        await oracle.setMarkPrice(toWei("1000"), 1000)
        const liquidityPool1 = await ethers.getContractAt("LiquidityPoolAllHops", deployed1[0]);
        const governor1 = await ethers.getContractAt("TestLpGovernor", deployed1[1]);

        await liquidityPool1.createPerpetual(
            oracle.address,
            [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("1")],
            [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1")],
            [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
            [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1")],
        )
        await liquidityPool1.runLiquidityPool();

        var lp0Version2 = await LiquidityPoolFactory[0].deploy();
        var lp1Version2 = await LiquidityPoolFactory[1].deploy();
        var govVersion2 = await createContract("TestLpGovernor");
        await poolCreator.addVersion(
            [lp0Version2.address, lp1Version2.address],
            govVersion2.address,
            2,
            "version2"
        );
        const key2 = versionKey(lp0Version2.address, lp1Version2.address, govVersion2.address);

        await ctk.mint(user0.address, toWei("1000"));
        await ctk.connect(user0).approve(liquidityPool1.address, toWei("1000"));
        await liquidityPool1.connect(user0).addLiquidity(toWei("1000"));

        await governor1.connect(user0).proposeToUpgradeAndCall(
            key2,
            "0x",
            "0x",
            "upgrade to key2"
        );
        expect(await governor1.getQuorumVotes(1)).to.equal(toWei("200"));
    });

    it("quorum critical - mixed", async () => {
        await stk.mint(user1.address, toWei("1000"));
        await governor.connect(user1).propose(
            ["setFastCreationEnabled(bool)", "upgradeToAndCall(bytes32,bytes,bytes)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001", "0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        );
        expect(await governor.getQuorumVotes(1)).to.equal(toWei("200"));
    });

    it("quorum critical - mixed", async () => {
        await stk.mint(user1.address, toWei("1000"));
        await governor.connect(user1).propose(
            ["setFastCreationEnabled(bool)", "upgradeTo(address,address)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001", "0x0000000000000000000000000000000000000000000000000000000000000002"],
            "setFastCreationEnabled to true"
        );

        var { signatures, calldatas } = await governor.getActions(1);
        expect(await signatures[0]).to.be.equal("setFastCreationEnabled(bool)")
        expect(await signatures[1]).to.be.equal("upgradeTo(address,address)")
        expect(await calldatas[0]).to.be.equal("0x0000000000000000000000000000000000000000000000000000000000000001")
        expect(await calldatas[1]).to.be.equal("0x0000000000000000000000000000000000000000000000000000000000000002")
    });

    it("pass", async () => {
        await stk.mint(user1.address, toWei("1000"));

        await stk.mint(user2.address, toWei("1000"));

        let pid = await governor.connect(user1).callStatic.propose(
            ["setFastCreationEnabled(bool)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        );

        await governor.connect(user1).propose(
            ["setFastCreationEnabled(bool)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        );

        console.log("Proposal", pid.toString());
        console.log(fromState(await governor.state(pid)));
        expect(await governor.state(pid)).to.equal(0)

        await skipBlock(2);
        console.log(fromState(await governor.state(pid)));
        expect(await governor.state(pid)).to.equal(1)

        await skipBlock(20);
        console.log(fromState(await governor.state(pid)));
        expect(await governor.state(pid)).to.equal(3)

        await skipBlock(20);
        console.log(fromState(await governor.state(pid)));
        expect(await governor.state(pid)).to.equal(4)

        await governor.execute(pid);
        console.log(fromState(await governor.state(pid)));
        expect(await governor.state(pid)).to.equal(5)
    })

    it("rejected", async () => {
        await stk.mint(user1.address, toWei("1000"));

        await stk.mint(user2.address, toWei("1000"));

        let pid = await governor.connect(user1).callStatic.propose(
            ["setFastCreationEnabled(bool)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        );

        await governor.connect(user1).propose(
            ["setFastCreationEnabled(bool)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        );

        expect(await governor.state(pid)).to.equal(0)
        await skipBlock(2);
        console.log("Proposal", pid.toString());
        const tx = await governor.connect(user2).castVote(pid, false);
        console.log((await tx.wait()).cumulativeGasUsed.toString());

        console.log(fromState(await governor.state(pid)));
        expect(await governor.state(pid)).to.equal(1)
        await skipBlock(2);
        console.log(fromState(await governor.state(pid)));
        expect(await governor.state(pid)).to.equal(1)
        await skipBlock(20);
        console.log(fromState(await governor.state(pid)));
        expect(await governor.state(pid)).to.equal(2)
        await skipBlock(20);
        console.log(fromState(await governor.state(pid)));
        expect(await governor.state(pid)).to.equal(2)
        await expect(governor.execute(pid)).to.be.revertedWith("proposal can only be executed if it is success and queued")
        console.log(fromState(await governor.state(pid)));
    })

    it("lock", async () => {
        await stk.mint(user1.address, toWei("1000"));

        await stk.mint(user2.address, toWei("1000"));

        let pid = await governor.connect(user1).callStatic.propose(
            ["setFastCreationEnabled(bool)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        );

        let tx2 = await (await governor.connect(user1).propose(
            ["setFastCreationEnabled(bool)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        )).wait();

        const startBlock = tx2.blockNumber;
        console.log("start @", startBlock)

        expect(await governor.state(pid)).to.equal(0)
        expect(await governor.callStatic.getUnlockBlock(user1.address)).to.equal(startBlock + 1 + 20 + 1); // delay + voting + 1
        await printLock(pid, [user1, user2]);

        await skipBlock(2);
        expect(await governor.state(pid)).to.equal(1)
        expect(await governor.callStatic.getUnlockBlock(user1.address)).to.equal(startBlock + 1 + 20 + 1); // delay + voting + 1
        await printLock(pid, [user1, user2]);

        await skipBlock(20);

        await printLock(pid, [user1, user2]);
        expect(await governor.state(pid)).to.equal(3)
        expect(await governor.callStatic.getUnlockBlock(user1.address)).to.equal(startBlock + 1 + 20 + 20 + 20); // delay + voting

        await skipBlock(60);
        await printLock(pid, [user1, user2]);
        expect(await governor.state(pid)).to.equal(6)
        expect(await governor.callStatic.getUnlockBlock(user1.address)).to.equal(startBlock + 1 + 20 + 20 + 20); // delay + voting
    })

    it("lock - 2", async () => {
        await stk.mint(user1.address, toWei("1000"));

        await stk.mint(user2.address, toWei("500"));

        let pid = await governor.connect(user1).callStatic.propose(
            ["setFastCreationEnabled(bool)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        );

        let tx2 = await (await governor.connect(user1).propose(
            ["setFastCreationEnabled(bool)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        )).wait();

        // PENDING
        const startBlock = tx2.blockNumber;
        console.log("start @", startBlock)

        await expect(governor.connect(user2).castVote(pid, false)).to.be.revertedWith("voting is closed")
        expect(await governor.state(pid)).to.equal(0)
        expect(await governor.callStatic.getUnlockBlock(user1.address)).to.equal(startBlock + 1 + 20 + 1); // delay + voting + 1
        await printLock(pid, [user1, user2]);

        await skipBlock(2);
        // ACTIVE

        await governor.connect(user2).castVote(pid, false);
        await expect(governor.connect(user2).castVote(pid, true)).to.be.revertedWith("account already voted")
        expect(await governor.state(pid)).to.equal(1)
        expect(await governor.callStatic.getUnlockBlock(user1.address)).to.equal(startBlock + 1 + 20 + 1); // delay + voting + 1
        await printLock(pid, [user1, user2]);
        await expect(governor.execute(pid)).to.be.revertedWith("proposal can only be executed if it is success and queued")

        await expect(stk.burn(user2.address, toWei("500"))).to.be.revertedWith("sender is locked");
        await stk.mint(user2.address, toWei("500"));
        await expect(stk.burn(user2.address, toWei("1000"))).to.be.revertedWith("sender is locked");

        await skipBlock(20);
        // QUEUE

        await printLock(pid, [user1, user2]);
        expect(await governor.state(pid)).to.equal(3)
        expect(await governor.callStatic.getUnlockBlock(user1.address)).to.equal(startBlock + 1 + 20 + 20 + 20); // delay + voting

        await skipBlock(20);
        // SUCCESS

        expect(await governor.state(pid)).to.equal(4)
        await governor.execute(pid)
        await printLock(pid, [user1, user2]);
        expect(await governor.state(pid)).to.equal(5)
        expect(await governor.callStatic.getUnlockBlock(user1.address)).to.equal(startBlock + 1 + 20 + 20 + 20); // delay + voting
    })

    it("lock - 3", async () => {
        await stk.mint(user1.address, toWei("1000"));
        await stk.mint(user2.address, toWei("1000"));
        await stk.mint(user3.address, toWei("500"));

        let tx1 = await (await governor.connect(user1).propose(
            ["setFastCreationEnabled(bool)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        )).wait();
        const t1Start = tx1.blockNumber;

        await skipBlock(2)

        let tx2 = await (await governor.connect(user2).propose(
            ["setFastCreationEnabled(bool)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        )).wait();
        const t2Start = tx2.blockNumber;

        expect(await governor.state(1)).to.equal(1)
        expect(await governor.state(2)).to.equal(0)
        expect(await governor.callStatic.getUnlockBlock(user1.address)).to.equal(t1Start + 1 + 20 + 1); // delay + voting + 1
        expect(await governor.callStatic.getUnlockBlock(user2.address)).to.equal(t2Start + 1 + 20 + 1); // delay + voting + 1
        expect(await governor.callStatic.getUnlockBlock(user3.address)).to.equal(0);

        await skipBlock(2);
        expect(await governor.state(1)).to.equal(1)
        expect(await governor.state(2)).to.equal(1)
        expect(await governor.callStatic.getUnlockBlock(user1.address)).to.equal(t1Start + 1 + 20 + 1); // delay + voting + 1
        expect(await governor.callStatic.getUnlockBlock(user2.address)).to.equal(t2Start + 1 + 20 + 1); // delay + voting + 1
        expect(await governor.callStatic.getUnlockBlock(user3.address)).to.equal(0);

        await governor.connect(user3).castVote(1, false);
        await governor.connect(user3).castVote(2, false);
        expect(await governor.callStatic.getUnlockBlock(user3.address)).to.equal(t2Start + 1 + 20 + 1); // delay + voting + 1
        await governor.connect(user1).castVote(2, false); // p2 will be defeated

        await skipBlock(20);
        expect(await governor.state(1)).to.equal(3)
        expect(await governor.state(2)).to.equal(2)
        expect(await governor.callStatic.getUnlockBlock(user1.address)).to.equal(t1Start + 1 + 20 + 20 + 20); // delay + voting + 1
        expect(await governor.callStatic.getUnlockBlock(user2.address)).to.equal(t2Start + 1 + 20 + 1); // delay + voting + 1
        expect(await governor.callStatic.getUnlockBlock(user3.address)).to.equal(t2Start + 1 + 20 + 1);
    })

    it("lock - 3", async () => {
        await stk.mint(user1.address, toWei("1000"));
        await stk.mint(user2.address, toWei("1000"));
        await stk.mint(user3.address, toWei("1000"));
        await stk.mint(user4.address, toWei("1000"));
        await stk.mint(user5.address, toWei("1000"));

        let tx1 = await (await governor.connect(user1).connect(user1).propose(
            ["setFastCreationEnabled(bool)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        )).wait();
        const t1Start = tx1.blockNumber;

        await skipBlock(2)
        let tx2 = await (await governor.connect(user2).propose(
            ["setFastCreationEnabled(bool)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        )).wait();
        const t2Start = tx2.blockNumber;
        // +3

        await skipBlock(2)
        let tx3 = await (await governor.connect(user3).propose(
            ["setFastCreationEnabled(bool)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        )).wait();
        const t3Start = tx3.blockNumber;
        // +3

        await skipBlock(2)
        let tx4 = await (await governor.connect(user4).propose(
            ["setFastCreationEnabled(bool)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        )).wait();
        const t4Start = tx4.blockNumber;
        // +3

        await skipBlock(2)

        await governor.connect(user5).castVote(1, false);
        await governor.connect(user5).castVote(2, true);
        await governor.connect(user5).castVote(3, true);
        await governor.connect(user5).castVote(4, false);
        // + 4

        expect(await governor.callStatic.getUnlockBlock(user5.address)).to.equal(t4Start + 1 + 20 + 1);

        await skipBlock(6)
        // @31 last active for p1
        expect(await governor.state(1)).to.equal(1)
        expect(await governor.state(2)).to.equal(1)
        expect(await governor.state(3)).to.equal(1)
        expect(await governor.state(4)).to.equal(1)

        await skipBlock(1)
        // @32 p1 defeated
        expect(await governor.state(1)).to.equal(2)
        expect(await governor.state(2)).to.equal(1)
        expect(await governor.state(3)).to.equal(1)
        expect(await governor.state(4)).to.equal(1)
        expect(await governor.callStatic.getUnlockBlock(user5.address)).to.equal(t4Start + 1 + 20 + 1);

        await skipBlock(3)
        // @35 p2 successed
        expect(await governor.state(1)).to.equal(2)
        expect(await governor.state(2)).to.equal(3)
        expect(await governor.state(3)).to.equal(1)
        expect(await governor.state(4)).to.equal(1)
        expect(await governor.callStatic.getUnlockBlock(user5.address)).to.equal(t2Start + 1 + 20 + 20 + 20);

        await skipBlock(3)
        // @38 p3 successed
        expect(await governor.state(1)).to.equal(2)
        expect(await governor.state(2)).to.equal(3)
        expect(await governor.state(3)).to.equal(3)
        expect(await governor.state(4)).to.equal(1)
        expect(await governor.callStatic.getUnlockBlock(user5.address)).to.equal(t3Start + 1 + 20 + 20 + 20);

        await skipBlock(3)
        // @41 p4 defeated
        expect(await governor.state(1)).to.equal(2)
        expect(await governor.state(2)).to.equal(3)
        expect(await governor.state(3)).to.equal(3)
        expect(await governor.state(4)).to.equal(2)
        expect(await governor.callStatic.getUnlockBlock(user5.address)).to.equal(t3Start + 1 + 20 + 20 + 20);

        await skipBlock(40)
        // @41 p4 defeated
        expect(await governor.state(1)).to.equal(2)
        expect(await governor.state(2)).to.equal(6)
        expect(await governor.state(3)).to.equal(6)
        expect(await governor.state(4)).to.equal(2)
        expect(await governor.callStatic.getUnlockBlock(user5.address)).to.equal(t3Start + 1 + 20 + 20 + 20);

        await skipBlock(1)
        console.log("transfer");
        await stk.connect(user5).transfer(user1.address, toWei("1000"));
    })

    it("lock - 4", async () => {
        await stk.mint(user1.address, toWei("1000"));
        await stk.mint(user2.address, toWei("1000"));
        await stk.mint(user3.address, toWei("1000"));
        await stk.mint(user4.address, toWei("1000"));
        await stk.mint(user5.address, toWei("1000"));

        await governor.connect(user1).connect(user1).propose(
            ["setFastCreationEnabled(bool)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        );

        await skipBlock(2)
        await governor.connect(user2).propose(
            ["setFastCreationEnabled(bool)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        );
        // +3

        await skipBlock(2)
        await governor.connect(user3).propose(
            ["setFastCreationEnabled(bool)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        );
        // +3

        await skipBlock(2)
        let tx4 = await (await governor.connect(user4).propose(
            ["setFastCreationEnabled(bool)"],
            ["0x0000000000000000000000000000000000000000000000000000000000000001"],
            "setFastCreationEnabled to true"
        )).wait();
        const t4Start = tx4.blockNumber;
        // +3

        await skipBlock(2)

        await governor.connect(user5).castVote(1, false);
        await governor.connect(user5).castVote(2, true);
        await governor.connect(user5).castVote(3, true);
        await governor.connect(user5).castVote(4, false);
        // + 4

        expect(await governor.callStatic.getUnlockBlock(user5.address)).to.equal(t4Start + 1 + 20 + 1);

        await skipBlock(6)
        await skipBlock(1)
        await skipBlock(3)
        await skipBlock(3)
        await skipBlock(3)
        await skipBlock(40)
        await skipBlock(1)
        console.log("transfer");
        await stk.connect(user5).transfer(user1.address, toWei("1000"));
    })


    it("create perpetual", async () => {

        const LiquidityPoolFactory = await createLiquidityPoolFactory();

        var symbol = await createContract("SymbolService");
        await symbol.initialize(10000);
        const ctk = await createContract("CustomERC20", ["collateral", "CTK", 18]);
        var poolCreator = await deployPoolCreator(symbol, user0, toWei("0.001"));
        await symbol.addWhitelistedFactory(poolCreator.address);

        var lp0Version = await LiquidityPoolFactory[0].deploy();
        var lp1Version = await LiquidityPoolFactory[1].deploy();
        var govVersion1 = await createContract("TestLpGovernor");
        await poolCreator.addVersion(
            [lp0Version.address, lp1Version.address],
            govVersion1.address,
            1,
            "version1"
        );

        const deployed1 = await poolCreator.connect(user1).callStatic.createLiquidityPool(ctk.address, 18, 996, ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1]));
        await poolCreator.connect(user1).createLiquidityPool(ctk.address, 18, 996, ethers.utils.defaultAbiCoder.encode(["bool", "int256", "uint256", "uint256"], [false, toWei("1000000"), 0, 1]));

        const oracle = await createContract("OracleAdaptor", ["USD", "ETH"]);
        await oracle.setIndexPrice(toWei("1000"), 1000)
        await oracle.setMarkPrice(toWei("1000"), 1000)
        const liquidityPool1 = await ethers.getContractAt("LiquidityPoolAllHops", deployed1[0]);
        const governor1 = await ethers.getContractAt("TestLpGovernor", deployed1[1]);

        const tx = await liquidityPool1.createPerpetual(
            oracle.address,
            [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("1")],
            [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1")],
            [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
            [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1")],
        )
        console.log(tx)
        await liquidityPool1.runLiquidityPool();


        await ctk.mint(user1.address, toWei("100000"))
        await ctk.connect(user1).approve(liquidityPool1.address, toWei("100000"))
        await liquidityPool1.connect(user1).addLiquidity(toWei("10000"))


        let pid = await governor1.connect(user1).callStatic.propose(
            ["createPerpetual(address,int256[9],int256[8],int256[8],int256[8])"],
            [
                ethers.utils.defaultAbiCoder.encode(
                    ["address", "int256[9]", "int256[8]", "int256[8]", "int256[8]"],
                    [
                        oracle.address,
                        [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("1")],
                        [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1")],
                        [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
                        [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1")],
                    ]
                )
            ],
            "create new perpetual"
        );

        console.log(ethers.utils.defaultAbiCoder.encode(
            ["address", "int256[9]", "int256[8]", "int256[8]", "int256[8]"],
            [
                oracle.address,
                [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("1")],
                [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1")],
                [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
                [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1")],
            ]
        ))

        await governor1.connect(user1).propose(
            ["createPerpetual(address,int256[9],int256[8],int256[8],int256[8])"],
            [
                ethers.utils.defaultAbiCoder.encode(
                    ["address", "int256[9]", "int256[8]", "int256[8]", "int256[8]"],
                    [
                        oracle.address,
                        [toWei("0.1"), toWei("0.05"), toWei("0.001"), toWei("0.001"), toWei("0.2"), toWei("0.02"), toWei("0.00000002"), toWei("0.5"), toWei("1")],
                        [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0"), toWei("5"), toWei("0.05"), toWei("0.01"), toWei("1")],
                        [toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0"), toWei("0")],
                        [toWei("0.1"), toWei("0.2"), toWei("0.2"), toWei("0.5"), toWei("10"), toWei("0.99"), toWei("1"), toWei("1")],
                    ]
                )
            ],
            "create new perpetual"
        );

        expect(await governor1.state(pid)).to.equal(0)

        await skipBlock(2);
        console.log(fromState(await governor1.state(pid)));
        expect(await governor1.state(pid)).to.equal(1)

        await skipBlock(20);
        console.log(fromState(await governor1.state(pid)));
        expect(await governor1.state(pid)).to.equal(3)

        await skipBlock(20);
        console.log(fromState(await governor1.state(pid)));
        expect(await governor1.state(pid)).to.equal(4)

        await governor1.execute(pid);
        console.log(fromState(await governor1.state(pid)));
        expect(await governor1.state(pid)).to.equal(5)
    });
})