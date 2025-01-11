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

ETH/USDC: 0x88A43bbDF9D098eEC7bCEda4e2494615dfD9bB9C
    weth: 0x4200000000000000000000000000000000000006
    usdc: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
    factory: 0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6

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

Luna/usdc: 0x16E0907ed813d6E0287596ce1966FF1ad7b17298
    luna: 0x55cD6469F597452B5A7536e2CD98fDE4c1247ee4
    usdc: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
    fee: 10000
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

    // 设置手续费代币
    await dexRouter.setFeeTokens(
      [process.env.BASE_USDC, process.env.BASE_USDT],
      [true, true]
    );

    // 通过swap 给 owner 准备交易资金
    // virtual
    await dexRouter.swapV2ExactIn(
      ethers.ZeroAddress,
      virtual.target,
      ethers.parseEther("1"),
      0,
      "0xE31c372a7Af875b3B5E0F3713B17ef51556da667",
      {
        value: ethers.parseEther("1"),
      }
    );

    // usdc
    await dexRouter.swapV2ExactIn(
      ethers.ZeroAddress,
      usdc.target,
      ethers.parseEther("10"),
      0,
      "0x88A43bbDF9D098eEC7bCEda4e2494615dfD9bB9C",
      {
        value: ethers.parseEther("10"),
      }
    );

    // approve
    await usdc.approve(dexRouter.target, ethers.parseUnits("6000", 6));

    const params = {
      factoryAddress: process.env.BASE_UNI_V3_FACTORY,
      poolAddress: "0x16E0907ed813d6E0287596ce1966FF1ad7b17298", // LUNA/USDC pool
      tokenIn: process.env.BASE_USDC,
      tokenOut: process.env.BASE_LUNA,
      fee: 10000,
      recipient: owner.address,
      deadline: Math.floor(Date.now() / 1000) + 60 * 20,
      amountIn: ethers.parseUnits("5000", 6),
      amountOutMinimum: 0,
      sqrtPriceLimitX96: 0,
    };

    await dexRouter.swapV3ExactIn(params);

    // aixbt
    await dexRouter.swapV3ExactIn({
      factoryAddress: process.env.BASE_UNI_V3_FACTORY,
      poolAddress: "0xf1Fdc83c3A336bdbDC9fB06e318B08EadDC82FF4", // Aixbt/USDC pool
      tokenIn: process.env.BASE_USDC,
      tokenOut: "0x4F9Fd6Be4a90f2620860d680c0d4d5Fb53d1A825",
      fee: 3000,
      recipient: owner.address,
      deadline: Math.floor(Date.now() / 1000) + 60 * 20,
      amountIn: ethers.parseUnits("1000", 6),
      amountOutMinimum: 0,
      sqrtPriceLimitX96: 0,
    });

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
    it("Should swap Virtual to ETH through V2 single route ( Virtual -> ETH )", async function () {
      const { dexRouter, virtual, weth, owner, feeCollector } =
        await loadFixture(deployFixture);
      // 记录交易前余额
      const beforeVirtualBalance = await virtual.balanceOf(owner.address);
      const beforeEthBalance = await ethers.provider.getBalance(owner.address);

      const beforeFeeCollectorWETHBalance = await weth.balanceOf(
        feeCollector.address
      );

      // 授权 dexRouter 合约使用 virtual 代币
      await virtual.approve(dexRouter.target, beforeVirtualBalance);

      // 准备交易参数
      const amountIn = beforeVirtualBalance;
      const amountOutMin = 0;
      const poolAddress = "0xE31c372a7Af875b3B5E0F3713B17ef51556da667"; // Virtual/WETH pair

      // 执行交易
      await dexRouter.swapV2ExactIn(
        virtual.target,
        ethers.ZeroAddress, //WETH,表示输出ETH
        amountIn,
        amountOutMin,
        poolAddress
      );

      // 验证交易结果
      const afterEthBalance = await ethers.provider.getBalance(owner.address);
      const afterFeeCollectorWETHBalance = await weth.balanceOf(
        feeCollector.address
      );

      expect(afterEthBalance).to.be.gt(beforeEthBalance);
      expect(
        afterFeeCollectorWETHBalance - beforeFeeCollectorWETHBalance
      ).to.gt(0);
    });
    it("Should swap Virtual to LUNA through V2 single route ( Virtual -> LUNA )", async function () {
      const { dexRouter, virtual, luna, owner, feeCollector } =
        await loadFixture(deployFixture);

      // 记录交易前余额
      const beforeVirtualBalance = await virtual.balanceOf(owner.address);
      const beforeLunaBalance = await luna.balanceOf(owner.address);
      const beforeFeeCollectorVirtualBalance = await virtual.balanceOf(
        feeCollector.address
      );

      // 授权 dexRouter 合约使用 virtual 代币
      await virtual.approve(dexRouter.target, beforeVirtualBalance);

      // 准备交易参数
      const amountIn = beforeVirtualBalance;
      const amountOutMin = 0;
      const poolAddress = "0xa8e64FB120CE8796594670BAE72279C8aA1e5359"; // LUNA/Virtual pair

      // 执行交易
      await dexRouter.swapV2ExactIn(
        virtual.target,
        luna.target,
        amountIn,
        amountOutMin,
        poolAddress
      );

      // 验证交易结果
      const afterLunaBalance = await luna.balanceOf(owner.address);
      const afterFeeCollectorVirtualBalance = await virtual.balanceOf(
        feeCollector.address
      );

      expect(afterLunaBalance).to.be.gt(beforeLunaBalance);
      expect(
        afterFeeCollectorVirtualBalance - beforeFeeCollectorVirtualBalance
      ).to.gt(0);
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
    it("Should swap LUNA to ETH through V2 multi route ( LUNA -> Virtual -> ETH )", async function () {
      const { dexRouter, luna, weth, owner, feeCollector } = await loadFixture(
        deployFixture
      );

      const amountIn = await luna.balanceOf(owner.address);

      // 授权 dexRouter 合约使用 luna 代币
      await luna.approve(dexRouter.target, amountIn);

      // 准备交易参数
      const amountOutMin = 0;
      const path = [
        process.env.BASE_LUNA,
        process.env.BASE_VIRTUAL,
        process.env.BASE_WETH,
      ];

      // 记录交易前余额
      const beforeEthBalance = await ethers.provider.getBalance(owner.address);
      const beforeFeeCollectorWETHBalance = await weth.balanceOf(
        feeCollector.address
      );

      // 执行交易
      await dexRouter.swapV2MultiHopExactIn(luna.target, amountIn, {
        path: path,
        factory: process.env.BASE_UNI_V2_FACTORY,
        amountOutMin: amountOutMin,
        recipient: owner.address,
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
      });

      // 验证交易结果
      const afterEthBalance = await ethers.provider.getBalance(owner.address);
      const afterFeeCollectorWETHBalance = await weth.balanceOf(
        feeCollector.address
      );

      expect(afterEthBalance).to.be.gt(beforeEthBalance);
      expect(
        afterFeeCollectorWETHBalance - beforeFeeCollectorWETHBalance
      ).to.gt(0);
    });
    it("Should swap LUNA to ETH through V2 multi route ( Virtual -> ETH -> USDC )", async function () {
      const { dexRouter, virtual, usdc, owner, feeCollector } =
        await loadFixture(deployFixture);

      const amountIn = await virtual.balanceOf(owner.address);

      // 授权 dexRouter 合约使用 luna 代币
      await virtual.approve(dexRouter.target, amountIn);

      // 准备交易参数
      const amountOutMin = 0;
      const path = [
        process.env.BASE_VIRTUAL,
        process.env.BASE_WETH,
        process.env.BASE_USDC,
      ];

      // 记录交易前余额
      const beforeUsdcBalance = await usdc.balanceOf(owner.address);
      const beforeFeeCollectorUSDCBalance = await usdc.balanceOf(
        feeCollector.address
      );
      console.log("\tbeforeUsdcBalance:", beforeUsdcBalance);
      console.log(
        "\tbeforeFeeCollectorUSDCBalance:",
        beforeFeeCollectorUSDCBalance
      );

      // 执行交易
      await dexRouter.swapV2MultiHopExactIn(
        process.env.BASE_VIRTUAL,
        amountIn,
        {
          path: path,
          factory: process.env.BASE_UNI_V2_FACTORY,
          amountOutMin: amountOutMin,
          recipient: owner.address,
          deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        }
      );

      // 验证交易结果
      const afterUsdcBalance = await usdc.balanceOf(owner.address);
      const afterFeeCollectorUSDCBalance = await usdc.balanceOf(
        feeCollector.address
      );
      console.log("\tafterUsdcBalance:", afterUsdcBalance);
      console.log(
        "\tafterFeeCollectorUSDCBalance:",
        afterFeeCollectorUSDCBalance
      );

      expect(afterUsdcBalance).to.be.gt(beforeUsdcBalance);
      expect(
        afterFeeCollectorUSDCBalance - beforeFeeCollectorUSDCBalance
      ).to.gt(0);
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
      const beforeFeeCollectorBalance = await usdc.balanceOf(
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
      const afterFeeCollectorBalance = await usdc.balanceOf(
        feeCollector.address
      );

      // console.log("\tafterUsdcBalance:", afterUsdcBalance);
      // console.log("\tafterFeeCollectorBalance:", afterFeeCollectorBalance);
      expect(afterUsdcBalance).to.be.gt(beforeUsdcBalance);
      expect(afterFeeCollectorBalance - beforeFeeCollectorBalance).to.gt(0);
    });
    it("Should swap USDC to ETH through V3 single route ( USDC -> ETH )", async function () {
      const { dexRouter, usdc, weth, owner, feeCollector } = await loadFixture(
        deployFixture
      );

      // 授权 dexRouter 合约使用 usdc 代币
      await usdc.approve(dexRouter.target, ethers.parseUnits("1000", 6));
      // 准备交易参数
      const amountIn = ethers.parseUnits("1000", 6); // 1000 USDC
      const params = {
        factoryAddress: process.env.BASE_UNI_V3_FACTORY,
        poolAddress: "0xd0b53D9277642d899DF5C87A3966A349A798F224", // usdc/WETH pool
        tokenIn: process.env.BASE_USDC,
        tokenOut: ethers.ZeroAddress, //  address(0) 或 WETH 均可
        fee: 500,
        recipient: owner.address,
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        amountIn: amountIn,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0,
      };

      // 记录交易前余额
      const beforeEthBalance = await ethers.provider.getBalance(owner.address);
      const beforeFeeCollectorWETHBalance = await weth.balanceOf(
        feeCollector.address
      );

      // 执行交易
      await dexRouter.swapV3ExactIn(params);

      // 验证交易结果
      const afterEthBalance = await ethers.provider.getBalance(owner.address);
      const afterFeeCollectorWETHBalance = await weth.balanceOf(
        feeCollector.address
      );

      expect(afterEthBalance).to.be.gt(beforeEthBalance);
      expect(
        afterFeeCollectorWETHBalance - beforeFeeCollectorWETHBalance
      ).to.gt(0);
      console.log(
        "\t手续费收入为",
        ethers.formatEther(
          afterFeeCollectorWETHBalance - beforeFeeCollectorWETHBalance
        ),
        "WETH"
      );
    });
    it("Should swap USDC to ETH through V3 single route ( USDC -> virtual )", async function () {
      const { dexRouter, usdc, virtual, owner, feeCollector } =
        await loadFixture(deployFixture);

      // 授权 dexRouter 合约使用 usdc 代币
      const amountIn = ethers.parseUnits("1000", 6); // 1000 USDC
      await usdc.approve(dexRouter.target, amountIn);

      // 准备交易参数
      const params = {
        factoryAddress: process.env.BASE_UNI_V3_FACTORY,
        poolAddress: "0x529d2863a1521d0b57db028168fdE2E97120017C", // virtual/usdc pool
        tokenIn: process.env.BASE_USDC,
        tokenOut: process.env.BASE_VIRTUAL, // 输出ETH
        fee: 3000,
        recipient: owner.address,
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        amountIn: amountIn,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0,
      };

      // 记录交易前余额
      const beforeVirtualBalance = await virtual.balanceOf(owner.address);

      const beforeFeeCollectorUSDCBalance = await usdc.balanceOf(
        feeCollector.address
      );

      // 执行交易
      await dexRouter.swapV3ExactIn(params);

      // 验证交易结果
      const afterVirtualBalance = await virtual.balanceOf(owner.address);
      const afterFeeCollectorUSDCBalance = await usdc.balanceOf(
        feeCollector.address
      );

      expect(afterVirtualBalance).to.be.gt(beforeVirtualBalance);
      expect(
        afterFeeCollectorUSDCBalance - beforeFeeCollectorUSDCBalance
      ).to.gt(0); // 验证手续费是否正确
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
    it("Should swap AIXBT to ETH through V3 multi route ( AIXBT -> USDC -> ETH )", async function () {
      const { dexRouter, aixbt, weth, owner, feeCollector } = await loadFixture(
        deployFixture
      );

      const amountIn = await aixbt.balanceOf(owner.address);
      // 授权 dexRouter 合约使用 aixbt 代币
      await aixbt.approve(dexRouter.target, amountIn);

      // 准备交易参数
      const path = [
        "0x4F9Fd6Be4a90f2620860d680c0d4d5Fb53d1A825", // AIXBT
        process.env.BASE_USDC,
        process.env.BASE_WETH,
      ];
      const fees = [3000, 500];

      const params = {
        path: encodePath(path, fees),
        recipient: owner.address,
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        amountIn: amountIn,
        amountOutMinimum: 0,
        poolAddresses: [
          "0xf1Fdc83c3A336bdbDC9fB06e318B08EadDC82FF4", // AIXBT/USDC pool
          "0xd0b53D9277642d899DF5C87A3966A349A798F224", // USDC/WETH pool
        ],
        factoryAddresses: [
          process.env.BASE_UNI_V3_FACTORY,
          process.env.BASE_UNI_V3_FACTORY,
        ],
        nativeOut: true,
        tokenOut: process.env.BASE_WETH, // 输出ETH
      };

      // 记录交易前余额
      const beforeEthBalance = await ethers.provider.getBalance(owner.address);
      const beforeFeeCollectorWETHBalance = await weth.balanceOf(
        feeCollector.address
      );

      // 执行交易
      await dexRouter.swapV3MultiHopExactIn(params);

      // 验证交易结果
      const afterEthBalance = await ethers.provider.getBalance(owner.address);
      const afterFeeCollectorWETHBalance = await weth.balanceOf(
        feeCollector.address
      );

      expect(afterEthBalance).to.be.gt(beforeEthBalance);
      expect(
        afterFeeCollectorWETHBalance - beforeFeeCollectorWETHBalance
      ).to.gt(0);
    });
    it("Should swap LUNA to Aixbt through V3 multi route ( LUNA -> USDC -> Aixbt )", async function () {
      const { dexRouter, luna, aixbt, owner, feeCollector } = await loadFixture(
        deployFixture
      );

      // 授权 dexRouter 合约使用 luna 代币
      const amountIn = await luna.balanceOf(owner.address);
      await luna.approve(dexRouter.target, amountIn);

      // 准备交易参数
      const amountOutMin = 0;
      const path = [
        process.env.BASE_LUNA,
        process.env.BASE_USDC,
        "0x4F9Fd6Be4a90f2620860d680c0d4d5Fb53d1A825", // Aixbt
      ];
      const fees = [10000, 3000]; // LUNA -> USDC 的手续费为 10000，USDC -> Aixbt 的手续费为 3000

      const params = {
        path: encodePath(path, fees),
        recipient: owner.address,
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        amountIn: amountIn,
        amountOutMinimum: 0,
        poolAddresses: [
          "0x16E0907ed813d6E0287596ce1966FF1ad7b17298", // LUNA/USDC pool
          "0xf1Fdc83c3A336bdbDC9fB06e318B08EadDC82FF4", // Aixbt/USDC pool
        ],
        factoryAddresses: [
          process.env.BASE_UNI_V3_FACTORY,
          process.env.BASE_UNI_V3_FACTORY,
        ],
        nativeOut: false,
        tokenOut: "0x4F9Fd6Be4a90f2620860d680c0d4d5Fb53d1A825", // Aixbt
      };

      // 记录交易前余额
      const beforeAixbtBalance = await aixbt.balanceOf(owner.address);
      const beforeFeeCollectorBalance = await luna.balanceOf(
        feeCollector.address
      );

      // 执行交易
      await dexRouter.swapV3MultiHopExactIn(params, {
        value: ethers.parseEther("0"), // 不需要发送ETH
      });

      // 验证交易结果
      const afterAixbtBalance = await aixbt.balanceOf(owner.address);
      const afterFeeCollectorBalance = await luna.balanceOf(
        feeCollector.address
      );

      const expectedFee = (amountIn * BigInt(10000)) / BigInt(1000000); // 1% fee

      expect(afterAixbtBalance).to.be.gt(beforeAixbtBalance);
      expect(afterFeeCollectorBalance - beforeFeeCollectorBalance).to.equal(
        expectedFee
      );
    });
  });
});
