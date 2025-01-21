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
  const weth = process.env.BASE_WETH;

  log("----------------------------------------------------");

  const args = [feeCollector, weth, fee];
  // console.log(args);
  const universalRouter = await deploy("UniversalRouter", {
    from: deployer,
    args: args,
    log: true,
    waitConfirmations: network.config.blockConfirmations || 1,
  });
  console.log("合约部署地址:", universalRouter.address);

  log("------------------------------------");
};

module.exports.tags = ["all", "universal_mainnet", "mainnet"];
