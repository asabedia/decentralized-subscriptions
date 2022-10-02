// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.9;

// Import this file to use console.log
import "hardhat/console.sol";

contract Subscribe {
    address public owner;
    Period public subPeriod;
    uint public periodCost;
    mapping(address => Subscriber) subscribers;

    struct Subscriber {
        address subscriberAddr;
        uint stakedAmount;
        uint depositTimestamp;
    }

    enum Period {SevenDays, FourteenDays, ThirtyDays}

    event Subscribed(address subscriberAddress, uint amount, uint when);
    event SubscriptionIncreased(address subscriberAddress, uint amount, uint when);

    event Withdrawal(address subscriberAddress, uint amount, uint when);

    constructor(Period subscriptionPeriod, uint costPerPeriod) {
        owner = msg.sender;
        subPeriod = subscriptionPeriod;
        periodCost = costPerPeriod;
    }

    function getSecondsInPeriod(Period p) internal view returns (uint) {
        uint secondsInDay = 86400;
        if (p == Period.SevenDays) {
            return 7 * secondsInDay;
        } else if (p == Period.FourteenDays) {
            return 14 * secondsInDay;
        } else if (p == Period.ThirtyDays) {
            return 30 * secondsInDay;
        }
        revert("unrecognized period.");
    }

    function createSubscription() external payable {
        address subscriberAddress = msg.sender;
        uint deposit = msg.value;
        uint when = block.timestamp;
        require(msg.value / periodCost > 0, "Not enough to complete subscription.");
        require(isSubscribed(subscriberAddress) == false, "Already subscribed.");
        emit Subscribed(subscriberAddress, deposit, when);
        subscribers[subscriberAddress] = Subscriber(subscriberAddress, deposit, when);
    }

    function increaseSubscription() external payable {
        address subscriberAddress = msg.sender;
        uint deposit = msg.value;
        uint when = block.timestamp;
        require(msg.value / periodCost > 0, "Not enough to increase subscription.");
        require(isSubscribed(subscriberAddress) == true, "Not subscribed.");
        Subscriber storage sub = subscribers[subscriberAddress];
        sub.stakedAmount += deposit;
        emit SubscriptionIncreased(subscriberAddress, deposit, when);
        subscribers[subscriberAddress] = sub;
    }

    /// @notice Withdraw total remaining un-consumed amount.
    function withdrawAll() external {
        address subscriberAddress = msg.sender;
        require(subscribers[subscriberAddress].stakedAmount > 0, "No funds for subscriber.");

        Subscriber storage sub = subscribers[subscriberAddress];
        uint availableAmount = availableBalance(block.timestamp, sub.depositTimestamp, sub.stakedAmount);
        require(availableAmount > 0, "No funds available to withdraw.");
        sub.stakedAmount -= availableAmount;
        emit Withdrawal(subscriberAddress, availableAmount, block.timestamp);
        (bool sent, bytes memory data) = payable(subscriberAddress).call{value : availableAmount}("");
        require(sent, "Failed to send.");
    }

    function isSubscribed(address subscriber) public view returns (bool){
        if (subscribers[subscriber].stakedAmount == 0) {
            return false;
        }
        Subscriber storage sub = subscribers[subscriber];
        uint periodsFunded = sub.stakedAmount / periodCost;
        uint periodsSinceDepositTime = periodsSinceDeposit(sub.depositTimestamp, block.timestamp);
        return periodsFunded >= (periodsSinceDepositTime);
    }

    function stakedAmount() public view returns (uint) {
        return subscribers[msg.sender].stakedAmount;
    }

    function depositTimestamp() public view returns (uint) {
        return subscribers[msg.sender].depositTimestamp;
    }

    function availableBalance() public view returns (uint) {
        address subscriberAddress = msg.sender;
        Subscriber storage sub = subscribers[subscriberAddress];
        return availableBalance(block.timestamp, sub.depositTimestamp, sub.stakedAmount);
    }

    function periodsSinceDeposit(uint depositTimestamp, uint now) private view returns (uint) {
        uint pCount = (now - depositTimestamp) / getSecondsInPeriod(subPeriod);
        pCount += 1;
        return pCount;
    }

    function availableBalance(uint now, uint depositTimestamp, uint totalStakedAmount) private view returns (uint) {
        uint pCount = periodsSinceDeposit(depositTimestamp, now);
        return totalStakedAmount - periodCost * pCount;
    }
}
