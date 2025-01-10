// 测试用例
// 1. v2合约中的单个路由对的交易功能测试 (ETH -> Virtual) 并验证手续费
// 2. v2合约中的多个路由对的交易功能测试 (ETH -> Virtual -> Wai)并验证手续费
// 3. v3合约中的单个路由对的交易功能测试 (ETH -> USDC)并验证手续费
// 4. v3合约中的多个路由对的交易功能测试 (ETH -> USDC -> Star)并验证手续费

// 测试函数：AeroV3ExactInputSingle、AeroV3ExactInput、AeroV2ExactInput

/*
AeroV2 交易对

vAMM_Virtual/WETH: 0x21594b992F68495dD28d605834b58889d0a727c7
    virtual: 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b
    weth: 0x4200000000000000000000000000000000000006
    stable: false
    factory: process.env.BASE_AERO_V2_FACTORY

vAMM_Virtual/WAI: 0x37E769D2dcF3e3E8dFC37c0Df83EEB56edfC0fD2
    virtual: 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b
    wai: 0x23471E7250bCD7ee21Df3f39Ed6151931D1E076b 
    stable: false
    factory: process.env.BASE_AERO_V2_FACTORY
    


AeroV3 交易对

CL200_Virtual/WETH: 0xC200F21EfE67c7F41B81A854c26F9cdA80593065
    virtual: 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b
    weth: 0x4200000000000000000000000000000000000006
    tickSpacing: 200
    factory: process.env.BASE_AERO_V3_FACTORY

CL100_WETH/USDC: 0xb2cc224c1c9feE385f8ad6a55b4d94E92359DC59
    weth: 0x4200000000000000000000000000000000000006
    usdc: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
    tickSpacing: 100
    factory: process.env.BASE_AERO_V3_FACTORY

CL1-USDC/STAR: 0xa7C2693022cfB693c198EaA743E9B54d7921588E
    usdc: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
    star: 0xC19669A405067927865B40Ea045a2baabbbe57f5 
    tickSpacing: 1
    factory: process.env.BASE_AERO_V3_FACTORY

*/

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { encodePath } = require("./utils");

describe("AeroTrade", function () {
  // 测试前的准备工作
  async function deployFixture() {
    const [owner, feeCollector] = await ethers.getSigners();

    // 部署合约
    const DexRouter = await ethers.getContractFactory("DexRouter");
    const dexRouter = await DexRouter.deploy(
      feeCollector.address,
      10000, // 1% fee
      process.env.BASE_WETH,
      process.env.BASE_AERO_V2_ROUTER,
      process.env.BASE_AERO_V3_ROUTER
    );

    // 获取代币合约实例
    const weth = await ethers.getContractAt("IERC20", process.env.BASE_WETH);
    const virtual = await ethers.getContractAt(
      "IERC20",
      process.env.BASE_VIRTUAL
    );
    const usdc = await ethers.getContractAt("IERC20", process.env.BASE_USDC);
    const star = await ethers.getContractAt("IERC20", process.env.BASE_STAR);

    return { dexRouter, weth, virtual, usdc, star, owner, feeCollector };
  }

  describe("AeroV2 Single Route Swap", function () {
    it("Should swap WETH to Virtual through V2 single route ( ETH -> Virtual ) ", async function () {
      const { dexRouter, virtual, owner, feeCollector } = await loadFixture(
        deployFixture
      );

      // 准备交易参数
      const amountIn = ethers.parseEther("1");
      const amountOutMin = 0;
      const routes = [
        {
          from: process.env.BASE_WETH,
          to: process.env.BASE_VIRTUAL,
          stable: false,
          factory: process.env.BASE_AERO_V2_FACTORY,
        },
      ];

      // 记录交易前余额
      const beforeVirtualBalance = await virtual.balanceOf(owner.address);
      const beforeFeeCollectorBalance = await ethers.provider.getBalance(
        feeCollector.address
      );

      // 执行交易
      await dexRouter.AeroV2ExactInput(
        amountIn,
        amountOutMin,
        routes,
        owner.address,
        true, // nativeIn
        false, // nativeOut  // routes[len-1].to == weth ? true : false
        Math.floor(Date.now() / 1000) + 60 * 20, // deadline 20 minutes
        {
          value: ethers.parseEther("1"),
        }
      );
      // console.log("=== AeroV2 Single Route ( ETH -> Virtual ) ===");

      // console.log(
      //   "beforeFeeCollectorBalance",
      //   ethers.formatEther(beforeFeeCollectorBalance)
      // );
      // console.log(
      //   "beforeVirtualBalance",
      //   ethers.formatEther(beforeVirtualBalance)
      // );

      // 验证交易结果
      const afterVirtualBalance = await virtual.balanceOf(owner.address);
      const afterFeeCollectorBalance = await ethers.provider.getBalance(
        feeCollector.address
      );

      // console.log(
      //   "afterFeeCollectorBalance",
      //   ethers.formatEther(afterFeeCollectorBalance)
      // );
      // console.log(
      //   "afterVirtualBalance",
      //   ethers.formatEther(afterVirtualBalance)
      // );

      // 计算手续费是否正确
      const expectedFee = (amountIn * BigInt(10000)) / BigInt(1000000); // 1% fee

      expect(afterVirtualBalance).to.be.gt(beforeVirtualBalance);
      expect(afterFeeCollectorBalance - beforeFeeCollectorBalance).to.equal(
        expectedFee
      );
    });
  });

  describe("AeroV2 Multi Route Swap", function () {
    it("Should swap WETH to WAI through V2 multi route ( ETH -> Virtual -> WAI )", async function () {
      const { dexRouter, weth, virtual, owner, feeCollector } =
        await loadFixture(deployFixture);

      const wai = await ethers.getContractAt(
        "IERC20",
        "0x23471E7250bCD7ee21Df3f39Ed6151931D1E076b"
      );

      // 准备交易参数
      const amountIn = ethers.parseEther("1");
      const amountOutMin = 0;
      const routes = [
        {
          from: process.env.BASE_WETH,
          to: process.env.BASE_VIRTUAL, // Virtual
          stable: false,
          factory: process.env.BASE_AERO_V2_FACTORY,
        },
        {
          from: process.env.BASE_VIRTUAL, // Virtual
          to: wai.target,
          stable: false,
          factory: process.env.BASE_AERO_V2_FACTORY,
        },
      ];

      // 授权
      //   await weth.approve(dexRouter.address, amountIn);

      // 记录交易前余额
      const beforeVirtualBalance = await virtual.balanceOf(owner.address);
      const beforeWaiBalance = await wai.balanceOf(owner.address);

      const beforeFeeCollectorBalance = await ethers.provider.getBalance(
        feeCollector.address
      );

      // 执行交易前打印余额
      // console.log(
      //   "beforeFeeCollectorBalance:",
      //   ethers.formatEther(beforeFeeCollectorBalance)
      // );
      // console.log("beforeWaiBalance:", ethers.formatEther(beforeWaiBalance));

      // 执行交易
      await dexRouter.AeroV2ExactInput(
        amountIn,
        amountOutMin,
        routes,
        owner.address,
        true, // nativeIn
        false, //nativeOut
        Math.floor(Date.now() / 1000) + 60 * 20,
        {
          value: ethers.parseEther("1"),
        }
      );

      // 验证交易结果
      const afterWaiBalance = await wai.balanceOf(owner.address);
      const afterFeeCollectorBalance = await ethers.provider.getBalance(
        feeCollector.address
      );

      // console.log(
      //   "afterFeeCollectorBalance:",
      //   ethers.formatEther(afterFeeCollectorBalance)
      // );
      // console.log("afterWaiBalance:", ethers.formatEther(afterWaiBalance));
      // console.log(
      //   "Fee collected:",
      //   ethers.formatEther(afterFeeCollectorBalance - beforeFeeCollectorBalance)
      // );
      // console.log("Expected fee:", ethers.formatEther(expectedFee));
      // console.log(
      //   "WAI received:",
      //   ethers.formatEther(afterWaiBalance - beforeWaiBalance)
      // );
      const expectedFee = (amountIn * BigInt(10000)) / BigInt(1000000); // 1% fee

      expect(afterWaiBalance).to.be.gt(beforeWaiBalance);
      expect(afterFeeCollectorBalance - beforeFeeCollectorBalance).to.equal(
        expectedFee
      );
    });
  });

  describe("AeroV3 Single Route Swap", function () {
    it("Should swap WETH to Virtual through V3 single route ( ETH -> Virtual )", async function () {
      const { dexRouter, weth, virtual, owner, feeCollector } =
        await loadFixture(deployFixture);

      // 准备交易参数
      const amountIn = ethers.parseEther("1");
      const params = {
        tokenIn: process.env.BASE_WETH,
        tokenOut: virtual.target,
        tickSpacing: 200,
        recipient: owner.address,
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        amountIn: amountIn,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0,
      };

      // 记录交易前余额
      const beforeVirtualBalance = await virtual.balanceOf(owner.address);
      const beforeFeeCollectorBalance = await ethers.provider.getBalance(
        feeCollector.address
      );

      // 执行交易前打印余额
      // console.log("=== AeroV3 Single Route ( ETH -> Virtual ) ===");
      // console.log(
      //   "beforeFeeCollectorBalance:",
      //   ethers.formatEther(beforeFeeCollectorBalance)
      // );
      // console.log(
      //   "beforeVirtualBalance:",
      //   ethers.formatEther(beforeVirtualBalance)
      // );

      // 执行交易
      await dexRouter.AeroV3ExactInputSingle(
        params,
        true, // nativeIn
        false, // nativeOut
        {
          value: ethers.parseEther("1"),
        }
      );

      // 验证交易结果
      const afterVirtualBalance = await virtual.balanceOf(owner.address);
      const afterFeeCollectorBalance = await ethers.provider.getBalance(
        feeCollector.address
      );

      // console.log(
      //   "afterFeeCollectorBalance:",
      //   ethers.formatEther(afterFeeCollectorBalance)
      // );
      // console.log(
      //   "afterVirtualBalance:",
      //   ethers.formatEther(afterVirtualBalance)
      // );
      // console.log(
      //   "Fee collected:",
      //   ethers.formatEther(afterFeeCollectorBalance - beforeFeeCollectorBalance)
      // );
      const expectedFee = (amountIn * BigInt(10000)) / BigInt(1000000); // 1% fee

      // console.log(
      //   "Virtual received:",
      //   ethers.formatEther(afterVirtualBalance - beforeVirtualBalance)
      // );

      expect(afterVirtualBalance).to.be.gt(beforeVirtualBalance);
      expect(afterFeeCollectorBalance - beforeFeeCollectorBalance).to.equal(
        expectedFee
      );
    });
  });

  describe("AeroV3 Multi Route Swap", function () {
    it("Should swap WETH to STAR through V3 multi route ( ETH -> USDC -> STAR )", async function () {
      const { dexRouter, star, usdc, owner, feeCollector } = await loadFixture(
        deployFixture
      );

      // 准备交易参数
      const amountIn = ethers.parseEther("1");
      const path = [
        process.env.BASE_WETH,
        process.env.BASE_USDC,
        process.env.BASE_STAR,
      ];
      const fees = [100, 1];

      const params = {
        path: encodePath(path, fees),
        recipient: owner.address,
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        amountIn: amountIn,
        amountOutMinimum: 0,
      };

      // 记录交易前余额
      const beforeStarBalance = await star.balanceOf(owner.address);
      const beforeFeeCollectorBalance = await ethers.provider.getBalance(
        feeCollector.address
      );

      // 执行交易前打印余额
      // console.log("=== AeroV3 Multi Route ( ETH -> USDC -> STAR ) ===");
      // console.log(
      //   "beforeFeeCollectorBalance:",
      //   ethers.formatEther(beforeFeeCollectorBalance)
      // );
      // console.log("beforeStarBalance:", ethers.formatEther(beforeStarBalance));

      // 执行交易
      await dexRouter.AeroV3ExactInput(
        params,
        process.env.BASE_WETH,
        process.env.BASE_STAR, // tokenOut
        true, // nativeIn
        false, // nativeOut
        {
          value: ethers.parseEther("1"),
        }
      );

      // 验证交易结果
      const afterStarBalance = await star.balanceOf(owner.address);
      const afterFeeCollectorBalance = await ethers.provider.getBalance(
        feeCollector.address
      );

      // console.log(
      //   "afterFeeCollectorBalance:",
      //   ethers.formatEther(afterFeeCollectorBalance)
      // );
      // console.log("afterStarBalance:", ethers.formatEther(afterStarBalance));
      // console.log(
      //   "Fee collected:",
      //   ethers.formatEther(afterFeeCollectorBalance - beforeFeeCollectorBalance)
      // );
      // console.log(
      //   "STAR received:",
      //   ethers.formatEther(afterStarBalance - beforeStarBalance)
      // );

      expect(afterStarBalance).to.be.gt(beforeStarBalance);
      const expectedFee = (amountIn * BigInt(10000)) / BigInt(1000000); // 1% fee

      expect(afterFeeCollectorBalance - beforeFeeCollectorBalance).to.equal(
        expectedFee
      );
    });
  });
});
