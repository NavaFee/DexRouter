const { network, ethers } = require("hardhat");

require("dotenv").config();
const fs = require("fs");

module.exports = async function ({ getNamedAccounts, deployments }) {
  if (network.name !== "mainnet") {
    console.log("This script is only for mainnet");
    return;
  }
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  console.log("deployer:", deployer);
  const feeCollector = deployer;
  const fee = 10000;
  const weth = process.env.ETH_SEPOLIA_WETH;
  const aeroV2Router = process.env.BASE_AERO_V2_ROUTER;
  const aeroV3Router = process.env.BASE_AERO_V3_ROUTER;

  log("----------------------------------------------------");

  const args = [feeCollector, fee, weth, aeroV2Router, aeroV3Router];
  // console.log(args);
  const dexRouter = await deploy("DexRouter", {
    from: deployer,
    args: args,
    log: true,
    waitConfirmations: network.config.blockConfirmations || 1,
  });
  console.log("合约部署地址:", dexRouter.address);

  const feeToken = [process.env.BASE_USDC, process.env.BASE_USDT];
  const isFee = [true, true];

  log("------------------------------------");
};

module.exports.tags = ["all", "dexRouter", "mainnet"];
