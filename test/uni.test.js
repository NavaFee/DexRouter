// 测试用例
// 1. v2 合约中的单个路由对的交易功能测试 (ETH -> Virtual) 并验证手续费
// 2. v2 合约中的多个路由对的交易功能测试 (ETH -> Virtual -> LUNA)并验证手续费
// 3. v3 合约中的单个路由对的交易功能测试 (ETH -> USDC)并验证手续费
// 4. v3 合约中的多个路由对的交易功能测试 (ETH -> USDC -> Aixbt)并验证手续费

// 测试函数：swapV2ExactIn、swapV2MultiHopExactIn、swapV3ExactIn、swapV3MultiHopExactIn

/*
UniV2 交易对

Virtual/WETH: 0xE31c372a7Af875b3B5E0F3713B17ef51556da667
    virtual: 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b
    weth: 0x4200000000000000000000000000000000000006
    factory:0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6

LUNA/Virtual: 0xa8e64FB120CE8796594670BAE72279C8aA1e5359
    virtual: 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b
    luna: 0x55cD6469F597452B5A7536e2CD98fDE4c1247ee4  
    factory:0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6

UniV3 交易对

WETH/USDC: 0xd0b53D9277642d899DF5C87A3966A349A798F224
    weth: 0x4200000000000000000000000000000000000006
    usdc: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
    fee: 500
    factory: 0x33128a8fC17869897dcE68Ed026d694621f6FDfD

Aixbt/USDC: 0xf1Fdc83c3A336bdbDC9fB06e318B08EadDC82FF4
    aixbt:0x4F9Fd6Be4a90f2620860d680c0d4d5Fb53d1A825  
    usdc: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913  
    fee: 3000
    factory: 0x33128a8fC17869897dcE68Ed026d694621f6FDfD

*/

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { encodePath } = require("./utils");

describe("UniswapTrade", function () {
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
    const luna = await ethers.getContractAt(
      "IERC20",
      "0x55cD6469F597452B5A7536e2CD98fDE4c1247ee4"
    );
    const aixbt = await ethers.getContractAt(
      "IERC20",
      "0x4F9Fd6Be4a90f2620860d680c0d4d5Fb53d1A825"
    );

    return { dexRouter, weth, virtual, usdc, luna, aixbt, owner, feeCollector };
  }

  describe("UniswapV2 Single Route Swap", function () {
    it("Should swap ETH to Virtual through V2 single route ( ETH -> Virtual )", async function () {
      const { dexRouter, virtual, owner, feeCollector } = await loadFixture(
        deployFixture
      );

      // 准备交易参数
      const amountIn = ethers.parseEther("1");
      const amountOutMin = 0;
      const poolAddress = "0xE31c372a7Af875b3B5E0F3713B17ef51556da667"; // Virtual/WETH pair

      // 记录交易前余额
      const beforeVirtualBalance = await virtual.balanceOf(owner.address);
      const beforeFeeCollectorBalance = await ethers.provider.getBalance(
        feeCollector.address
      );
      // console.log("\tbeforeVirtualBalance:", beforeVirtualBalance);
      // console.log("\tbeforeFeeCollectorBalance:", beforeFeeCollectorBalance);

      // 执行交易
      await dexRouter.swapV2ExactIn(
        ethers.ZeroAddress, // tokenIn = address(0) 表示输入ETH
        virtual.target,
        amountIn,
        amountOutMin,
        poolAddress,
        {
          value: ethers.parseEther("1"),
        }
      );

      // 验证交易结果
      const afterVirtualBalance = await virtual.balanceOf(owner.address);
      const afterFeeCollectorBalance = await ethers.provider.getBalance(
        feeCollector.address
      );
      // console.log("\tafterVirtualBalance:", afterVirtualBalance);
      // console.log("\tafterFeeCollectorBalance:", afterFeeCollectorBalance);

      // 计算手续费是否正确
      const expectedFee = (amountIn * BigInt(10000)) / BigInt(1000000); // 1% fee

      expect(afterVirtualBalance).to.be.gt(beforeVirtualBalance);
      expect(afterFeeCollectorBalance - beforeFeeCollectorBalance).to.equal(
        expectedFee
      );
    });
  });

  describe("UniswapV2 Multi Route Swap", function () {
    it("Should swap ETH to LUNA through V2 multi route ( ETH -> Virtual -> LUNA )", async function () {
      const { dexRouter, luna, owner, feeCollector } = await loadFixture(
        deployFixture
      );

      // 准备交易参数
      const amountIn = ethers.parseEther("1");
      const amountOutMin = 0;
      const path = [
        process.env.BASE_WETH,
        process.env.BASE_VIRTUAL,
        process.env.BASE_LUNA,
      ];

      // 记录交易前余额
      const beforeLunaBalance = await luna.balanceOf(owner.address);
      const beforeFeeCollectorBalance = await ethers.provider.getBalance(
        feeCollector.address
      );
      // console.log("\tbeforeLunaBalance:", beforeLunaBalance);
      // console.log("\tbeforeFeeCollectorBalance:", beforeFeeCollectorBalance);

      // 执行交易
      await dexRouter.swapV2MultiHopExactIn(
        ethers.ZeroAddress, // tokenIn = address(0) 表示输入ETH
        amountIn,
        {
          path: path,
          factory: process.env.BASE_UNI_V2_FACTORY,
          amountOutMin: amountOutMin,
          recipient: owner.address,
          deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        },
        {
          value: ethers.parseEther("1"),
        }
      );

      // 验证交易结果
      const afterLunaBalance = await luna.balanceOf(owner.address);
      const afterFeeCollectorBalance = await ethers.provider.getBalance(
        feeCollector.address
      );

      const expectedFee = (amountIn * BigInt(10000)) / BigInt(1000000); // 1% fee

      // console.log("\tafterLunaBalance:", afterLunaBalance);
      // console.log("\tafterFeeCollectorBalance:", afterFeeCollectorBalance);

      expect(afterLunaBalance).to.be.gt(beforeLunaBalance);
      expect(afterFeeCollectorBalance - beforeFeeCollectorBalance).to.equal(
        expectedFee
      );
    });
  });

  describe("UniswapV3 Single Route Swap", function () {
    it("Should swap ETH to USDC through V3 single route ( ETH -> USDC )", async function () {
      const { dexRouter, usdc, owner, feeCollector } = await loadFixture(
        deployFixture
      );

      // 准备交易参数
      const amountIn = ethers.parseEther("1");
      const params = {
        factoryAddress: process.env.BASE_UNI_V3_FACTORY,
        poolAddress: "0xd0b53D9277642d899DF5C87A3966A349A798F224", // WETH/USDC pool
        tokenIn: ethers.ZeroAddress,
        tokenOut: process.env.BASE_USDC,
        fee: 500,
        recipient: owner.address,
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        amountIn: amountIn,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0,
      };

      // 记录交易前余额
      const beforeUsdcBalance = await usdc.balanceOf(owner.address);
      const beforeFeeCollectorBalance = await ethers.provider.getBalance(
        feeCollector.address
      );
      // console.log("\tbeforeUsdcBalance:", beforeUsdcBalance);
      // console.log("\tbeforeFeeCollectorBalance:", beforeFeeCollectorBalance);

      // 执行交易
      await dexRouter.swapV3ExactIn(params, {
        value: ethers.parseEther("1"),
      });

      // 验证交易结果
      const afterUsdcBalance = await usdc.balanceOf(owner.address);
      const afterFeeCollectorBalance = await ethers.provider.getBalance(
        feeCollector.address
      );

      const expectedFee = (amountIn * BigInt(10000)) / BigInt(1000000); // 1% fee

      // console.log("\tafterUsdcBalance:", afterUsdcBalance);
      // console.log("\tafterFeeCollectorBalance:", afterFeeCollectorBalance);
      expect(afterUsdcBalance).to.be.gt(beforeUsdcBalance);
      expect(afterFeeCollectorBalance - beforeFeeCollectorBalance).to.equal(
        expectedFee
      );
    });
  });

  describe("UniswapV3 Multi Route Swap", function () {
    it("Should swap ETH to Aixbt through V3 multi route ( ETH -> USDC -> Aixbt )", async function () {
      const { dexRouter, aixbt, owner, feeCollector } = await loadFixture(
        deployFixture
      );

      // 准备交易参数
      const amountIn = ethers.parseEther("1");
      const path = [
        process.env.BASE_WETH,
        process.env.BASE_USDC,
        "0x4F9Fd6Be4a90f2620860d680c0d4d5Fb53d1A825", // Aixbt
      ];
      const fees = [500, 3000];

      const params = {
        path: encodePath(path, fees),
        recipient: owner.address,
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        amountIn: amountIn,
        amountOutMinimum: 0,
        poolAddresses: [
          "0xd0b53D9277642d899DF5C87A3966A349A798F224", // WETH/USDC pool
          "0xf1Fdc83c3A336bdbDC9fB06e318B08EadDC82FF4", // Aixbt/USDC pool
        ],
        factoryAddresses: [
          process.env.BASE_UNI_V3_FACTORY,
          process.env.BASE_UNI_V3_FACTORY,
        ],
        nativeOut: false,
        tokenOut: "0x4F9Fd6Be4a90f2620860d680c0d4d5Fb53d1A825",
      };

      // 记录交易前余额
      const beforeAixbtBalance = await aixbt.balanceOf(owner.address);
      const beforeFeeCollectorBalance = await ethers.provider.getBalance(
        feeCollector.address
      );
      // console.log("\tbeforeAixbtBalance:", beforeAixbtBalance);
      // console.log("\tbeforeFeeCollectorBalance:", beforeFeeCollectorBalance);

      // 执行交易
      await dexRouter.swapV3MultiHopExactIn(
        params,

        {
          value: ethers.parseEther("1"),
        }
      );

      // 验证交易结果
      const afterAixbtBalance = await aixbt.balanceOf(owner.address);
      const afterFeeCollectorBalance = await ethers.provider.getBalance(
        feeCollector.address
      );

      const expectedFee = (amountIn * BigInt(10000)) / BigInt(1000000); // 1% fee

      // console.log("\tafterAixbtBalance:", afterAixbtBalance);
      // console.log("\tafterFeeCollectorBalance:", afterFeeCollectorBalance);
      expect(afterAixbtBalance).to.be.gt(beforeAixbtBalance);
      expect(afterFeeCollectorBalance - beforeFeeCollectorBalance).to.equal(
        expectedFee
      );
    });
  });
});
