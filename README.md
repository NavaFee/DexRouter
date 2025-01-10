# Sample Hardhat Project

This project demonstrates a basic Hardhat use case. It comes with a sample contract, a test for that contract, and a Hardhat Ignition module that deploys that contract.

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat ignition deploy ./ignition/modules/Lock.js
```

hardhat-tracer: 追踪合约间的调用

```shell
npx hardhat test --traceError # prints calls for failed txs
npx hardhat test --fulltraceError # prints calls and storage ops for failed txs
npx hardhat test --trace # prints calls for all txs
npx hardhat test --fulltrace # prints calls and storage ops for all txs

npx hardhat test --v    # same as --traceError
npx hardhat test --vv   # same as --fulltraceError
npx hardhat test --vvv  # same as --trace
npx hardhat test --vvvv # same as --fulltrace
```

Flattening your contracts

```shell
npx hardhat flatten contracts/Foo.sol > Flattened.sol
```
