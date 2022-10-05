const {expect} = require("chai");
const {supportChangeTokenBalance} = require("@nomicfoundation/hardhat-chai-matchers/internal/changeTokenBalance");

describe('Subscribe Contract', () => {
    let Subscribe, subscribe, owner, addr1, addr2;

    const ONE_SUB_PERIOD_COST = 1_000_000_000 // ONE_GWEI;
    const ONE_WEEK = 0
    const TWO_WEEKS = 1
    const THIRTY_DAYS = 2
    const ONE_DAY_SECONDS = 86400

    async function latestBlock() {
        return await ethers.provider.getBlock("latest");
    }

    async function nextBlockTimestamp(incremental_seconds) {
        if (incremental_seconds === undefined) {
            incremental_seconds = 60;
        }
        return await latestBlock().then((block) => {
            return block.timestamp + incremental_seconds
        });
    }

    async function incrementAndGetNextBlockTimestamp(incremental_seconds) {
        let timestamp = await nextBlockTimestamp(incremental_seconds);
        await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
        return timestamp;
    }

    beforeEach(async () => {
        Subscribe = await ethers.getContractFactory('Subscribe');
        subscribe = await Subscribe.deploy(0, ONE_SUB_PERIOD_COST);
        subscribe_14 = await Subscribe.deploy(1, ONE_SUB_PERIOD_COST);
        subscribe_30 = await Subscribe.deploy(2, ONE_SUB_PERIOD_COST);
        [owner, addr1, addr2, _] = await ethers.getSigners()
    });

    describe('Deployment', () => {
        it('should set the correct owner', async () => {
            expect(await subscribe.owner()).to.equal(owner.address);
        });

        it('should set the correct period', async () => {
            expect(await subscribe.subPeriod()).to.equal(ONE_WEEK);
        });

        it('should set the correct period cost', async () => {
            expect(await subscribe.periodCost()).to.equal(ONE_SUB_PERIOD_COST);
        });
    });
    describe('Create Subscription', () => {
        it('subscribing with amount less than one period cost', async () => {
            expect(subscribe.createSubscription({value: ONE_SUB_PERIOD_COST - 200})).to.revertedWith("Not enough to complete subscription.");
        });

        it('subscribing for the the first time', async () => {
            let timestamp = await incrementAndGetNextBlockTimestamp();
            await expect(subscribe.connect(addr1).createSubscription({value: ONE_SUB_PERIOD_COST}))
                .to.emit(subscribe, 'Subscribed')
                .withArgs(addr1.address, ONE_SUB_PERIOD_COST, timestamp);
            expect(await subscribe.isSubscribed(addr1.address)).eq(true)
            expect(await subscribe.connect(addr1).stakedAmount()).to.equal(ONE_SUB_PERIOD_COST);
            expect(await ethers.provider.getBalance(subscribe.address)).to.equal(ONE_SUB_PERIOD_COST);
        });

        it('try to subscribe while already subscribed with available balance > period cost', async () => {
            await subscribe.connect(addr1).createSubscription({value: ONE_SUB_PERIOD_COST * 3});
            let timestamp = await incrementAndGetNextBlockTimestamp();
            await subscribe.connect(addr2).createSubscription({value: ONE_SUB_PERIOD_COST * 3});
            expect(subscribe.createSubscription({value: ONE_SUB_PERIOD_COST})).to.revertedWith("Already subscribed.");
        });

        it('try to subscribe while already subscribed with available balance < period cost', async () => {
            await subscribe.connect(addr1).createSubscription({value: ONE_SUB_PERIOD_COST + ONE_SUB_PERIOD_COST / 2});
            expect(await subscribe.isSubscribed(addr1.address)).eq(true)
            expect(subscribe.createSubscription({value: ONE_SUB_PERIOD_COST})).to.revertedWith("Already subscribed.");
        });

        it('try to subscribe while already subscribed with available balance = period cost', async () => {
            await subscribe.connect(addr1).createSubscription({value: ONE_SUB_PERIOD_COST * 2});
            expect(await subscribe.isSubscribed(addr1.address)).eq(true)
            expect(subscribe.createSubscription({value: ONE_SUB_PERIOD_COST})).to.revertedWith("Already subscribed.");
        });

        it('Not subscribed, but was previously subscribed and ended', async () => {
            await subscribe.connect(addr1).createSubscription({value: ONE_SUB_PERIOD_COST});
            let timestamp = await incrementAndGetNextBlockTimestamp(ONE_DAY_SECONDS * 8);
            await subscribe.connect(addr2).createSubscription({value: ONE_SUB_PERIOD_COST});
            expect(await subscribe.isSubscribed(addr1.address)).eq(false)
            timestamp = await incrementAndGetNextBlockTimestamp(1);
            await expect(subscribe.connect(addr1).createSubscription({value: ONE_SUB_PERIOD_COST}))
                .to.emit(subscribe, 'Subscribed')
                .withArgs(addr1.address, ONE_SUB_PERIOD_COST, timestamp);
        });
    });

    describe('Increase Subscription', () => {
        it('increase subscription with one period worth of funds', async () => {
            await subscribe.createSubscription({value: ONE_SUB_PERIOD_COST});
            await subscribe.increaseSubscription({value: ONE_SUB_PERIOD_COST});
            expect(await subscribe.stakedAmount()).to.equal(ONE_SUB_PERIOD_COST * 2)
        });

        it('fail to increase subscription with less than one period worth of funds', async () => {
            await subscribe.createSubscription({value: ONE_SUB_PERIOD_COST});
            expect(
                subscribe.increaseSubscription({value: ONE_SUB_PERIOD_COST / 2})
            ).to.revertedWith("Not enough to increase subscription.");
        });

        it('increase subscription with one and 1/2 period worth of funds', async () => {
            let increaseAmount = ONE_SUB_PERIOD_COST + ONE_SUB_PERIOD_COST / 2;
            await subscribe.createSubscription({value: ONE_SUB_PERIOD_COST});
            await subscribe.increaseSubscription({value: increaseAmount});
            expect(await subscribe.stakedAmount()).to.equal(increaseAmount + ONE_SUB_PERIOD_COST)
        });

        it('Not subscribed anymore, trying to increase subscription', async () => {
            let increaseAmount = ONE_SUB_PERIOD_COST;
            await subscribe.createSubscription({value: ONE_SUB_PERIOD_COST});
            let timestamp = incrementAndGetNextBlockTimestamp(ONE_DAY_SECONDS*7);
            expect(subscribe.increaseSubscription({value: increaseAmount})).to.revertedWith("Not subscribed.");
        });
    });

    describe('Withdraw All', () => {

        it('Subscribed, in period, remaining balance = 0', async () => {
            await subscribe.connect(addr1).createSubscription({value: ONE_SUB_PERIOD_COST});
            expect(subscribe.connect(addr1).withdrawAll()).to.revertedWith("No funds available to withdraw.");
        });

        it('Subscribed, in period, remaining balance = 1 period', async () => {
            await subscribe.connect(addr1).createSubscription({value: ONE_SUB_PERIOD_COST*2});
            let balanceBefore = await ethers.provider.getBalance(addr1.address);
            let resp = await subscribe.connect(addr1).withdrawAll();
            let receipt = await resp.wait();
            let gas = receipt.gasUsed.mul(receipt.effectiveGasPrice);
            let balanceAfter = await ethers.provider.getBalance(addr1.address);
            expect(balanceAfter.add(gas).sub(balanceBefore)).eq(ONE_SUB_PERIOD_COST);
        });

        it('Subscribed, in period, 0 < remaining balance < 1 period', async () => {
            await subscribe.connect(addr1).createSubscription({value: ONE_SUB_PERIOD_COST + ONE_SUB_PERIOD_COST/2});
            let balanceBefore = await ethers.provider.getBalance(addr1.address);
            let resp = await subscribe.connect(addr1).withdrawAll();
            let receipt = await resp.wait();
            let gas = receipt.gasUsed.mul(receipt.effectiveGasPrice);
            let balanceAfter = await ethers.provider.getBalance(addr1.address);
            expect(balanceAfter.add(gas).sub(balanceBefore)).eq(ONE_SUB_PERIOD_COST/2);
        });

        it('Subscribed, start of the next period, cost is locked', async () => {
            await subscribe.connect(addr1).createSubscription({value: ONE_SUB_PERIOD_COST * 2});
            let timestamp = await incrementAndGetNextBlockTimestamp(ONE_DAY_SECONDS * 7);
            expect(subscribe.connect(addr1).withdrawAll()).to.revertedWith("No funds available to withdraw.");
        });

        it('Subscribed, withraw all, still subscribed until the end of the period', async () => {
            await subscribe.connect(addr1).createSubscription({value: ONE_SUB_PERIOD_COST * 3});
            let timestamp = await incrementAndGetNextBlockTimestamp(ONE_DAY_SECONDS * 6);
            await expect(subscribe.connect(addr1).withdrawAll())
                .to.emit(subscribe, 'Withdrawal')
                .withArgs(addr1.address, ONE_SUB_PERIOD_COST*2, timestamp);

            // Still subscribed until the end of the period
            expect(await subscribe.isSubscribed(addr1.address)).eq(true);
            expect(await subscribe.connect(addr1).availableBalance()).eq(0);

            // After period ends, no longer subscribed
            timestamp = await incrementAndGetNextBlockTimestamp(ONE_DAY_SECONDS * 2);
            await subscribe.connect(addr2).createSubscription({value: ONE_SUB_PERIOD_COST});
            expect(await subscribe.isSubscribed(addr1.address)).eq(false);
        });
    });

    describe('Get Available Balance', () => {
        it('has available balance of 1/2 period', async () => {
            await subscribe.connect(addr1).createSubscription({value: ONE_SUB_PERIOD_COST + ONE_SUB_PERIOD_COST / 2});
            expect(await subscribe.connect(addr1).availableBalance()).eq(ONE_SUB_PERIOD_COST / 2);
        });

        it('has available balance of 1 period', async () => {
            await subscribe.connect(addr1).createSubscription({value: ONE_SUB_PERIOD_COST * 2});
            expect(await subscribe.connect(addr1).availableBalance()).eq(ONE_SUB_PERIOD_COST);
        });

        it('has available no balance', async () => {
            await subscribe.connect(addr1).createSubscription({value: ONE_SUB_PERIOD_COST});
            expect(await subscribe.connect(addr1).availableBalance()).eq(0);
        });
    });

    describe('Get Deposit Timestamp', () => {
        it('get subscriber deposit timestamp with this sender address', async () => {
            let timestamp = await incrementAndGetNextBlockTimestamp();
            await subscribe.connect(addr1).createSubscription({value: ONE_SUB_PERIOD_COST});
            expect(await subscribe.connect(addr1).depositTimestamp()).eq(timestamp);
        });

        it('fail to get subscriber deposit timestamp when no subscriber', async () => {
            let timestamp = await incrementAndGetNextBlockTimestamp();
            expect(await subscribe.connect(addr1).depositTimestamp()).eq(0);
        });
    });

    describe('Is Subscribed', () => {
        it('(7 day period) still subscribed on day 7', async () => {
            await subscribe.connect(addr1).createSubscription({value: ONE_SUB_PERIOD_COST});
            let timestamp = await incrementAndGetNextBlockTimestamp(ONE_DAY_SECONDS * 7 - 1);
            await subscribe.connect(addr2).createSubscription({value: ONE_SUB_PERIOD_COST});
            let isSubscribed = await subscribe.isSubscribed(addr1.address);
            expect(isSubscribed).eq(true);
        });

        it('(7 day period) not subscribed on day 8', async () => {
            await subscribe.connect(addr1).createSubscription({value: ONE_SUB_PERIOD_COST});
            let timestamp = await incrementAndGetNextBlockTimestamp(ONE_DAY_SECONDS * 7);
            await subscribe.connect(addr2).createSubscription({value: ONE_SUB_PERIOD_COST});
            let isSubscribed = await subscribe.isSubscribed(addr1.address);
            expect(isSubscribed).eq(false);
        });

        it('(14 day period) still subscribed on day 14', async () => {
            await subscribe_14.connect(addr1).createSubscription({value: ONE_SUB_PERIOD_COST});
            let timestamp = await incrementAndGetNextBlockTimestamp(ONE_DAY_SECONDS * 14 - 1);
            await subscribe_14.connect(addr2).createSubscription({value: ONE_SUB_PERIOD_COST});
            let isSubscribed = await subscribe_14.isSubscribed(addr1.address);
            expect(isSubscribed).eq(true);
        });

        it('(14 day period) not subscribed on day 15', async () => {
            await subscribe_14.connect(addr1).createSubscription({value: ONE_SUB_PERIOD_COST});
            let timestamp = await incrementAndGetNextBlockTimestamp(ONE_DAY_SECONDS * 14);
            await subscribe_14.connect(addr2).createSubscription({value: ONE_SUB_PERIOD_COST});
            let isSubscribed = await subscribe_14.isSubscribed(addr1.address);
            expect(isSubscribed).eq(false);
        });

        it('(30 day period) still subscribed on day 30', async () => {
            await subscribe_30.connect(addr1).createSubscription({value: ONE_SUB_PERIOD_COST});
            let timestamp = await incrementAndGetNextBlockTimestamp(ONE_DAY_SECONDS * 30 - 1);
            await subscribe_30.connect(addr2).createSubscription({value: ONE_SUB_PERIOD_COST});
            let isSubscribed = await subscribe_30.isSubscribed(addr1.address);
            expect(isSubscribed).eq(true);
        });

        it('(30 day period) not subscribed on day 31', async () => {
            await subscribe_30.connect(addr1).createSubscription({value: ONE_SUB_PERIOD_COST});
            let timestamp = await incrementAndGetNextBlockTimestamp(ONE_DAY_SECONDS * 30);
            await subscribe_30.connect(addr2).createSubscription({value: ONE_SUB_PERIOD_COST});
            let isSubscribed = await subscribe_30.isSubscribed(addr1.address);
            expect(isSubscribed).eq(false);
        });
    });
});
