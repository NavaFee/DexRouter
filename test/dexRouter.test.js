const { expect } = require("chai");
const { ethers, deployments } = require("hardhat");

describe("DexRouter 合约测试", function () {
  let dexRouter;
  let owner;
  let admin;
  let trader;
  let user;
  let weth;
  let feeCollector;
  const INITIAL_FEE = 10000; // 初始费率 1%

  beforeEach(async function () {
    // 获取测试账户
    [owner, admin, trader, user] = await ethers.getSigners();
    // 测试网 WETH 地址
    weth = process.env.ETH_SEPOLIA_WETH;
    feeCollector = process.env.FeeCollector;

    // 部署合约
    await deployments.fixture(["all"]);
    dexRouter = await ethers.getContract("DexRouter");
  });

  describe("初始化测试", function () {
    it("应该正确设置初始费率", async function () {
      const fee = await dexRouter.getFeeRate();
      console.log("\t初始费率:", fee);
      expect(fee).to.equal(INITIAL_FEE);
    });

    it("应该正确设置初始手续费收集地址", async function () {
      const collector = await dexRouter.getFeeCollector();
      console.log("\t初始手续费收集地址:", collector);
      expect(collector).to.equal(feeCollector);
    });

    it("应该正确设置 WETH 地址", async function () {
      const contractWeth = await dexRouter.WETH();
      expect(contractWeth).to.equal(weth);
    });
  });

  describe("管理员功能测试", function () {
    it("只有管理员可以设置新的管理员", async function () {
      // 当前管理员
      const currentAdmin = await dexRouter.owner();
      console.log("\t当前管理员:", currentAdmin);
      const newAdmin = user.address;

      console.log("\tnewAdmin:", newAdmin);
      // 非管理员尝试设置新管理员应该失败
      await expect(dexRouter.connect(user).transferOwnership(newAdmin))
        .to.be.revertedWithCustomError(dexRouter, "OwnableUnauthorizedAccount")
        .withArgs(user.address);

      // 管理员设置新管理员应该成功
      await dexRouter.connect(owner).transferOwnership(newAdmin);
      console.log("\t设置新管理员成功");
      // 新管理员
      const newAdminAddress = await dexRouter.owner();
      console.log("\t新管理员:", newAdminAddress);
      // 原管理员不能再设置新管理员
      await expect(dexRouter.connect(admin).transferOwnership(admin.address))
        .to.be.revertedWithCustomError(dexRouter, "OwnableUnauthorizedAccount")
        .withArgs(admin.address);
    });

    it("只有管理员可以设置新的费用收集者", async function () {
      const newFeeCollector = user.address;

      // 非管理员尝试设置新的费用收集者应该失败
      await expect(dexRouter.connect(user).setFeeCollector(newFeeCollector))
        .to.be.revertedWithCustomError(dexRouter, "OwnableUnauthorizedAccount")
        .withArgs(user.address);

      // 管理员设置新的费用收集者应该成功
      await dexRouter.connect(owner).setFeeCollector(newFeeCollector);
      // 验证新的费用收集者
      const collector = await dexRouter.getFeeCollector();
      console.log("\t新费用收集者:", collector);
      expect(collector).to.equal(newFeeCollector);
    });

    it("只有管理员可以设置新的费率", async function () {
      const newFee = 20000; // 2%

      // 非管理员尝试设置新费率应该失败
      await expect(dexRouter.connect(user).setFeeRate(newFee))
        .to.be.revertedWithCustomError(dexRouter, "OwnableUnauthorizedAccount")
        .withArgs(user.address);

      // 管理员设置新费率应该成功
      await dexRouter.connect(owner).setFeeRate(newFee);

      // 验证新的费率
      const fee = await dexRouter.getFeeRate();
      console.log("\t新费率:", fee);
      expect(fee).to.equal(newFee);
    });
  });

  describe("查询功能测试", function () {
    it("应该能正确查询当前费率", async function () {
      const fee = await dexRouter.getFeeRate();
      expect(fee).to.equal(INITIAL_FEE);
    });

    it("应该能正确查询当前费用收集地址", async function () {
      const collector = await dexRouter.getFeeCollector();
      expect(collector).to.equal(feeCollector);
    });

    it("应该能正确查询 WETH 地址", async function () {
      const contractWeth = await dexRouter.WETH();
      expect(contractWeth).to.equal(weth);
    });
  });
});
