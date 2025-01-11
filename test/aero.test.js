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

vAMM_Virtual/Aixbt: 0xeb3458046d3aA2fdbBbF4FEe58C755744ec42ce2
    virtual: 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b
    Aixbt: 0x4F9Fd6Be4a90f2620860d680c0d4d5Fb53d1A825 
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

    // 设置手续费代币
    await dexRouter.setFeeTokens(
      [process.env.BASE_USDC, process.env.BASE_USDT],
      [true, true]
    );

    // 获取代币合约实例
    const weth = await ethers.getContractAt("IERC20", process.env.BASE_WETH);
    const virtual = await ethers.getContractAt(
      "IERC20",
      process.env.BASE_VIRTUAL
    );
    const usdc = await ethers.getContractAt("IERC20", process.env.BASE_USDC);
    const usdt = await ethers.getContractAt("IERC20", process.env.BASE_USDT);
    const star = await ethers.getContractAt("IERC20", process.env.BASE_STAR);
    const wai = await ethers.getContractAt(
      "IERC20",
      "0x23471E7250bCD7ee21Df3f39Ed6151931D1E076b"
    );
    const aixbt = await ethers.getContractAt(
      "IERC20",
      "0x4F9Fd6Be4a90f2620860d680c0d4d5Fb53d1A825"
    );
    return {
      dexRouter,
      weth,
      virtual,
      usdc,
      usdt,
      wai,
      star,
      aixbt,
      owner,
      feeCollector,
    };
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
      console.log("\t手续费收入为", ethers.formatEther(expectedFee), "ETH");
    });

    it("Should swap Virtual to ETH through V2 single route ( Virtual -> ETH )", async function () {
      const { dexRouter, virtual, weth, owner, feeCollector } =
        await loadFixture(deployFixture);

      // 1. 先要通过ETH换取到 Virtual
      const amountIn = ethers.parseEther("1");
      const amountOutMin = 0;
      const routesToVirtual = [
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

      // 执行交易将 ETH 兑换为 Virtual
      await dexRouter.AeroV2ExactInput(
        amountIn,
        amountOutMin,
        routesToVirtual,
        owner.address,
        true, // nativeIn
        false, // nativeOut
        Math.floor(Date.now() / 1000) + 60 * 20, // deadline 20 minutes
        {
          value: ethers.parseEther("1"),
        }
      );

      // 验证交易结果
      const afterVirtualBalance = await virtual.balanceOf(owner.address);
      const afterFeeCollectorBalance = await ethers.provider.getBalance(
        feeCollector.address
      );

      // 计算手续费是否正确
      const expectedFee = (amountIn * BigInt(10000)) / BigInt(1000000); // 1% fee
      expect(afterVirtualBalance).to.be.gt(0); // 确保获得了 Virtual
      expect(afterFeeCollectorBalance - beforeFeeCollectorBalance).to.equal(
        expectedFee
      );

      // 2. 再将 Virtual 兑换为 ETH
      const routesToETH = [
        {
          from: process.env.BASE_VIRTUAL,
          to: process.env.BASE_WETH,
          stable: false,
          factory: process.env.BASE_AERO_V2_FACTORY,
        },
      ];

      // 记录交易前余额
      const beforeETHBalance = await ethers.provider.getBalance(owner.address);
      const beforeFeeCollectorWETHBalance = await weth.balanceOf(
        feeCollector.address
      );

      // 将 virtual 授权给合约
      await virtual.approve(dexRouter.target, afterVirtualBalance);

      // 执行交易将 Virtual 兑换为 ETH
      await dexRouter.AeroV2ExactInput(
        afterVirtualBalance, // 使用之前获得的 Virtual 余额
        amountOutMin,
        routesToETH,
        owner.address,
        false, // nativeIn
        true, // nativeOut
        Math.floor(Date.now() / 1000) + 60 * 20, // deadline 20 minutes
        {
          // 不需要传入ETH
        }
      );

      // 验证交易结果
      const afterETHBalance = await ethers.provider.getBalance(owner.address);
      const afterFeeCollectorWETHBalance = await weth.balanceOf(
        feeCollector.address
      );

      // 计算手续费是否正确  手续费为WETH

      expect(afterETHBalance).to.be.gt(beforeETHBalance); // 确保获得了 ETH
      expect(afterFeeCollectorWETHBalance).to.be.gt(
        beforeFeeCollectorWETHBalance
      ); // 确保收入了手续费
      console.log(
        "\t手续费收入为",
        ethers.formatEther(
          afterFeeCollectorWETHBalance - beforeFeeCollectorWETHBalance
        ),
        "WETH"
      );
    });

    it("Should swap Virtual to WAI through V2 single route ( Virtual -> WAI )", async function () {
      const { dexRouter, virtual, wai, owner, feeCollector } =
        await loadFixture(deployFixture);

      // 1. 先要通过ETH换取到 Virtual
      const amountIn = ethers.parseEther("1");
      const amountOutMin = 0;
      const routesToVirtual = [
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

      // 执行交易将 ETH 兑换为 Virtual
      await dexRouter.AeroV2ExactInput(
        amountIn,
        amountOutMin,
        routesToVirtual,
        owner.address,
        true, // nativeIn
        false, // nativeOut
        Math.floor(Date.now() / 1000) + 60 * 20, // deadline 20 minutes
        {
          value: ethers.parseEther("1"),
        }
      );

      // 验证交易结果
      const afterVirtualBalance = await virtual.balanceOf(owner.address);
      const afterFeeCollectorBalance = await ethers.provider.getBalance(
        feeCollector.address
      );

      // 计算手续费是否正确
      const expectedFee = (amountIn * BigInt(10000)) / BigInt(1000000); // 1% fee
      expect(afterVirtualBalance).to.be.gt(0); // 确保获得了 Virtual
      expect(afterFeeCollectorBalance - beforeFeeCollectorBalance).to.equal(
        expectedFee
      );

      // 2. 再将 Virtual 兑换为 WAI
      const routesToWai = [
        {
          from: process.env.BASE_VIRTUAL,
          to: process.env.BASE_WAI,
          stable: false,
          factory: process.env.BASE_AERO_V2_FACTORY,
        },
      ];

      // 记录交易前余额
      const beforeWaiBalance = await wai.balanceOf(owner.address);
      const beforeFeeCollectorVirtualBalance = await virtual.balanceOf(
        feeCollector.address
      );

      // 将 virtual 授权给合约
      await virtual.approve(dexRouter.target, afterVirtualBalance);

      // 执行交易将 Virtual 兑换为 WAI
      await dexRouter.AeroV2ExactInput(
        afterVirtualBalance, // 使用之前获得的 Virtual 余额
        amountOutMin,
        routesToWai,
        owner.address,
        false, // nativeIn
        false, // nativeOut
        Math.floor(Date.now() / 1000) + 60 * 20, // deadline 20 minutes
        {
          // 不需要传入ETH
        }
      );

      // 验证交易结果
      const afterWaiBalance = await wai.balanceOf(owner.address);
      const afterFeeCollectorVirtualBalance = await virtual.balanceOf(
        feeCollector.address
      );

      // 计算手续费是否正确
      const expectedFeeVirtual =
        (afterVirtualBalance * BigInt(10000)) / BigInt(1000000); // 1% fee
      expect(afterWaiBalance).to.be.gt(beforeWaiBalance); // 确保获得了 WAI
      expect(
        afterFeeCollectorVirtualBalance - beforeFeeCollectorVirtualBalance
      ).to.equal(expectedFeeVirtual);
      console.log(
        "\t手续费收入为",
        ethers.formatEther(expectedFeeVirtual),
        "Virtual"
      );
    });
  });

  describe("AeroV2 Multi Route Swap", function () {
    it("Should swap WETH to WAI through V2 multi route ( ETH -> Virtual -> WAI )", async function () {
      const { dexRouter, weth, wai, virtual, owner, feeCollector } =
        await loadFixture(deployFixture);

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
      console.log("\t手续费收入为", ethers.formatEther(expectedFee), "ETH");
    });

    it("Should swap WAI to WETH through V2 multi route ( WAI -> Virtual -> ETH )", async function () {
      const { dexRouter, weth, wai, virtual, owner, feeCollector } =
        await loadFixture(deployFixture);
      // 1. 先将 ETH 换成 Wai
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

      // 记录交易前余额
      const beforeVirtualBalance = await virtual.balanceOf(owner.address);
      const beforeWaiBalance = await wai.balanceOf(owner.address);

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

      const expectedFee = (amountIn * BigInt(10000)) / BigInt(1000000); // 1% fee

      expect(afterWaiBalance).to.be.gt(beforeWaiBalance);
      expect(afterFeeCollectorBalance - beforeFeeCollectorBalance).to.equal(
        expectedFee
      );

      // 授权
      await wai.approve(dexRouter.target, afterWaiBalance);
      // 2. 将 Wai 换成 ETH
      const routesToETH = [
        {
          from: process.env.BASE_WAI,
          to: process.env.BASE_VIRTUAL,
          stable: false,
          factory: process.env.BASE_AERO_V2_FACTORY,
        },
        {
          from: process.env.BASE_VIRTUAL,
          to: process.env.BASE_WETH,
          stable: false,
          factory: process.env.BASE_AERO_V2_FACTORY,
        },
      ];

      // 记录交易前余额
      const beforeETHBalance = await ethers.provider.getBalance(owner.address);
      const beforeFeeCollectorWETHBalance = await weth.balanceOf(
        feeCollector.address
      );

      // 执行交易
      await dexRouter.AeroV2ExactInput(
        afterWaiBalance,
        amountOutMin,
        routesToETH,
        owner.address,
        false, // nativeIn
        true, // nativeOut
        Math.floor(Date.now() / 1000) + 60 * 20,
        {
          // 不需要传入ETH
        }
      );

      // 验证交易结果
      const afterETHBalance = await ethers.provider.getBalance(owner.address);
      const afterFeeCollectorWETHBalance = await weth.balanceOf(
        feeCollector.address
      );

      expect(afterETHBalance).to.be.gt(beforeETHBalance);
      expect(afterFeeCollectorWETHBalance).to.be.gt(
        beforeFeeCollectorWETHBalance
      );
      console.log(
        "\t手续费收入为",
        ethers.formatEther(
          afterFeeCollectorWETHBalance - beforeFeeCollectorWETHBalance
        ),
        "WETH"
      );
    });

    it("Should swap WAI to aixbt through V2 multi route ( WAI -> Virtual -> aixbt )", async function () {
      const { dexRouter, aixbt, wai, virtual, owner, feeCollector } =
        await loadFixture(deployFixture);
      // 1. 先将 ETH 换成 Wai
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

      // 记录交易前余额
      const beforeVirtualBalance = await virtual.balanceOf(owner.address);
      const beforeWaiBalance = await wai.balanceOf(owner.address);

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

      const expectedFee = (amountIn * BigInt(10000)) / BigInt(1000000); // 1% fee

      expect(afterWaiBalance).to.be.gt(beforeWaiBalance);
      expect(afterFeeCollectorBalance - beforeFeeCollectorBalance).to.equal(
        expectedFee
      );

      // 授权
      await wai.approve(dexRouter.target, afterWaiBalance);

      // 2. 将 Wai 换成 aixbt
      const routesToAixbt = [
        {
          from: process.env.BASE_WAI,
          to: process.env.BASE_VIRTUAL,
          stable: false,
          factory: process.env.BASE_AERO_V2_FACTORY,
        },
        {
          from: process.env.BASE_VIRTUAL,
          to: process.env.BASE_AIXBT,
          stable: false,
          factory: process.env.BASE_AERO_V2_FACTORY,
        },
      ];

      // 记录交易前余额
      const beforeAixbtBalance = await aixbt.balanceOf(owner.address);
      const beforeFeeCollectorWaiBalance = await aixbt.balanceOf(
        feeCollector.address
      );

      // 执行交易
      await dexRouter.AeroV2ExactInput(
        afterWaiBalance,
        amountOutMin,
        routesToAixbt,
        owner.address,
        false, // nativeIn
        false, // nativeOut
        Math.floor(Date.now() / 1000) + 60 * 20,
        {
          // 不需要传入ETH
        }
      );

      // 验证交易结果
      const afterAixbtBalance = await aixbt.balanceOf(owner.address);
      const afterFeeCollectorWaiBalance = await wai.balanceOf(
        feeCollector.address
      );

      expect(afterAixbtBalance).to.be.gt(beforeAixbtBalance);
      expect(afterFeeCollectorWaiBalance).to.be.gt(
        beforeFeeCollectorWaiBalance
      );
      console.log(
        "\t手续费收入为",
        ethers.formatEther(
          afterFeeCollectorWaiBalance - beforeFeeCollectorWaiBalance
        ),
        "wai"
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
      console.log("\t手续费收入为", ethers.formatEther(expectedFee), "ETH");
    });

    it("Should swap Virtual to WETH through V3 single route ( Virtual -> ETH)", async function () {
      const { dexRouter, weth, virtual, owner, feeCollector } =
        await loadFixture(deployFixture);

      // 1. 先要通过ETH换取到 Virtual
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

      const expectedFee = (amountIn * BigInt(10000)) / BigInt(1000000); // 1% fee

      expect(afterVirtualBalance).to.be.gt(beforeVirtualBalance);
      expect(afterFeeCollectorBalance - beforeFeeCollectorBalance).to.equal(
        expectedFee
      );

      // 2. 再将 Virtual 兑换为 ETH
      const paramsToETH = {
        tokenIn: virtual.target,
        tokenOut: process.env.BASE_WETH,
        tickSpacing: 200,
        recipient: owner.address,
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        amountIn: afterVirtualBalance,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0,
      };

      // 记录交易前余额
      const beforeETHBalance = await ethers.provider.getBalance(owner.address);
      const beforeFeeCollectorWETHBalance = await weth.balanceOf(
        feeCollector.address
      );

      // 将 virtual 授权给合约
      await virtual.approve(dexRouter.target, afterVirtualBalance);

      // 执行交易将 Virtual 兑换为 ETH
      await dexRouter.AeroV3ExactInputSingle(
        paramsToETH,
        false, // nativeIn
        true, // nativeOut
        {
          // 不需要传入ETH
        }
      );

      // 验证交易结果
      const afterETHBalance = await ethers.provider.getBalance(owner.address);
      const afterFeeCollectorWETHBalance = await weth.balanceOf(
        feeCollector.address
      );

      expect(afterETHBalance).to.be.gt(beforeETHBalance); // 确保获得了 ETH
      expect(afterFeeCollectorWETHBalance).to.be.gt(
        beforeFeeCollectorWETHBalance
      ); // 确保收入了手续费
      console.log(
        "\t手续费收入为",
        ethers.formatEther(
          afterFeeCollectorWETHBalance - beforeFeeCollectorWETHBalance
        ),
        "WETH"
      );
    });

    it("Should swap STAR to USDC through V3 single route ( STAR -> USDC )", async function () {
      // 先将 ETH 换成 STAR
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

      expect(afterStarBalance).to.be.gt(beforeStarBalance);
      const expectedFee = (amountIn * BigInt(10000)) / BigInt(1000000); // 1% fee

      expect(afterFeeCollectorBalance - beforeFeeCollectorBalance).to.equal(
        expectedFee
      );

      // 2. 将 STAR 兑换为 USDC
      const paramsToUSDC = {
        tokenIn: star.target,
        tokenOut: process.env.BASE_USDC,
        tickSpacing: 1,
        recipient: owner.address,
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        amountIn: afterStarBalance,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0,
      };

      // 记录交易前余额
      const beforeUSDCBalance = await usdc.balanceOf(owner.address);
      const beforeFeeCollectorUSDCBalance = await usdc.balanceOf(
        feeCollector.address
      );

      // 将 star 授权给合约
      await star.approve(dexRouter.target, afterStarBalance);

      // 执行交易将 STAR 兑换为 USDC
      await dexRouter.AeroV3ExactInputSingle(
        paramsToUSDC,
        false, // nativeIn
        false, // nativeOut
        {
          // 不需要传入ETH
        }
      );

      // 验证交易结果
      const afterUSDCBalance = await usdc.balanceOf(owner.address);
      const afterFeeCollectorUSDCBalance = await usdc.balanceOf(
        feeCollector.address
      );

      expect(afterUSDCBalance).to.be.gt(beforeUSDCBalance); // 确保获得了 USDC
      expect(afterFeeCollectorUSDCBalance).to.be.gt(
        beforeFeeCollectorUSDCBalance
      ); // 确保收入了手续费

      console.log(
        "\t手续费收入为",
        ethers.formatUnits(
          afterFeeCollectorUSDCBalance - beforeFeeCollectorUSDCBalance,
          6
        ),
        "USDC"
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
      console.log("\t手续费收入为", ethers.formatEther(expectedFee), "ETH");
    });
    it("Should swap STAR to ETH through V3 multi route ( STAR -> USDC -> ETH )", async function () {
      const { dexRouter, star, weth, owner, feeCollector } = await loadFixture(
        deployFixture
      );
      // 1. 先将 ETH 换成 STAR

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

      expect(afterStarBalance).to.be.gt(beforeStarBalance);
      const expectedFee = (amountIn * BigInt(10000)) / BigInt(1000000); // 1% fee

      expect(afterFeeCollectorBalance - beforeFeeCollectorBalance).to.equal(
        expectedFee
      );

      // 授权
      await star.approve(dexRouter.target, afterStarBalance);
      // 2. 再将 STAR 兑换为 ETH
      const pathToETH = [
        process.env.BASE_STAR,
        process.env.BASE_USDC,
        process.env.BASE_WETH,
      ];
      const feesToETH = [1, 100];

      const paramsToETH = {
        path: encodePath(pathToETH, feesToETH),
        recipient: owner.address,
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        amountIn: afterStarBalance,
        amountOutMinimum: 0,
      };

      // 记录交易前余额
      const beforeETHBalance = await ethers.provider.getBalance(owner.address);
      const beforeFeeCollectorWETHBalance = await weth.balanceOf(
        feeCollector.address
      );

      // 执行交易
      await dexRouter.AeroV3ExactInput(
        paramsToETH,
        process.env.BASE_STAR,
        process.env.BASE_WETH,
        false,
        true,
        {}
      );

      // 验证交易结果
      const afterETHBalance = await ethers.provider.getBalance(owner.address);
      const afterFeeCollectorWETHBalance = await weth.balanceOf(
        feeCollector.address
      );

      expect(afterETHBalance).to.be.gt(beforeETHBalance);
      expect(afterFeeCollectorWETHBalance).to.be.gt(
        beforeFeeCollectorWETHBalance
      );

      console.log(
        "\t手续费收入为",
        ethers.formatEther(
          afterFeeCollectorWETHBalance - beforeFeeCollectorWETHBalance
        ),
        "WETH"
      );
    });
    it("Should swap STAR to USDT through V3 multi route ( STAR -> USDC -> USDT )", async function () {
      const { dexRouter, star, weth, usdt, owner, feeCollector } =
        await loadFixture(deployFixture);
      // 1. 先将 ETH 换成 STAR

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

      expect(afterStarBalance).to.be.gt(beforeStarBalance);
      const expectedFee = (amountIn * BigInt(10000)) / BigInt(1000000); // 1% fee

      expect(afterFeeCollectorBalance - beforeFeeCollectorBalance).to.equal(
        expectedFee
      );

      // 授权
      await star.approve(dexRouter.target, afterStarBalance);
      // 2. 再将 STAR 兑换为 ETH
      const pathToETH = [
        process.env.BASE_STAR,
        process.env.BASE_USDC,
        process.env.BASE_USDT,
      ];
      const feesToETH = [1, 1];

      const paramsToETH = {
        path: encodePath(pathToETH, feesToETH),
        recipient: owner.address,
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        amountIn: afterStarBalance,
        amountOutMinimum: 0,
      };

      // 记录交易前余额
      const beforeUSDTBalance = await usdt.balanceOf(owner.address);
      const beforeFeeCollectorUSDTBalance = await usdt.balanceOf(
        feeCollector.address
      );

      // 执行交易
      await dexRouter.AeroV3ExactInput(
        paramsToETH,
        process.env.BASE_STAR,
        process.env.BASE_USDT,
        false,
        false,
        {}
      );

      // 验证交易结果
      const afterUSDTBalance = await usdt.balanceOf(owner.address);
      const afterFeeCollectorUSDTBalance = await usdt.balanceOf(
        feeCollector.address
      );

      expect(afterUSDTBalance).to.be.gt(beforeUSDTBalance);
      expect(afterFeeCollectorUSDTBalance).to.be.gt(
        beforeFeeCollectorUSDTBalance
      );

      console.log(
        "\t手续费收入为",
        ethers.formatUnits(
          afterFeeCollectorUSDTBalance - beforeFeeCollectorUSDTBalance,
          6
        ),
        "USDT"
      );
    });
  });
});
