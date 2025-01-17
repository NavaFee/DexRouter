const { network, ethers } = require("hardhat");

require("dotenv").config();
const fs = require("fs");

module.exports = async function ({ getNamedAccounts, deployments }) {
  if (network.name !== "hardhat") {
    console.log("This script is only for local testing");
    return;
  }
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const feeCollector = process.env.FeeCollector;
  const weth = process.env.BASE_WETH;
  const feeRate = 10000;

  log("----------------------------------------------------");

  const args = [feeCollector, weth, feeRate];
  // console.log(args);
  const dexRouter = await deploy("UniversalRouter", {
    from: deployer,
    args: args,
    log: true,
    waitConfirmations: network.config.blockConfirmations || 1,
  });
  console.log("合约部署地址:", dexRouter.address);

  log("------------------------------------");
};

module.exports.tags = ["all", "universal", "hardhat"];
