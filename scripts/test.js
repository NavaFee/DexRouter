const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
require("dotenv").config();

let accounts;

//router's interface on my test
const balance = async () => {
  const address = "0xb34151503a306bc4e5e5647ed7fc2d685d166c94";
  const balance = await ethers.provider.getBalance(address);
  console.log(balance.toString());
  const SystemBalance = await ethers.provider.getBalance(accounts[0].address);
  console.log(await ethers.provider.getBlockNumber());
  console.log("系统账户余额", SystemBalance.toString());
};

const erc20Balance = async (tokenaddress, address) => {
  try {
    // 先验证合约是否存在
    const code = await ethers.provider.getCode(tokenaddress);
    if (code === "0x") {
      console.log(`在地址 ${tokenaddress} 上没有找到合约`);
      return;
    }

    const token = await ethers.getContractAt("IERC20", tokenaddress);
    const balance = await token.balanceOf(address);
    const formatBalance = ethers.formatEther(balance);
    console.log(`代币余额: ${formatBalance}`);
  } catch (error) {
    console.error(`查询失败:`, error.message);
  }
};

// 将 await 放在异步函数内
async function main() {
  accounts = await ethers.getSigners();
  await helpers.mine();
  await balance();

  // 使用一个实际的 ERC20 代币地址
  // 这里使用 WETH 合约地址作为示例（请确保这个合约已经在本地网络部署）
  const Token_ADDRESS = process.env.BASE_VIRTUAL;
  await erc20Balance(Token_ADDRESS, accounts[0].address);

  await BuyTokenFromVero();
  await erc20Balance(Token_ADDRESS, accounts[0].address);

  // rest of the script...
}

// /// @notice Swap ETH for a token
// /// @param amountOutMin Minimum amount of desired token received
// /// @param routes       Array of trade routes used in the swap
// /// @param to           Recipient of the tokens received
// /// @param deadline     Deadline to receive tokens
// /// @return amounts     Array of amounts returned per route
// function swapExactETHForTokens(
//     uint256 amountOutMin,
//     Route[] calldata routes,
//     address to,
//     uint256 deadline
// ) external payable returns (uint256[] memory amounts);

// //    struct Route {
//         address from;
//         address to;
//         bool stable;
//         address factory;
//     }

async function BuyTokenFromVero() {
  // 先打印环境变量，检查是否正确加载
  //   console.log("Router地址:", process.env.BASE_AERO_V2_ROUTER);
  //   console.log("WETH地址:", process.env.BASE_WETH);
  //   console.log("目标代币地址:", process.env.BASE_VIRTUAL);
  //   console.log("Factory地址:", process.env.BASE_AERO_V2_FACTORY);

  if (!process.env.BASE_AERO_V2_ROUTER) {
    throw new Error("Router地址未设置");
  }

  const aeroV2Router = await ethers.getContractAt(
    "IRouter",
    process.env.BASE_AERO_V2_ROUTER
  );

  const currentTimestamp = Math.floor(Date.now() / 1000);
  console.log("当前时间戳", currentTimestamp);
  const deadline = currentTimestamp + 1000;

  // 构造路由参数
  const route = [
    {
      from: process.env.BASE_WETH,
      to: process.env.BASE_VIRTUAL,
      stable: false,
      factory: process.env.BASE_AERO_V2_FACTORY,
    },
  ];

  try {
    const aeroV2Router2 = await aeroV2Router.connect(accounts[0]);
    const tx = await aeroV2Router2.swapExactETHForTokens(
      0,
      route,
      accounts[0].address,
      deadline,
      {
        value: ethers.parseEther("1"),
      }
    );
    await helpers.mine();

    const result = await aeroV2Router2.swapExactETHForTokens.staticCall(
      0,
      route,
      accounts[0].address,
      deadline,
      {
        value: ethers.parseEther("1"),
      }
    );

    console.log("交易已发送，等待确认...");
    const receipt = await tx.wait();
    console.log("交易已确认:", receipt.hash);

    console.log("计算交换数量:", ethers.formatEther(result[1]));
  } catch (error) {
    console.error("交易失败:", error);
    // 打印更详细的错误信息
    if (error.data) {
      console.error("合约错误数据:", error.data);
    }
  }
}

// 执行主函数
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
