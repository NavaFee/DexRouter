const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
require("dotenv").config();

let universalRouter;

async function main() {
  if (network.name !== "mainnet") {
    console.log("This script is only for mainnet");
    return;
  }
  universalRouter = await ethers.getContractAt(
    "UniversalRouter",
    "0xA3dE85a6eAEE4B6bC1200420F6AF69Bd099DdE9C"
  );
  const feeRate = await universalRouter.getFeeRate();
  console.log("feeRate:", feeRate.toString());
  const feeCollector = await universalRouter.getFeeCollector();
  console.log("feeCollector:", feeCollector);

  const owner = await universalRouter.owner();
  console.log("owner:", owner);
}
main();
