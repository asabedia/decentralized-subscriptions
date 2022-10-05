# Subscription or Periodic locking

This project aims to allow users to deposit tokens that are periodically
`spent` in a way that mimics a subscription. 

## Scenario
A dAPP requires a user to pay 1 GWEI every 7 days in order to access it.

A user deposits 5 GWEI into the contract by calling the `subscribe` function 
with 5 GWEI. When calling the `isSubscribed` function, the user will now
be subscribed.

After one period (7 days in this case), the user calls `withdrawAll` and will receive
the remaining `unspent` amount which will be equal to 3  GWEI. 1 GWEI is `spent`
at subscription, 1 GWEI is spent at the beginning of the next period (end of day 7).

If the user wishes to prolong the subscription and increase their deposit, they can do so
by using the `increaseSubscription` function.

### Setting up

1. Install node
2. Install the npm packages
```shell
npm install
```

### Running the tests

```shell
npx hardhat help
npx hardhat test
```
