const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
require("dotenv").config();

async function main() {
  if (network.name !== "mainnet") {
    console.log("This script is only for mainnet");
    return;
  }
  const dexRouter = await ethers.getContractAt(
    "DexRouter",
    process.env.BASE_DEX_ROUTER
  );
  const feeRate = await dexRouter.getFeeRate();
  console.log("feeRate:", feeRate.toString());
  const feeCollector = await dexRouter.getFeeCollector();
  console.log("feeCollector:", feeCollector);

  // 设置手续费币种
  // await dexRouter.setFeeTokens(
  //   [process.env.BASE_USDC, process.env.BASE_USDT],
  //   [true, true]
  // );
  checkIsFeeToken(dexRouter, process.env.BASE_USDC);
}
main();

async function checkIsFeeToken(dexRouter, token) {
  const isFeeToken = await dexRouter.checkIsFeeToken(token);
  console.log(token, isFeeToken);
}
