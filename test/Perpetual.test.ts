import BigNumber from 'bignumber.js';
import { expect, use } from "chai";
import {
    toWei,
    fromWei,
    toBytes32,
    getAccounts,
    createContract,
} from '../scripts/utils';
import "./helper";


describe('Perpetual', () => {
    let accounts;
    let user0;
    let user1;
    let user2;
    let user3;
    let oracle;
    let perpetual;

    before(async () => {
        accounts = await getAccounts();
        user0 = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];
    })

    beforeEach(async () => {
        const PerpetualModule = await createContract("PerpetualModule");
        perpetual = await createContract("TestPerpetual", [], {
            PerpetualModule
        });
        oracle = await createContract("OracleAdaptor", ["USD", "ETH"]);
        var now = Math.floor(Date.now() / 1000);
        await oracle.setMarkPrice(toWei("100"), now);
        await oracle.setIndexPrice(toWei("100"), now);
        await perpetual.createPerpetual(
            oracle.address,
            // imr         mmr            operatorfr       lpfr             rebate      penalty         keeper      insur       oi
            [toWei("0.1"), toWei("0.05"), toWei("0.0001"), toWei("0.0007"), toWei("0"), toWei("0.005"), toWei("1"), toWei("0"), toWei("1")],
            [toWei("0.01"), toWei("0.1"), toWei("0.06"), toWei("0.1"), toWei("5"), toWei('0.05'), toWei("0.01"), toWei("1"), toWei("0")],
        )
        await perpetual.setState(0, 2);
    });

    it("getMarkPrice && getIndexPrice", async () => {
        var now = Math.floor(Date.now() / 1000);
        await oracle.setMarkPrice(toWei("500"), now);
        await oracle.setIndexPrice(toWei("501"), now);

        expect(await perpetual.getMarkPrice(0)).to.equal(toWei("0"));
        expect(await perpetual.getIndexPrice(0)).to.equal(toWei("0"));

        var tx = await perpetual.updatePrice(0);
        expect(await perpetual.getMarkPrice(0)).to.equal(toWei("500"));
        expect(await perpetual.getIndexPrice(0)).to.equal(toWei("501"));

        await perpetual.updatePrice(0);
        await perpetual.setEmergencyState(0);

        await oracle.setMarkPrice(toWei("600"), now);
        await oracle.setIndexPrice(toWei("601"), now);
        expect(await perpetual.getMarkPrice(0)).to.equal(toWei("500"));
        expect(await perpetual.getIndexPrice(0)).to.equal(toWei("500"));
    });

    it("getRebalanceMargin", async () => {
        var now = Math.floor(Date.now() / 1000);
        await oracle.setMarkPrice(toWei("500"), now);
        await oracle.setIndexPrice(toWei("500"), now);
        await perpetual.updatePrice(0);

        await perpetual.setMarginAccount(0, perpetual.address, toWei("0"), toWei("1"));
        expect(await perpetual.getRebalanceMargin(0)).to.equal(toWei("450"));
        await perpetual.setMarginAccount(0, perpetual.address, toWei("-500"), toWei("1"));
        expect(await perpetual.getRebalanceMargin(0)).to.equal(toWei("-50"));
        await perpetual.setMarginAccount(0, perpetual.address, toWei("-450"), toWei("1"));
        expect(await perpetual.getRebalanceMargin(0)).to.equal(toWei("0"));

        await perpetual.setMarginAccount(0, perpetual.address, toWei("0"), toWei("0"));
        expect(await perpetual.getRebalanceMargin(0)).to.equal(toWei("0"));

        await perpetual.setMarginAccount(0, perpetual.address, toWei("500"), toWei("-1"));
        expect(await perpetual.getRebalanceMargin(0)).to.equal(toWei("-50"));
        await perpetual.setMarginAccount(0, perpetual.address, toWei("-500"), toWei("-1"));
        expect(await perpetual.getRebalanceMargin(0)).to.equal(toWei("-1050"));
        await perpetual.setMarginAccount(0, perpetual.address, toWei("550"), toWei("-1"));
        expect(await perpetual.getRebalanceMargin(0)).to.equal(toWei("0"));

    });

    it("setNormalState", async () => {
        await perpetual.setState(0, 1);
        expect(await perpetual.getState(0)).to.equal(1);

        await perpetual.setNormalState(0);
        expect(await perpetual.getState(0)).to.equal(2);

        await perpetual.setState(0, 0);
        await expect(perpetual.setNormalState(0)).to.be.revertedWith("perpetual should be in initializing state");
        await perpetual.setState(0, 2);
        await expect(perpetual.setNormalState(0)).to.be.revertedWith("perpetual should be in initializing state");
        await perpetual.setState(0, 3);
        await expect(perpetual.setNormalState(0)).to.be.revertedWith("perpetual should be in initializing state");
        await perpetual.setState(0, 4);
        await expect(perpetual.setNormalState(0)).to.be.revertedWith("perpetual should be in initializing state");
    });

    it("setEmergencyState", async () => {
        await perpetual.setState(0, 2);
        expect(await perpetual.getState(0)).to.equal(2);

        await perpetual.setEmergencyState(0);
        expect(await perpetual.getState(0)).to.equal(3);

        await perpetual.setState(0, 0);
        await expect(perpetual.setEmergencyState(0)).to.be.revertedWith("perpetual should be in NORMAL state");
        await perpetual.setState(0, 1);
        await expect(perpetual.setEmergencyState(0)).to.be.revertedWith("perpetual should be in NORMAL state");
        await perpetual.setState(0, 3);
        await expect(perpetual.setEmergencyState(0)).to.be.revertedWith("perpetual should be in NORMAL state");
        await perpetual.setState(0, 4);
        await expect(perpetual.setEmergencyState(0)).to.be.revertedWith("perpetual should be in NORMAL state");
    });

    it("setClearedState", async () => {
        await perpetual.setState(0, 3);
        expect(await perpetual.getState(0)).to.equal(3);

        await perpetual.setClearedState(0);
        expect(await perpetual.getState(0)).to.equal(4);

        await perpetual.setState(0, 0);
        await expect(perpetual.setClearedState(0)).to.be.revertedWith("perpetual should be in emergency state");
        await perpetual.setState(0, 1);
        await expect(perpetual.setClearedState(0)).to.be.revertedWith("perpetual should be in emergency state");
        await perpetual.setState(0, 2);
        await expect(perpetual.setClearedState(0)).to.be.revertedWith("perpetual should be in emergency state");
        await perpetual.setState(0, 4);
        await expect(perpetual.setClearedState(0)).to.be.revertedWith("perpetual should be in emergency state");
    })

    it("deposit", async () => {
        await perpetual.setState(0, 2);

        var { cash, position } = await perpetual.callStatic.getMarginAccount(0, user0.address);
        expect(cash).to.equal(toWei("0"));
        expect(position).to.equal(toWei("0"));
        expect(await perpetual.isTraderRegistered(0, user0.address)).to.be.false;

        await perpetual.deposit(0, user0.address, toWei("10"));
        var { cash, position } = await perpetual.callStatic.getMarginAccount(0, user0.address);
        expect(cash).to.equal(toWei("10"));
        expect(position).to.equal(toWei("0"));
        expect(await perpetual.isTraderRegistered(0, user0.address)).to.be.true;

        await perpetual.deposit(0, user0.address, toWei("11"));
        var { cash, position } = await perpetual.callStatic.getMarginAccount(0, user0.address);
        expect(cash).to.equal(toWei("21"));
        expect(position).to.equal(toWei("0"));

        await expect(perpetual.deposit(0, user0.address, toWei("0"))).to.be.revertedWith("amount should greater than 0");
        await expect(perpetual.deposit(0, user0.address, toWei("-1"))).to.be.revertedWith("amount should greater than 0");
    })

    it("withdraw", async () => {
        await perpetual.setState(0, 2);

        await perpetual.deposit(0, user0.address, toWei("100"));
        expect(await perpetual.isTraderRegistered(0, user0.address)).to.be.true;

        var { cash, position } = await perpetual.callStatic.getMarginAccount(0, user0.address);
        expect(cash).to.equal(toWei("100"));
        expect(position).to.equal(toWei("0"));

        await perpetual.withdraw(0, user0.address, toWei("10"));
        var { cash, position } = await perpetual.callStatic.getMarginAccount(0, user0.address);
        expect(cash).to.equal(toWei("90"));
        expect(position).to.equal(toWei("0"));

        await perpetual.withdraw(0, user0.address, toWei("90"));
        var { cash, position } = await perpetual.callStatic.getMarginAccount(0, user0.address);
        expect(cash).to.equal(toWei("0"));
        expect(position).to.equal(toWei("0"));
        expect(await perpetual.isTraderRegistered(0, user0.address)).to.be.false;

        await expect(perpetual.withdraw(0, user0.address, toWei("10"))).to.be.revertedWith("margin is unsafe after withdrawal");

        await perpetual.setTotalCollateral(0, toWei("10"));
        await expect(perpetual.withdraw(0, user0.address, toWei("10"))).to.be.revertedWith("margin is unsafe after withdrawal");

        await expect(perpetual.withdraw(0, user0.address, toWei("0"))).to.be.revertedWith("amount should greater than 0");
        await expect(perpetual.withdraw(0, user0.address, toWei("-1"))).to.be.revertedWith("amount should greater than 0");
    })


    it("withdraw - market closed", async () => {
        await perpetual.setState(0, 2);

        await perpetual.deposit(0, user0.address, toWei("100"));
        expect(await perpetual.isTraderRegistered(0, user0.address)).to.be.true;

        var { cash, position } = await perpetual.callStatic.getMarginAccount(0, user0.address);
        expect(cash).to.equal(toWei("100"));
        expect(position).to.equal(toWei("0"));

        await oracle.setMarketClosed(true);

        await perpetual.withdraw(0, user0.address, toWei("10"));
        var { cash, position } = await perpetual.callStatic.getMarginAccount(0, user0.address);
        expect(cash).to.equal(toWei("90"));
        expect(position).to.equal(toWei("0"));

        await perpetual.setMarginAccount(0, user0.address, toWei("90"), toWei("1")) // +1 position
        await expect(perpetual.withdraw(0, user0.address, toWei("10"))).to.be.revertedWith("market is closed");

        await perpetual.setMarginAccount(0, user0.address, toWei("90"), toWei("0")) // +1 position

        await perpetual.withdraw(0, user0.address, toWei("90"));
        var { cash, position } = await perpetual.callStatic.getMarginAccount(0, user0.address);
        expect(cash).to.equal(toWei("0"));
        expect(position).to.equal(toWei("0"));
    })


    it("clear", async () => {
        await perpetual.setState(0, 2);

        await perpetual.deposit(0, user0.address, toWei("1"));
        await perpetual.deposit(0, user1.address, toWei("2"));
        await perpetual.deposit(0, user2.address, toWei("3"));
        await perpetual.deposit(0, user3.address, toWei("4"));
        expect(await perpetual.getActiveUserCount(0)).to.equal(4);

        await perpetual.setEmergencyState(0);
        expect(await perpetual.getActiveUserCount(0)).to.equal(4);

        await perpetual.clear(0, user0.address);
        expect(await perpetual.getActiveUserCount(0)).to.equal(3);

        await perpetual.clear(0, user1.address);
        expect(await perpetual.getActiveUserCount(0)).to.equal(2);

        expect(await perpetual.callStatic.clear(0, user2.address)).to.be.false;
        await perpetual.clear(0, user2.address);
        expect(await perpetual.getActiveUserCount(0)).to.equal(1);

        await expect(perpetual.clear(0, user2.address)).to.be.revertedWith("account cannot be cleared or already cleared");

        expect(await perpetual.callStatic.clear(0, user3.address)).to.be.true;
        await perpetual.clear(0, user3.address);
        expect(await perpetual.getActiveUserCount(0)).to.equal(0);

        await expect(perpetual.clear(0, user3.address)).to.be.revertedWith("no account to clear");
    })

    it("clear - 2", async () => {
        await perpetual.setState(0, 2);

        var now = Math.floor(Date.now() / 1000);
        await oracle.setMarkPrice(toWei("100"), now);
        await oracle.setIndexPrice(toWei("100"), now);
        await perpetual.updatePrice(0);

        await perpetual.registerActiveAccount(0, user0.address);
        await perpetual.registerActiveAccount(0, user1.address);
        await perpetual.registerActiveAccount(0, user2.address);
        await perpetual.registerActiveAccount(0, user3.address);
        await perpetual.setMarginAccount(0, user0.address, toWei("100"), toWei("0"));
        await perpetual.setMarginAccount(0, user1.address, toWei("200"), toWei("0"));
        await perpetual.setMarginAccount(0, user2.address, toWei("-200"), toWei("1"));
        await perpetual.setMarginAccount(0, user3.address, toWei("0"), toWei("1"));

        await perpetual.setEmergencyState(0);

        await perpetual.clear(0, user0.address);
        expect(await perpetual.getTotalMarginWithPosition(0)).to.equal("0");
        expect(await perpetual.getTotalMarginWithoutPosition(0)).to.equal(toWei("100"));

        await perpetual.clear(0, user1.address);
        expect(await perpetual.getTotalMarginWithPosition(0)).to.equal("0");
        expect(await perpetual.getTotalMarginWithoutPosition(0)).to.equal(toWei("300"));
        await perpetual.clear(0, user2.address);
        expect(await perpetual.getTotalMarginWithPosition(0)).to.equal("0");
        expect(await perpetual.getTotalMarginWithoutPosition(0)).to.equal(toWei("300"));

        await perpetual.clear(0, user3.address);
        expect(await perpetual.getTotalMarginWithPosition(0)).to.equal(toWei("100"));
        expect(await perpetual.getTotalMarginWithoutPosition(0)).to.equal(toWei("300"));

        await perpetual.setClearedState(0);

        // p = 100, nop = 300
        await perpetual.setTotalCollateral(0, toWei("300"))
        await perpetual.settleCollateral(0);
        expect(await perpetual.getRedemptionRateWithoutPosition(0)).to.equal(toWei("1"));
        expect(await perpetual.getRedemptionRateWithPosition(0)).to.equal(toWei("0"));

        await perpetual.setTotalCollateral(0, toWei("350"))
        await perpetual.settleCollateral(0);
        expect(await perpetual.getRedemptionRateWithoutPosition(0)).to.equal(toWei("1"));
        expect(await perpetual.getRedemptionRateWithPosition(0)).to.equal(toWei("0.5"));

        await perpetual.setTotalCollateral(0, toWei("150"))
        await perpetual.settleCollateral(0);
        expect(await perpetual.getRedemptionRateWithoutPosition(0)).to.equal(toWei("0.5"));
        expect(await perpetual.getRedemptionRateWithPosition(0)).to.equal(toWei("0"));

        await perpetual.setTotalCollateral(0, toWei("0"))
        await perpetual.settleCollateral(0);
        expect(await perpetual.getRedemptionRateWithoutPosition(0)).to.equal(toWei("0"));
        expect(await perpetual.getRedemptionRateWithPosition(0)).to.equal(toWei("0"));
    })


    it("getNextActiveAccount", async () => {
        await perpetual.setState(0, 2);

        await perpetual.deposit(0, user0.address, toWei("1"));
        await perpetual.deposit(0, user1.address, toWei("2"));
        await perpetual.deposit(0, user2.address, toWei("3"));
        await perpetual.deposit(0, user3.address, toWei("4"));

        var account = await perpetual.getNextActiveAccount(0);
        expect(account).to.equal(user0.address);
        await perpetual.clear(0, account);

        var account = await perpetual.getNextActiveAccount(0);
        expect(account).to.equal(user3.address);
        await perpetual.clear(0, account);

        var account = await perpetual.getNextActiveAccount(0);
        expect(account).to.equal(user2.address);
        await perpetual.clear(0, account);

        var account = await perpetual.getNextActiveAccount(0);
        expect(account).to.equal(user1.address);
        await perpetual.clear(0, account);

        await expect(perpetual.getNextActiveAccount(0)).to.be.revertedWith("no active account");
    })

    it("settle", async () => {
        await perpetual.setState(0, 2);

        var now = Math.floor(Date.now() / 1000);
        await oracle.setMarkPrice(toWei("100"), now);
        await oracle.setIndexPrice(toWei("100"), now);
        await perpetual.updatePrice(0);

        await perpetual.registerActiveAccount(0, user0.address);
        await perpetual.registerActiveAccount(0, user1.address);
        await perpetual.registerActiveAccount(0, user2.address);
        await perpetual.registerActiveAccount(0, user3.address);
        await perpetual.setMarginAccount(0, user0.address, toWei("100"), toWei("0"));
        await perpetual.setMarginAccount(0, user1.address, toWei("200"), toWei("0"));
        await perpetual.setMarginAccount(0, user2.address, toWei("-200"), toWei("1"));
        await perpetual.setMarginAccount(0, user3.address, toWei("0"), toWei("1"));

        await perpetual.setEmergencyState(0);
        await perpetual.clear(0, user0.address);
        await perpetual.clear(0, user1.address);
        await perpetual.clear(0, user2.address);
        await perpetual.clear(0, user3.address);

        await perpetual.setClearedState(0);
        // p = 100, nop = 300
        await perpetual.setTotalCollateral(0, toWei("350"))
        await perpetual.settleCollateral(0);
        expect(await perpetual.getRedemptionRateWithoutPosition(0)).to.equal(toWei("1"));
        expect(await perpetual.getRedemptionRateWithPosition(0)).to.equal(toWei("0.5"));

        expect(await perpetual.getSettleableMargin(0, user0.address)).to.equal(toWei("100"));
        expect(await perpetual.getSettleableMargin(0, user1.address)).to.equal(toWei("200"));
        expect(await perpetual.getSettleableMargin(0, user2.address)).to.equal(toWei("0"));
        expect(await perpetual.getSettleableMargin(0, user3.address)).to.equal(toWei("50"));

        expect(await perpetual.callStatic.settle(0, user0.address)).to.equal(toWei("100"));
        await perpetual.settle(0, user0.address);
        var { cash, position } = await perpetual.callStatic.getMarginAccount(0, user0.address);
        expect(cash).to.equal(toWei("0"));
        expect(position).to.equal(toWei("0"));

        expect(await perpetual.callStatic.settle(0, user1.address)).to.equal(toWei("200"));
        await perpetual.settle(0, user1.address);
        var { cash, position } = await perpetual.callStatic.getMarginAccount(0, user1.address);
        expect(cash).to.equal(toWei("0"));
        expect(position).to.equal(toWei("0"));

        expect(await perpetual.callStatic.settle(0, user2.address)).to.equal(toWei("0"));
        await perpetual.settle(0, user2.address);
        var { cash, position } = await perpetual.callStatic.getMarginAccount(0, user2.address);
        expect(cash).to.equal(toWei("0"));
        expect(position).to.equal(toWei("0"));

        expect(await perpetual.callStatic.settle(0, user3.address)).to.equal(toWei("50"));
        await perpetual.settle(0, user3.address);
        var { cash, position } = await perpetual.callStatic.getMarginAccount(0, user3.address);
        expect(cash).to.equal(toWei("0"));
        expect(position).to.equal(toWei("0"));
    })

})

