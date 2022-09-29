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
            expect(await subscribe.balanceOf()).to.equal(ONE_SUB_PERIOD_COST*2)
        });

        it('fail to increase subscription with less than one period worth of funds', async () => {
            await subscribe.createSubscription({value: ONE_SUB_PERIOD_COST});
            expect(
                subscribe.increaseSubscription({value: ONE_SUB_PERIOD_COST/2})
            ).to.revertedWith("Not enough to increase subscription.");
        });

        it('increase subscription with one and 1/2 period worth of funds', async () => {
            let increaseAmount = ONE_SUB_PERIOD_COST + ONE_SUB_PERIOD_COST/2;
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
            await subscribe.connect(addr1).createSubscription({value: ONE_SUB_PERIOD_COST + ONE_SUB_PERIOD_COST/2});
            expect(await subscribe.connect(addr1).availableBalance()).eq(ONE_SUB_PERIOD_COST/2);
        });

        it('has available balance of 1 period', async () => {
            await subscribe.connect(addr1).createSubscription({value: ONE_SUB_PERIOD_COST*2});
            expect(await subscribe.connect(addr1).availableBalance()).eq(ONE_SUB_PERIOD_COST);
        });

        it('has available no balance', async () => {
            await subscribe.connect(addr1).createSubscription({value: ONE_SUB_PERIOD_COST});
            expect(await subscribe.connect(addr1).availableBalance()).eq(0);
        });
    });
});

// const {
//   time,
//   loadFixture,
// } = require("@nomicfoundation/hardhat-network-helpers");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
// const { expect } = require("chai");
//
// describe("Lock", function () {
//   // We define a fixture to reuse the same setup in every test.
//   // We use loadFixture to run this setup once, snapshot that state,
//   // and reset Hardhat Network to that snapshot in every test.
//   async function deployOneYearLockFixture() {
//     const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;
//     const ONE_GWEI = 1_000_000_000;
//
//     const lockedAmount = ONE_GWEI;
//     const unlockTime = (await time.latest()) + ONE_YEAR_IN_SECS;
//
//     // Contracts are deployed using the first signer/account by default
//     const [owner, otherAccount] = await ethers.getSigners();
//
//     const Lock = await ethers.getContractFactory("Lock");
//     const lock = await Lock.deploy(unlockTime, { value: lockedAmount });
//
//     return { lock, unlockTime, lockedAmount, owner, otherAccount };
//   }
//
//   describe("Deployment", function () {
//     it("Should set the right unlockTime", async function () {
//       const { lock, unlockTime } = await loadFixture(deployOneYearLockFixture);
//
//       expect(await lock.unlockTime()).to.equal(unlockTime);
//     });
//
//     it("Should set the right owner", async function () {
//       const { lock, owner } = await loadFixture(deployOneYearLockFixture);
//
//       expect(await lock.owner()).to.equal(owner.address);
//     });
//
//     it("Should receive and store the funds to lock", async function () {
//       const { lock, lockedAmount } = await loadFixture(
//         deployOneYearLockFixture
//       );
//
//       expect(await ethers.provider.getBalance(lock.address)).to.equal(
//         lockedAmount
//       );
//     });
//
//     it("Should fail if the unlockTime is not in the future", async function () {
//       // We don't use the fixture here because we want a different deployment
//       const latestTime = await time.latest();
//       const Lock = await ethers.getContractFactory("Lock");
//       await expect(Lock.deploy(latestTime, { value: 1 })).to.be.revertedWith(
//         "Unlock time should be in the future"
//       );
//     });
//   });
//
//   describe("Withdrawals", function () {
//     describe("Validations", function () {
//       it("Should revert with the right error if called too soon", async function () {
//         const { lock } = await loadFixture(deployOneYearLockFixture);
//
//         await expect(lock.withdraw()).to.be.revertedWith(
//           "You can't withdraw yet"
//         );
//       });
//
//       it("Should revert with the right error if called from another account", async function () {
//         const { lock, unlockTime, otherAccount } = await loadFixture(
//           deployOneYearLockFixture
//         );
//
//         // We can increase the time in Hardhat Network
//         await time.increaseTo(unlockTime);
//
//         // We use lock.connect() to send a transaction from another account
//         await expect(lock.connect(otherAccount).withdraw()).to.be.revertedWith(
//           "You aren't the owner"
//         );
//       });
//
//       it("Shouldn't fail if the unlockTime has arrived and the owner calls it", async function () {
//         const { lock, unlockTime } = await loadFixture(
//           deployOneYearLockFixture
//         );
//
//         // Transactions are sent using the first signer by default
//         await time.increaseTo(unlockTime);
//
//         await expect(lock.withdraw()).not.to.be.reverted;
//       });
//     });
//
//     describe("Events", function () {
//       it("Should emit an event on withdrawals", async function () {
//         const { lock, unlockTime, lockedAmount } = await loadFixture(
//           deployOneYearLockFixture
//         );
//
//         await time.increaseTo(unlockTime);
//
//         await expect(lock.withdraw())
//           .to.emit(lock, "Withdrawal")
//           .withArgs(lockedAmount, anyValue); // We accept any value as `when` arg
//       });
//     });
//
//     describe("Transfers", function () {
//       it("Should transfer the funds to the owner", async function () {
//         const { lock, unlockTime, lockedAmount, owner } = await loadFixture(
//           deployOneYearLockFixture
//         );
//
//         await time.increaseTo(unlockTime);
//
//         await expect(lock.withdraw()).to.changeEtherBalances(
//           [owner, lock],
//           [lockedAmount, -lockedAmount]
//         );
//       });
//     });
//   });
// });
