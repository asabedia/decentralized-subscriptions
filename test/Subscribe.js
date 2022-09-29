const {expect} = require("chai");
const {supportChangeTokenBalance} = require("@nomicfoundation/hardhat-chai-matchers/internal/changeTokenBalance");

describe('Subscribe Contract', () => {
    let Subscribe, subscribe, owner, addr1, addr2;

    const ONE_SUB_PERIOD_COST = 1_000_000_000 // ONE_GWEI;
    const ONE_WEEK = 0
    const TWO_WEEKS = 1
    const THIRTY_DAYS = 2

    async function latestBlock() {
        return await ethers.provider.getBlock("latest");
    }

    async function nextBlockTimestamp() {
        return await latestBlock().then((block) => {
            return block.timestamp + 60
        });
    }

    async function setNextBlockTimestamp() {
        let timestamp = await nextBlockTimestamp();
        await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
        return timestamp;
    }

    beforeEach(async () => {
        Subscribe = await ethers.getContractFactory('Subscribe');
        subscribe = await Subscribe.deploy(0, ONE_SUB_PERIOD_COST);
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
        it('subscribing for the first time with one period worth of funds', async () => {
            let timestamp = await setNextBlockTimestamp();
            await expect(subscribe.createSubscription({value: ONE_SUB_PERIOD_COST}))
                .to.emit(subscribe, 'Subscribed')
                .withArgs(owner.address, ONE_SUB_PERIOD_COST, timestamp);
            expect(await subscribe.balanceOf()).to.equal(ONE_SUB_PERIOD_COST);
            expect(await ethers.provider.getBalance(subscribe.address)).to.equal(ONE_SUB_PERIOD_COST);
        });

        it('subscribing for the second time with one period worth of funds', async () => {
            await subscribe.createSubscription({value: ONE_SUB_PERIOD_COST});
            expect(subscribe.createSubscription({value: ONE_SUB_PERIOD_COST})).to.revertedWith("Already subscribed.");
        });

        it('subscribing with amount less than one period cost', async () => {
            expect(subscribe.createSubscription({value: ONE_SUB_PERIOD_COST - 200})).to.revertedWith("Not enough to complete subscription.");
        });

        it('subscribing with amount equal to a subscription period costs and half', async () => {
            let deposit = ONE_SUB_PERIOD_COST + ONE_SUB_PERIOD_COST / 2
            await subscribe.createSubscription({value: deposit})
            expect(await subscribe.balanceOf()).to.equal(deposit)
        });
    });

    describe('Increase Subscription', () => {
        it('increase subscription with one period worth of funds', async () => {
            await subscribe.createSubscription({value: ONE_SUB_PERIOD_COST});
            await subscribe.increaseSubscription({value: ONE_SUB_PERIOD_COST});
            expect(await subscribe.balanceOf()).to.equal(ONE_SUB_PERIOD_COST * 2)
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
            expect(await subscribe.balanceOf()).to.equal(increaseAmount + ONE_SUB_PERIOD_COST)
        });
    });

    describe('Withdraw All', () => {
        it('can withdraw funds that are not yet consumed (one extra)', async () => {
            await subscribe.connect(addr1).createSubscription({value: ONE_SUB_PERIOD_COST * 2});
            let balanceBefore = await ethers.provider.getBalance(addr1.address);
            let resp = await subscribe.connect(addr1).withdrawAll();
            let receipt = await resp.wait();
            let gas = receipt.gasUsed.mul(receipt.effectiveGasPrice);
            let balanceAfter = await ethers.provider.getBalance(addr1.address);
            expect(balanceAfter.add(gas).sub(balanceBefore)).eq(ONE_SUB_PERIOD_COST);
        });

        it('can withdraw funds that are not yet consumed (two extra periods)', async () => {
            await subscribe.connect(addr1).createSubscription({value: ONE_SUB_PERIOD_COST * 3});
            let balanceBefore = await ethers.provider.getBalance(addr1.address);
            let resp = await subscribe.connect(addr1).withdrawAll();
            let receipt = await resp.wait();
            let gas = receipt.gasUsed.mul(receipt.effectiveGasPrice);
            let balanceAfter = await ethers.provider.getBalance(addr1.address);
            expect(balanceAfter.add(gas).sub(balanceBefore)).eq(ONE_SUB_PERIOD_COST * 2);
        });

        it('can withdraw funds that are not yet consumed (not enough for another period)', async () => {
            await subscribe.connect(addr1).createSubscription({value: ONE_SUB_PERIOD_COST + ONE_SUB_PERIOD_COST / 2});
            let balanceBefore = await ethers.provider.getBalance(addr1.address);
            let resp = await subscribe.connect(addr1).withdrawAll();
            let receipt = await resp.wait();
            let gas = receipt.gasUsed.mul(receipt.effectiveGasPrice);
            let balanceAfter = await ethers.provider.getBalance(addr1.address);
            expect(balanceAfter.add(gas).sub(balanceBefore)).eq(ONE_SUB_PERIOD_COST / 2);
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
});
