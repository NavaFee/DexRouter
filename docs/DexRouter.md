# DexRouter  文档接口说明

# Uni  接口

### swapV2ExactIn：V2  单路由兑换

```javascript
// tokenIn: 换入代币的地址 如果为ETH 则输入 address(0)
// tokenOut: 换出代币的地址 如果为ETH 则输入 address(0)
// amountIn: 换入代币的数量
// amountOutMin: 最小可以兑换到的数量
// poolAddress: 池子的地址

function swapV2ExactIn(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        address poolAddress
    ) public payable nonReentrant returns (uint256 amountOut)
```

#### Example: (ETH->USDC)

```javascript
// UniV2 池子
// WETH/USDC: 0x88A43bbDF9D098eEC7bCEda4e2494615dfD9bB9C
// weth: 0x4200000000000000000000000000000000000006
// usdc: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
// factory: 0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6

const dexRouter = await ethers.getContractAt("DexRouter", dexRouterAddress);

await dexRouter.swapV2ExactIn(
  ethers.ZeroAddress, // tokenIn，换入代币为ETH，这里输入为0
  usdc_address, // tokenOut，换出地址
  ethers.parseEther("10"), // 换入的数量
  0, // 最小兑换数量，根据实际情况计算
  weth_usdc_pair_address, // 池子的地址
  {
    value: ethers.parseEther("10"), //  转入 ETH
  }
);
```

### swapV2MultiHopExactIn：V2  多路由兑换

```javascript
// tokenIn: 换入代币的地址 如果为ETH 则输入 address(0)
// amountIn: 换入代币的数量
// factory: uniV2 factory 合约地址
// amountOutMin: 最小可以兑换到的数量
// path: 代币路径数组
// recipient: 收币人的地址
// deadline: 订单过期时间，unix时间戳

  struct V2ExactInMultiHopParams {
      address factory;
      uint256 amountOutMin;
      address[] path;
      address recipient;
      uint deadline;
  }
 function swapV2MultiHopExactIn(
        address tokenIn,
        uint256 amountIn,
        V2ExactInMultiHopParams calldata params
    )
        public
        payable
        nonReentrant
        checkDeadline(params.deadline)
        returns (uint[] memory amounts)
```

#### Example: (ETH -> Virtual -> LUNA)

```javascript
/*
Virtual/WETH: 0xE31c372a7Af875b3B5E0F3713B17ef51556da667
    virtual: 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b
    weth: 0x4200000000000000000000000000000000000006
    factory:0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6

LUNA/Virtual: 0xa8e64FB120CE8796594670BAE72279C8aA1e5359
    virtual: 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b
    luna: 0x55cD6469F597452B5A7536e2CD98fDE4c1247ee4  
    factory:0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6
*/

const dexRouter = await ethers.getContractAt("DexRouter", dexRouterAddress);

// 执行交易
await dexRouter.swapV2MultiHopExactIn(
  ethers.ZeroAddress, // tokenIn = address(0) 表示输入ETH
  ethers.parseEther("1"), // amountIn
  {
    path: [weth_address, virtual_address, luna_address],
    factory: uniV2_factory_address,
    amountOutMin: 0,
    recipient: trader.address,
    deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 有效期20分钟
  },
  {
    value: ethers.parseEther("1"),
  }
);
```

### swapV3ExactIn：V3  单路由兑换

```javascript
// factoryAddress: uniV3 factory合约地址
// poolAddress: 池子地址
// tokenIn: 换入代币的地址 如果为ETH 则输入 address(0)
// tokenOut: 换出代币的地址 如果为ETH 则输入 address(0)
// fee: 池子的费率（视池子而定）
// recipient: 收币人的地址
// deadline: 订单过期时间，unix时间戳
// amountIn: 换入代币的数量
// amountOutMin: 最小可以兑换到的数量
// sqrtPriceLimitX96: 也是用于计算最小获得数量的，置为 0 即可

   struct ExactInputSingleParams {
        address factoryAddress;
        address poolAddress;
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

function swapV3ExactIn(
        ExactInputSingleParams memory params
    )
        external
        payable
        nonReentrant
        checkDeadline(params.deadline)
        returns (uint256 amountOut)
```

#### Example: （ETH -> USDC）

```javascript
/*

WETH/USDC: 0xd0b53D9277642d899DF5C87A3966A349A798F224
    weth: 0x4200000000000000000000000000000000000006
    usdc: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
    fee: 500
    factory: 0x33128a8fC17869897dcE68Ed026d694621f6FDfD
*/

// 准备交易参数
const params = {
  factoryAddress: uniV3_factory_address,
  poolAddress: "0xd0b53D9277642d899DF5C87A3966A349A798F224", // WETH/USDC pool
  tokenIn: ethers.ZeroAddress, // 输入为ETH, 则为 0 地址
  tokenOut: usdc_address,
  fee: 500, // 池子的费率
  recipient: trader.address,
  deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 有效期20分钟
  amountIn: ethers.parseEther("1"),
  amountOutMinimum: 0, // 最小兑换量，按照实际情况而定
  sqrtPriceLimitX96: 0, // univ3合约所需参数，置 0 即可
};

// 执行交易
await dexRouter.swapV3ExactIn(params, {
  value: ethers.parseEther("1"), // 转入ETH的数量
});
```

### swapV3MultiHopExactIn：V3  多路由兑换

```javascript
// factoryAddress: uniV3 factory合约地址 数组
// poolAddress: 池子地址 数组
// path: 兑换代币路径的 编码
// tokenOut: 换出代币的地址 如果为ETH 则输入 address(0)
// recipient: 收币人的地址
// deadline: 订单过期时间，unix时间戳
// amountIn: 换入代币的数量
// amountOutMin: 最小可以兑换到的数量

struct ExactInputParams {
        address[] factoryAddresses;
        address[] poolAddresses;
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        address tokenOut;
    }
    function swapV3MultiHopExactIn(
        ExactInputParams memory params
    )
        public
        payable
        nonReentrant
        checkDeadline(params.deadline)
        returns (uint256 amountOut)

```

#### Example: （ETH -> USDC -> Aixbt ）

```javascript
/*
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

// 编码path工具函数

const FEE_SIZE = 3;

function encodePath(path, fees) {
  if (path.length != fees.length + 1) {
    throw new Error("path/fee lengths do not match");
  }

  let encoded = "0x";
  for (let i = 0; i < fees.length; i++) {
    // 20 byte encoding of the address
    encoded += path[i].slice(2);
    // 3 byte encoding of the fee
    encoded += fees[i].toString(16).padStart(2 * FEE_SIZE, "0");
  }
  // encode the final token
  encoded += path[path.length - 1].slice(2);

  return encoded.toLowerCase();
}

// 准备交易参数
const amountIn = ethers.parseEther("1");
const path = [weth_address, usdc_address, aixbt_address];
const fees = [500, 3000]; // 池子的费率

const params = {
  path: encodePath(path, fees),
  recipient: owner.address,
  deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 有效期20分钟
  amountIn: amountIn,
  amountOutMinimum: 0,
  poolAddresses: [
    "0xd0b53D9277642d899DF5C87A3966A349A798F224", // WETH/USDC pool
    "0xf1Fdc83c3A336bdbDC9fB06e318B08EadDC82FF4", // Aixbt/USDC pool
  ],
  factoryAddresses: [uniV3_factory_address, uniV3_factory_address],
  tokenOut: aixbt_address,
};

// 执行交易
await dexRouter.swapV3MultiHopExactIn(params, {
  value: ethers.parseEther("1"), // 转入ETH的数量
});
```

# Aero  接口

### AeroV2ExactInput:  支持多路由兑换

```javascript

struct Route {    // 路由信息
    address from; // 换入代币地址，不能0地址，
    address to;   // 换出代币地址
    bool stable;  // 是否为稳定路由
    address factory; // aeroV2 factory 合约地址
}

function AeroV2ExactInput(
        uint256 amountIn,    //  换入代币数量
        uint256 amountOutMin,//  换出代币最小数量
        IRouter.Route[] calldata routes, // 路由信息
        address to,      // 收币地址
        bool nativeIn,   // 换入代币是否为 ETH
        bool nativeOut,  // 换处代币是否为 ETH
        uint256 deadline // 订单过期时间，unix时间戳
    ) external payable checkDeadline(deadline) returns (uint256 amountOut)
```

#### Example ( ETH -> Virtual )：

```javascript
/*
vAMM_Virtual/WETH: 0x21594b992F68495dD28d605834b58889d0a727c7
    virtual: 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b
    weth: 0x4200000000000000000000000000000000000006
    stable: false
    factory: 0x420DD381b31aEf6683db6B902084cB0FFECe40Da
*/

// 准备交易参数
const amountIn = ethers.parseEther("1");
const amountOutMin = 0;
const routes = [
  {
    from: weth_address,
    to: virtual_address,
    stable: false,
    factory: aeroV2_factory_address,
  },
];

// 执行交易
await dexRouter.AeroV2ExactInput(
  amountIn, // 换入代币数量
  amountOutMin, // 最小 兑换数量
  routes, // 路由信息
  owner.address, // 接收代币地址
  true, // nativeIn       // 换入代币是否为ETH
  false, // nativeOut     // 换出代币是否为ETH
  Math.floor(Date.now() / 1000) + 60 * 20, // 有效期 20 min
  {
    value: ethers.parseEther("1"), // 转入ETH的数量
  }
);
```

### AeroV3ExactInputSingle：V3 单路由兑换

```javascript
   struct ExactInputSingleParams {
        address tokenIn;    // 路由换入代币地址 不为0地址
        address tokenOut;   // 路由换处代币地址 不为0地址
        int24 tickSpacing;  // 池子的  tickSpacing
        address recipient;  // 代币接收者地址
        uint256 deadline;   // 订单过期时间，unix时间戳
        uint256 amountIn;   // 换入代币数量
        uint256 amountOutMinimum; // 最小兑换数量
        uint160 sqrtPriceLimitX96; // 也是用于计算做小获得数量的，置为 0 即可
    }

function AeroV3ExactInputSingle(
        ISwapRouter.ExactInputSingleParams memory params,
        bool nativeIn,     // 换入代币是否为 ETH
        bool nativeOut     // 换出代币是否为 ETH
    )
        external
        payable
        checkDeadline(params.deadline)
        returns (uint256 amountOut)
```

#### Example ( ETH -> Virtual )：

```javascript
/*
CL200_Virtual/WETH: 0xC200F21EfE67c7F41B81A854c26F9cdA80593065
    virtual: 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b
    weth: 0x4200000000000000000000000000000000000006
    tickSpacing: 200
    factory: process.env.BASE_AERO_V3_FACTORY
*/

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

// 执行交易
await dexRouter.AeroV3ExactInputSingle(
  params,
  true, // nativeIn
  false, // nativeOut
  {
    value: ethers.parseEther("1"),
  }
);
```

### AeroV3ExactInputSingle：V3 多路由兑换

```javascript
  struct ExactInputParams {
      bytes path; // 兑换代币路径的 编码
      address recipient; // 收币人的地址
      uint256 deadline;  // 订单过期时间，unix时间戳
      uint256 amountIn;  // 换入代币的数量
      uint256 amountOutMinimum; // 最小可以兑换到的数量
  }

 function AeroV3ExactInput(
        ISwapRouter.ExactInputParams memory params,
        address tokenIn,  // 换入代币的地址
        address tokenOut, // 换出代币的地址
        bool nativeIn,    // 换入代币是否为 ETH
        bool nativeOut    // 换出代币是否为 ETH
)
        external
        payable
        checkDeadline(params.deadline)
        returns (uint256 amountOut)
```

#### Example ( ( ETH -> USDC -> STAR ))：

```javascript
/*
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

// 编码path工具函数

const FEE_SIZE = 3;

function encodePath(path, fees) {
  if (path.length != fees.length + 1) {
    throw new Error("path/fee lengths do not match");
  }

  let encoded = "0x";
  for (let i = 0; i < fees.length; i++) {
    // 20 byte encoding of the address
    encoded += path[i].slice(2);
    // 3 byte encoding of the fee
    encoded += fees[i].toString(16).padStart(2 * FEE_SIZE, "0");
  }
  // encode the final token
  encoded += path[path.length - 1].slice(2);

  return encoded.toLowerCase();
}

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
```
