// 测试用例
// 1. v2 合约中的单个路由对的交易功能测试 (ETH -> Virtual) 并验证手续费
// 2. v2 合约中的多个路由对的交易功能测试 (ETH -> Virtual -> LUNA)并验证手续费
// 3. v3 合约中的单个路由对的交易功能测试 (ETH -> USDC)并验证手续费
// 4. v3 合约中的多个路由对的交易功能测试 (ETH -> USDC -> Aixbt)并验证手续费

// 测试函数：swapV2ExactIn、swapV2MultiHopExactIn、swapV3ExactIn、swapV3MultiHopExactIn

/*
UniV2 交易对

uniswap universal router = 0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad
uniswap weth approveTo = 0x000000000022d473030f116ddee9f6b43ac78ba3

Virtual/WETH: 0xE31c372a7Af875b3B5E0F3713B17ef51556da667
    virtual: 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b
    weth: 0x4200000000000000000000000000000000000006
    factory:0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6

LUNA/Virtual: 0xa8e64FB120CE8796594670BAE72279C8aA1e5359
    virtual: 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b
    luna: 0x55cD6469F597452B5A7536e2CD98fDE4c1247ee4  
    factory:0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6

WETH/USDC: 0x88A43bbDF9D098eEC7bCEda4e2494615dfD9bB9C
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


    AeroV3 交易对

CL200_Virtual/WETH: 0xC200F21EfE67c7F41B81A854c26F9cdA80593065
    virtual: 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b
    weth: 0x4200000000000000000000000000000000000006
    tickSpacing: 200
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

describe("Universal Trade", function () {
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

    const UniversalRouter = await ethers.getContractFactory("UniversalRouter");
    const universalRouter = await UniversalRouter.deploy(
      feeCollector.address,
      process.env.BASE_WETH,
      10000 // 1% fee
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

    // // 设置手续费代币
    // await dexRouter.setFeeTokens(
    //   [process.env.BASE_USDC, process.env.BASE_USDT],
    //   [true, true]
    // );

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
    const usdt = await ethers.getContractAt("IERC20", process.env.BASE_USDT);
    const star = await ethers.getContractAt("IERC20", process.env.BASE_STAR);
    const wai = await ethers.getContractAt(
      "IERC20",
      "0x23471E7250bCD7ee21Df3f39Ed6151931D1E076b"
    );

    const usdcBalanceBefore = await usdc.balanceOf(owner.address);
    console.log("USDC Balance Before Transfer:", usdcBalanceBefore.toString());

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

    const usdcBalanceAfter = await usdc.balanceOf(owner.address);
    console.log("USDC Balance After Transfer:", usdcBalanceAfter.toString());

    // // approve
    // await usdc.approve(dexRouter.target, ethers.parseUnits("6000", 6));

    // const params = {
    //   factoryAddress: process.env.BASE_UNI_V3_FACTORY,
    //   poolAddress: "0x16E0907ed813d6E0287596ce1966FF1ad7b17298", // LUNA/USDC pool
    //   tokenIn: process.env.BASE_USDC,
    //   tokenOut: process.env.BASE_LUNA,
    //   fee: 10000,
    //   recipient: owner.address,
    //   deadline: Math.floor(Date.now() / 1000) + 60 * 20,
    //   amountIn: ethers.parseUnits("5000", 6),
    //   amountOutMinimum: 0,
    //   sqrtPriceLimitX96: 0,
    // };

    // await dexRouter.swapV3ExactIn(params);

    // // aixbt
    // await dexRouter.swapV3ExactIn({
    //   factoryAddress: process.env.BASE_UNI_V3_FACTORY,
    //   poolAddress: "0xf1Fdc83c3A336bdbDC9fB06e318B08EadDC82FF4", // Aixbt/USDC pool
    //   tokenIn: process.env.BASE_USDC,
    //   tokenOut: "0x4F9Fd6Be4a90f2620860d680c0d4d5Fb53d1A825",
    //   fee: 3000,
    //   recipient: owner.address,
    //   deadline: Math.floor(Date.now() / 1000) + 60 * 20,
    //   amountIn: ethers.parseUnits("1000", 6),
    //   amountOutMinimum: 0,
    //   sqrtPriceLimitX96: 0,
    // });

    return {
      dexRouter,
      weth,
      virtual,
      usdc,
      luna,
      aixbt,
      owner,
      usdt,
      wai,
      star,
      feeCollector,
      universalRouter,
    };
  }

  describe("AERO  Swap", function () {
    it("Should swap virtual to luna through V2 exact in ( Virtual-> wai )", async function () {
      // 手续费为 wai
      const { universalRouter, virtual, wai, owner, feeCollector } =
        await loadFixture(deployFixture);

      // 获取 owner 的 virtual 余额
      const beforeVirtualBalance = await virtual.balanceOf(owner.address);
      console.log("\tbeforeVirtualBalance:", beforeVirtualBalance);

      //   const fee = (beforeVirtualBalance * BigInt(10000)) / BigInt(1000000); // 1% fee
      // 准备交易参数
      const amountIn = beforeVirtualBalance;
      const amountInWithFee = beforeVirtualBalance;

      // 记录交易前余额
      const beforeLunaBalance = await wai.balanceOf(owner.address);
      const beforeFeeCollectorBalance = await wai.balanceOf(
        feeCollector.address
      );
      console.log("\tbeforeLunaBalance:", beforeLunaBalance);
      console.log("\tbeforeFeeCollectorBalance:", beforeFeeCollectorBalance);

      const universalParams = {
        universalRouter: "0x6Cb442acF35158D5eDa88fe602221b67B400Be3E",
        tokenIn: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b",
        tokenOut: "0x23471E7250bCD7ee21Df3f39Ed6151931D1E076b",
        amountInWithFee: amountInWithFee,
        amountIn: amountIn,
        amountOutMin: 0,
      };

      const commands = "0x08";
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
      const inputs = new Array(1);
      const path = new Array(2);

      const routes = [
        {
          from: process.env.BASE_VIRTUAL,
          to: process.env.BASE_WAI,
          stable: false,
          factory: process.env.BASE_AERO_V2_FACTORY,
        },
      ];

      // 定义你的结构体 ABI
      const routeAbi =
        "tuple(address from, address to, bool stable, address factory)[]";

      path[0] = "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b";
      path[1] = "0x23471E7250bCD7ee21Df3f39Ed6151931D1E076b";
      inputs[0] = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "uint256", routeAbi, "bool"],
        [universalRouter.target, amountIn, 0, routes, false]
      );
      await virtual.approve(universalRouter.target, amountInWithFee);
      await universalRouter.execute(
        universalParams,
        commands,
        inputs,
        deadline
      );

      // 验证交易结果
      const afterVirtualBalance = await virtual.balanceOf(owner.address);
      console.log("\tafterVirtualBalance:", afterVirtualBalance);
      const afterLunaBalance = await wai.balanceOf(owner.address);
      const afterFeeCollectorBalance = await wai.balanceOf(
        feeCollector.address
      );
      console.log("\tafterLunaBalance:", afterLunaBalance);
      console.log("\tafterFeeCollectorBalance:", afterFeeCollectorBalance);

      // 计算手续费是否正确
      //   const expectedFee = (amountIn * BigInt(10000)) / BigInt(1000000); // 1% fee

      expect(afterLunaBalance).to.be.gt(beforeLunaBalance);
      expect(afterFeeCollectorBalance - beforeFeeCollectorBalance).to.be.gt(0);
    });

    it("Should swap virtual to luna through V2 exact in ( Virtual-> ETH )", async function () {
      // 手续费为 wai
      const { universalRouter, virtual, wai, owner, feeCollector } =
        await loadFixture(deployFixture);

      // 获取 owner 的 virtual 余额
      const beforeVirtualBalance = await virtual.balanceOf(owner.address);
      console.log("\tbeforeVirtualBalance:", beforeVirtualBalance);

      //   const fee = (beforeVirtualBalance * BigInt(10000)) / BigInt(1000000); // 1% fee
      // 准备交易参数
      const amountIn = beforeVirtualBalance;
      const amountInWithFee = beforeVirtualBalance;

      // 记录交易前余额
      const beforeLunaBalance = await ethers.provider.getBalance(owner.address);
      const beforeFeeCollectorBalance = await ethers.provider.getBalance(
        feeCollector.address
      );
      console.log("\tbeforeLunaBalance:", beforeLunaBalance);
      console.log("\tbeforeFeeCollectorBalance:", beforeFeeCollectorBalance);

      const universalParams = {
        universalRouter: "0x6Cb442acF35158D5eDa88fe602221b67B400Be3E",
        tokenIn: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b",
        tokenOut: ethers.ZeroAddress,
        amountInWithFee: amountInWithFee,
        amountIn: amountIn,
        amountOutMin: 0,
      };

      const commands = "0x08";
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
      const inputs = new Array(1);
      const path = new Array(2);

      const routes = [
        {
          from: process.env.BASE_VIRTUAL,
          to: process.env.BASE_WETH,
          stable: false,
          factory: process.env.BASE_AERO_V2_FACTORY,
        },
      ];

      // 定义你的结构体 ABI
      const routeAbi =
        "tuple(address from, address to, bool stable, address factory)[]";

      path[0] = "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b";
      path[1] = "0x23471E7250bCD7ee21Df3f39Ed6151931D1E076b";
      inputs[0] = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "uint256", routeAbi, "bool"],
        [universalRouter.target, amountIn, 0, routes, false]
      );
      await virtual.approve(universalRouter.target, amountInWithFee);
      await universalRouter.execute(
        universalParams,
        commands,
        inputs,
        deadline
      );

      // 验证交易结果
      const afterVirtualBalance = await virtual.balanceOf(owner.address);
      console.log("\tafterVirtualBalance:", afterVirtualBalance);
      const afterLunaBalance = await ethers.provider.getBalance(owner.address);
      const afterFeeCollectorBalance = await ethers.provider.getBalance(
        feeCollector.address
      );
      console.log("\tafterLunaBalance:", afterLunaBalance);
      console.log("\tafterFeeCollectorBalance:", afterFeeCollectorBalance);

      // 计算手续费是否正确
      //   const expectedFee = (amountIn * BigInt(10000)) / BigInt(1000000); // 1% fee

      expect(afterLunaBalance).to.be.gt(beforeLunaBalance);
      expect(afterFeeCollectorBalance - beforeFeeCollectorBalance).to.be.gt(0);
    });

    it("Should swap virtual to luna through V3 exact in ( Virtual-> ETH )", async function () {
      // equivalent: abi.decode(inputs, (address, uint256, uint256, bytes, bool))

      const { universalRouter, virtual, wai, owner, feeCollector } =
        await loadFixture(deployFixture);

      // 获取 owner 的 virtual 余额
      const beforeVirtualBalance = await virtual.balanceOf(owner.address);
      console.log("\tbeforeVirtualBalance:", beforeVirtualBalance);

      //   const fee = (beforeVirtualBalance * BigInt(10000)) / BigInt(1000000); // 1% fee
      // 准备交易参数
      const amountIn = beforeVirtualBalance;
      const amountInWithFee = beforeVirtualBalance;

      // 记录交易前余额
      const beforeLunaBalance = await ethers.provider.getBalance(owner.address);
      const beforeFeeCollectorBalance = await ethers.provider.getBalance(
        feeCollector.address
      );
      console.log("\tbeforeLunaBalance:", beforeLunaBalance);
      console.log("\tbeforeFeeCollectorBalance:", beforeFeeCollectorBalance);

      const universalParams = {
        universalRouter: "0x6Cb442acF35158D5eDa88fe602221b67B400Be3E",
        tokenIn: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b",
        tokenOut: ethers.ZeroAddress,
        amountInWithFee: amountInWithFee,
        amountIn: amountIn,
        amountOutMin: 0,
      };

      const commands = "0x00";
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
      const inputs = new Array(1);

      const pathv3 = [
        "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b",
        "0x4200000000000000000000000000000000000006",
      ];
      const fees = [200];

      const bytes = encodePath(pathv3, fees);

      inputs[0] = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "uint256", "bytes", "bool"],
        [universalRouter.target, amountIn, 0, bytes, false]
      );

      await virtual.approve(universalRouter.target, amountInWithFee);
      await universalRouter.execute(
        universalParams,
        commands,
        inputs,
        deadline
      );

      // 验证交易结果
      const afterVirtualBalance = await virtual.balanceOf(owner.address);
      console.log("\tafterVirtualBalance:", afterVirtualBalance);
      const afterLunaBalance = await ethers.provider.getBalance(owner.address);
      const afterFeeCollectorBalance = await ethers.provider.getBalance(
        feeCollector.address
      );
      console.log("\tafterLunaBalance:", afterLunaBalance);
      console.log("\tafterFeeCollectorBalance:", afterFeeCollectorBalance);

      // 计算手续费是否正确
      //   const expectedFee = (amountIn * BigInt(10000)) / BigInt(1000000); // 1% fee

      expect(afterLunaBalance).to.be.gt(beforeLunaBalance);
      expect(afterFeeCollectorBalance - beforeFeeCollectorBalance).to.be.gt(0);
    });

    it("Should swap virtual to luna through V3 exact in ( ETH -> Virtual )", async function () {
      // equivalent: abi.decode(inputs, (address, uint256, uint256, bytes, bool))

      const { universalRouter, virtual, wai, owner, feeCollector } =
        await loadFixture(deployFixture);

      //   const fee = (beforeVirtualBalance * BigInt(10000)) / BigInt(1000000); // 1% fee
      // 准备交易参数
      const amountIn = ethers.parseEther("1");
      const amountInWithFee = ethers.parseEther("1.01");

      // 记录交易前余额
      const beforeVirtualBalance = await virtual.balanceOf(owner.address);
      const beforeFeeCollectorBalance = await ethers.provider.getBalance(
        feeCollector.address
      );
      console.log("\tbeforeVirtualBalance:", beforeVirtualBalance);
      console.log("\tbeforeFeeCollectorBalance:", beforeFeeCollectorBalance);

      const universalParams = {
        universalRouter: "0x6Cb442acF35158D5eDa88fe602221b67B400Be3E",
        tokenIn: ethers.ZeroAddress,
        tokenOut: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b",
        amountInWithFee: amountInWithFee,
        amountIn: amountIn,
        amountOutMin: 0,
      };

      const commands = "0x00";
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
      const inputs = new Array(1);

      const pathv3 = [
        "0x4200000000000000000000000000000000000006",
        "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b",
      ];
      const fees = [200];

      const bytes = encodePath(pathv3, fees);

      inputs[0] = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "uint256", "bytes", "bool"],
        [owner.address, amountIn, 0, bytes, false]
      );

      await universalRouter.execute(
        universalParams,
        commands,
        inputs,
        deadline,
        {
          value: amountInWithFee,
        }
      );

      // 验证交易结果
      const afterVirtualBalance = await virtual.balanceOf(owner.address);
      console.log("\tafterVirtualBalance:", afterVirtualBalance);
      const afterLunaBalance = await ethers.provider.getBalance(owner.address);
      const afterFeeCollectorBalance = await ethers.provider.getBalance(
        feeCollector.address
      );
      console.log("\tafterVirtualBalance:", afterVirtualBalance);
      console.log("\tafterFeeCollectorBalance:", afterFeeCollectorBalance);

      // 计算手续费是否正确
      //   const expectedFee = (amountIn * BigInt(10000)) / BigInt(1000000); // 1% fee

      expect(afterVirtualBalance).to.be.gt(beforeVirtualBalance);
      expect(afterFeeCollectorBalance - beforeFeeCollectorBalance).to.be.gt(0);
    });
    it("Should swap usdc to star through V3 exact in ( USDC-> STAR )", async function () {
      // equivalent: abi.decode(inputs, (address, uint256, uint256, bytes, bool))

      const { universalRouter, virtual, usdc, star, owner, feeCollector } =
        await loadFixture(deployFixture);

      // 获取 owner 的 usdc 余额
      const beforeUsdcBalance = await usdc.balanceOf(owner.address);
      console.log("\tbeforeUsdcBalance:", beforeUsdcBalance);

      const fee = (beforeUsdcBalance * BigInt(10000)) / BigInt(1000000); // 1% fee
      // 准备交易参数
      const amountIn = beforeUsdcBalance - fee;
      const amountInWithFee = beforeUsdcBalance;

      // 记录交易前余额
      const beforeStarBalance = await star.balanceOf(owner.address);
      const beforeFeeCollectorBalance = await usdc.balanceOf(
        feeCollector.address
      );
      console.log("\tbeforeStarBalance:", beforeStarBalance);
      console.log("\tbeforeFeeCollectorBalance:", beforeFeeCollectorBalance);

      const universalParams = {
        universalRouter: "0x6Cb442acF35158D5eDa88fe602221b67B400Be3E",
        tokenIn: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        tokenOut: "0xc19669a405067927865b40ea045a2baabbbe57f5",
        amountInWithFee: amountInWithFee,
        amountIn: amountIn,
        amountOutMin: 0,
      };

      const commands = "0x00";
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
      const inputs = new Array(1);

      const pathv3 = [
        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "0xC19669A405067927865B40Ea045a2baabbbe57f5",
      ];
      const fees = [1];

      const bytes = encodePath(pathv3, fees);

      inputs[0] = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "uint256", "bytes", "bool"],
        [owner.address, amountIn, 0, bytes, false]
      );

      await usdc.approve(universalRouter.target, amountInWithFee);
      await universalRouter.execute(
        universalParams,
        commands,
        inputs,
        deadline
      );

      // 验证交易结果
      const afterUsdcBalance = await usdc.balanceOf(owner.address);
      console.log("\tafterUsdcBalance:", afterUsdcBalance);
      const afterStarBalance = await star.balanceOf(owner.address);
      const afterFeeCollectorBalance = await usdc.balanceOf(
        feeCollector.address
      );
      console.log("\tafterStarBalance:", afterStarBalance);
      console.log("\tafterFeeCollectorBalance:", afterFeeCollectorBalance);

      // 计算手续费是否正确
      const expectedFee = (amountInWithFee * BigInt(10000)) / BigInt(1000000); // 1% fee

      expect(afterUsdcBalance).to.be.lt(beforeUsdcBalance);
      expect(afterStarBalance).to.be.gt(beforeStarBalance);
      expect(afterFeeCollectorBalance - beforeFeeCollectorBalance).to.equal(
        expectedFee
      );
    });
  });

  describe("Uni  Swap", function () {
    it("Should swap virtual to luna through V2 exact in ( Virtual->luna )", async function () {
      // 手续费为 luna
      const { universalRouter, virtual, luna, owner, feeCollector } =
        await loadFixture(deployFixture);

      // 获取 owner 的 virtual 余额
      const beforeVirtualBalance = await virtual.balanceOf(owner.address);
      console.log("\tbeforeVirtualBalance:", beforeVirtualBalance);

      //   const fee = (beforeVirtualBalance * BigInt(10000)) / BigInt(1000000); // 1% fee
      // 准备交易参数
      const amountIn = beforeVirtualBalance;
      const amountInWithFee = beforeVirtualBalance;

      // 记录交易前余额
      const beforeLunaBalance = await luna.balanceOf(owner.address);
      const beforeFeeCollectorBalance = await luna.balanceOf(
        feeCollector.address
      );
      console.log("\tbeforeLunaBalance:", beforeLunaBalance);
      console.log("\tbeforeFeeCollectorBalance:", beforeFeeCollectorBalance);

      const universalParams = {
        universalRouter: "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad",
        tokenIn: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b",
        tokenOut: "0x55cD6469F597452B5A7536e2CD98fDE4c1247ee4",
        amountInWithFee: amountInWithFee,
        amountIn: amountIn,
        amountOutMin: 0,
      };

      const commands = "0x08";
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
      const inputs = new Array(1);
      const path = new Array(2);
      path[0] = "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b";
      path[1] = "0x55cD6469F597452B5A7536e2CD98fDE4c1247ee4";
      inputs[0] = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "uint256", "address[]", "bool"],
        [universalRouter.target, amountIn, 0, path, false]
      );
      await virtual.approve(universalRouter.target, amountInWithFee);
      await universalRouter.execute(
        universalParams,
        commands,
        inputs,
        deadline
      );

      // 验证交易结果
      const afterVirtualBalance = await virtual.balanceOf(owner.address);
      console.log("\tafterVirtualBalance:", afterVirtualBalance);
      const afterLunaBalance = await luna.balanceOf(owner.address);
      const afterFeeCollectorBalance = await luna.balanceOf(
        feeCollector.address
      );
      console.log("\tafterLunaBalance:", afterLunaBalance);
      console.log("\tafterFeeCollectorBalance:", afterFeeCollectorBalance);

      // 计算手续费是否正确
      //   const expectedFee = (amountIn * BigInt(10000)) / BigInt(1000000); // 1% fee

      expect(afterLunaBalance).to.be.gt(beforeLunaBalance);
      expect(afterFeeCollectorBalance - beforeFeeCollectorBalance).to.be.gt(0);
    });

    it("Should swap ETH to luna through V2 exact in ( ETH -> Virtual->luna )", async function () {
      const { universalRouter, virtual, luna, owner, feeCollector } =
        await loadFixture(deployFixture);

      // 准备交易参数
      const amountIn = ethers.parseEther("1");

      // 记录交易前余额
      const beforeVirtualBalance = await luna.balanceOf(owner.address);
      const beforeFeeCollectorBalance = await ethers.provider.getBalance(
        feeCollector.address
      );
      console.log("\tbeforeVirtualBalance:", beforeVirtualBalance);
      console.log("\tbeforeFeeCollectorBalance:", beforeFeeCollectorBalance);

      const universalParams = {
        universalRouter: "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad",
        tokenIn: ethers.ZeroAddress,
        tokenOut: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b",
        amountInWithFee: ethers.parseEther("1.01"),
        amountIn: ethers.parseEther("1"),
        amountOutMin: 0,
      };

      const commands = "0x08";
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
      const inputs = new Array(1);
      const path = new Array(3);
      path[0] = "0x4200000000000000000000000000000000000006";
      path[1] = "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b";
      path[2] = "0x55cD6469F597452B5A7536e2CD98fDE4c1247ee4";
      inputs[0] = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "uint256", "address[]", "bool"],
        [owner.address, amountIn, 0, path, false]
      );
      await universalRouter.execute(
        universalParams,
        commands,
        inputs,
        deadline,
        {
          value: ethers.parseEther("1.01"),
        }
      );

      // 验证交易结果
      const afterVirtualBalance = await luna.balanceOf(owner.address);
      const afterFeeCollectorBalance = await ethers.provider.getBalance(
        feeCollector.address
      );
      console.log("\tafterVirtualBalance:", afterVirtualBalance);
      console.log("\tafterFeeCollectorBalance:", afterFeeCollectorBalance);

      // 计算手续费是否正确
      const expectedFee = (amountIn * BigInt(10000)) / BigInt(1000000); // 1% fee

      expect(afterVirtualBalance).to.be.gt(beforeVirtualBalance);
      expect(afterFeeCollectorBalance - beforeFeeCollectorBalance).to.equal(
        expectedFee
      );
    });
    it("ETH --> ERC20 split V2 and V3, one hop (WETH/USDC/Luna)", async function () {
      const { universalRouter, weth, usdc, luna, owner, feeCollector } =
        await loadFixture(deployFixture);

      // 准备交易参数
      const amountIn = ethers.parseEther("1");
      const amountInWithFee = ethers.parseEther("1.01");

      // 记录交易前余额
      const beforeLunaBalance = await luna.balanceOf(owner.address);
      const beforeFeeCollectorBalance = await ethers.provider.getBalance(
        feeCollector.address
      );
      console.log("\tbeforeLunaBalance:", beforeLunaBalance);
      console.log("\tbeforeFeeCollectorBalance:", beforeFeeCollectorBalance);

      const universalParams = {
        universalRouter: "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad",
        tokenIn: ethers.ZeroAddress,
        tokenOut: "0x55cD6469F597452B5A7536e2CD98fDE4c1247ee4",
        amountInWithFee: amountInWithFee,
        amountIn: amountIn,
        amountOutMin: 0,
      };

      const commands = "0x0800";
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
      const inputs = new Array(1);
      const path = new Array(2);
      path[0] = "0x4200000000000000000000000000000000000006";
      path[1] = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
      inputs[0] = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "uint256", "address[]", "bool"],
        ["0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad", amountIn, 0, path, false]
      );

      const pathv3 = [
        process.env.BASE_USDC,
        "0x55cD6469F597452B5A7536e2CD98fDE4c1247ee4",
      ];
      const fees = [10000];

      const bytes = encodePath(pathv3, fees);

      inputs[1] = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "uint256", "bytes", "bool"],
        [owner.address, 3369559814, 0, bytes, false]
      );

      await universalRouter.execute(
        universalParams,
        commands,
        inputs,
        deadline,
        {
          value: amountInWithFee,
        }
      );
      // 验证交易结果
      const afterLunaBalance = await luna.balanceOf(owner.address);
      const afterFeeCollectorBalance = await ethers.provider.getBalance(
        feeCollector.address
      );
      console.log("\tafterLunaBalance:", afterLunaBalance);
      console.log("\tafterFeeCollectorBalance:", afterFeeCollectorBalance);

      // 计算手续费是否正确
      //   const expectedFee = (amountIn * BigInt(10000)) / BigInt(1000000); // 1% fee

      expect(afterLunaBalance).to.be.gt(beforeLunaBalance);
      expect(afterFeeCollectorBalance - beforeFeeCollectorBalance).to.be.gt(0);
    });
  });
});
