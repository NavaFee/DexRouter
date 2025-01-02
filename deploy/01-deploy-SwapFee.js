const { network, ethers } = require("hardhat");
const {
  networkConfig,
  developmentChains,
} = require("../helper-hardhat-config");
require("dotenv").config();

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const feeCollector = process.env.FeeCollector;
  const fee = 10000;
  const weth = process.env.ETH_SEPOLIA_WETH;

  log("----------------------------------------------------");

  const args = [deployer, feeCollector, fee, weth];
  console.log(args);
  const swapFee = await deploy("SwapFee", {
    from: deployer,
    args: args,
    log: true,
    waitConfirmations: network.config.blockConfirmations || 1,
  });
  console.log("合约部署地址:", swapFee.address);

  log("------------------------------------");
};

module.exports.tags = ["all", "swapFee", "main"];
