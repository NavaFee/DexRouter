// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IUniswapV2Pair.sol";
import "./interfaces/IUniswapV3Pool.sol";
import "./interfaces/IUniswapV3SwapCallback.sol";
import "./interfaces/IWETH.sol";

import "./libs/Path.sol";
import "./libs/SafeMath.sol";
import "./libs/TickMath.sol";
import "./libs/UniswapV2Library.sol";
import "./libs/CallbackValidation.sol";
import "./Storage.sol";

contract SwapFee is Storage, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeMath for uint;
    using Path for bytes;
    using SafeCast for uint256;

    address public factoryV3;
    uint256 public amountInCached;

    // 管理员地址
    address private admin;

    // 手续费率 如需为 1% 则设置为 10000
    uint256 private feeRate;

    // 手续费分母
    uint256 private immutable FEE_DENOMINATOR = 1000000;

    // WETH
    address public immutable WETH;

    // 手续费收集地址
    address private feeCollector;

    event FeeCollected(
        address indexed token,
        address indexed payer,
        uint256 amount,
        uint256 timestamp
    );

    modifier checkDeadline(uint256 deadline) {
        require(block.timestamp <= deadline, "Transaction too old");
        _;
    }

    receive() external payable {}

    constructor(
        address _feeCollector,
        uint256 _fee,
        address _weth
    ) Ownable(msg.sender) {
        admin = msg.sender;
        feeCollector = _feeCollector;
        feeRate = _fee;
        WETH = _weth;
    }

    // V2: Any swap, ExactIn single-hop - SupportingFeeOnTransferTokens
    function swapV2ExactIn(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        address poolAddress
    ) public payable nonReentrant returns (uint amountOut) {
        require(poolAddress != address(0), "SwapFee: invalid pool address");
        require(amountIn > 0, "SwapFee: amount_in invalid");

        bool nativeIn = false;
        if (tokenIn == address(0)) {
            require(
                msg.value >= amountIn,
                "SwapFee: amount in and value mismatch"
            );
            nativeIn = true;
            tokenIn = WETH;
            // refund
            uint amount = msg.value - amountIn;
            if (amount > 0) {
                (bool success, ) = address(msg.sender).call{value: amount}("");
                require(success, "SwapFee: refund ETH error");
            }
        }

        uint256 fee = takeFee(tokenIn, amountIn);
        amountIn = amountIn - fee;

        // 处理支付
        if (nativeIn) {
            pay(tokenIn, address(this), poolAddress, amountIn);
        } else {
            pay(tokenIn, msg.sender, poolAddress, amountIn);
        }

        // 检查是否为原生代币输出
        bool nativeOut = tokenOut == address(0);
        // 获取交换前余额
        uint balanceBefore = nativeOut
            ? IERC20(WETH).balanceOf(address(this))
            : IERC20(tokenOut).balanceOf(msg.sender);

        IUniswapV2Pair pair = IUniswapV2Pair(poolAddress);

        // 将复杂的swap逻辑抽取到独立的内部函数中
        (uint amount0Out, uint amount1Out) = _calculateV2SwapOutputs(
            pair,
            tokenIn
        );

        address to = nativeOut ? address(this) : msg.sender;
        pair.swap(amount0Out, amount1Out, to, new bytes(0));

        if (nativeOut) {
            amountOut = IERC20(WETH).balanceOf(address(this)).sub(
                balanceBefore
            );
            IWETH(WETH).withdraw(amountOut);
            (bool success, ) = address(msg.sender).call{value: amountOut - fee}(
                ""
            );
            require(success, "SwapFee: send ETH out error");
        } else {
            amountOut = IERC20(tokenOut).balanceOf(msg.sender).sub(
                balanceBefore
            );
        }
        require(
            amountOut >= amountOutMin,
            "SwapFee: insufficient output amount"
        );
    }

    // V2: 计算Swap的输出
    function _calculateV2SwapOutputs(
        IUniswapV2Pair pair,
        address tokenIn
    ) internal view returns (uint amount0Out, uint amount1Out) {
        address token0 = pair.token0();
        (uint reserve0, uint reserve1, ) = pair.getReserves();

        uint reserveInput;
        uint reserveOutput;
        if (tokenIn == token0) {
            reserveInput = reserve0;
            reserveOutput = reserve1;
        } else {
            reserveInput = reserve1;
            reserveOutput = reserve0;
        }

        uint actualAmountInput = IERC20(tokenIn).balanceOf(address(pair)).sub(
            reserveInput
        );
        uint amountOutput = UniswapV2Library.getAmountOut(
            actualAmountInput,
            reserveInput,
            reserveOutput
        );

        (amount0Out, amount1Out) = tokenIn == token0
            ? (uint(0), amountOutput)
            : (amountOutput, uint(0));
    }

    // **** SWAP (supporting fee-on-transfer tokens) ****
    // requires the initial amount to have already been sent to the first pair
    function _swapSupportingFeeOnTransferTokens(
        address[] memory path,
        address _to,
        address _factory
    ) internal virtual {
        for (uint i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);

            IUniswapV2Pair pair = IUniswapV2Pair(
                UniswapV2Library.pairFor(_factory, input, output)
            );

            // 将复杂的swap逻辑抽取到独立的内部函数中
            (uint amount0Out, uint amount1Out) = _calculateV2SwapOutputs(
                pair,
                input
            );
            address to = i < path.length - 2
                ? UniswapV2Library.pairFor(_factory, output, path[i + 2])
                : _to;
            pair.swap(amount0Out, amount1Out, to, new bytes(0));
        }
    }

    // V2-V2: Uniswap/Sushiswap, SupportingFeeOnTransferTokens and multi-hop
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
    {
        require(amountIn > 0, "SwapFee: amout in is zero");

        uint length = params.path.length;
        bool nativeIn = false;

        if (tokenIn == address(0)) {
            require(
                msg.value >= amountIn,
                "SwapFee: amount in and value mismatch"
            );
            nativeIn = true;
            tokenIn = WETH;
            // refund
            uint amount = msg.value - amountIn;
            if (amount > 0) {
                (bool success, ) = address(msg.sender).call{value: amount}("");
                require(success, "SwapFee: refund ETH error");
            }
        }
        uint256 fee = takeFee(tokenIn, amountIn);
        amountIn = amountIn - fee;

        bool nativeOut = false;
        address tokenOut = params.path[length - 1];
        if (tokenOut == WETH) {
            nativeOut = true;
        }

        address firstPool = UniswapV2Library.pairFor(
            params.factory,
            params.path[0],
            params.path[1]
        );
        if (nativeIn) {
            pay(tokenIn, address(this), firstPool, amountIn);
        } else pay(tokenIn, msg.sender, firstPool, amountIn);
        require(tokenIn == params.path[0], "invalid path");

        amounts = UniswapV2Library.getAmountsOut(
            params.factory,
            amountIn,
            params.path
        );

        uint balanceBefore = IERC20(params.path[length - 1]).balanceOf(
            nativeOut ? address(this) : params.recipient
        );
        _swapSupportingFeeOnTransferTokens(
            params.path,
            nativeOut ? address(this) : params.recipient,
            params.factory
        );
        uint amountOut = IERC20(params.path[length - 1])
            .balanceOf(nativeOut ? address(this) : params.recipient)
            .sub(balanceBefore);
        amounts[length - 1] = amountOut;
        require(
            amountOut >= params.amountOutMin,
            "SwapFee: insufficient output amount"
        );
        if (nativeOut) {
            IWETH(WETH).withdraw(amountOut);
            (bool success, ) = address(params.recipient).call{value: amountOut}(
                ""
            );
            require(success, "SwapFee: send ETH out error");
        }
    }

    /// IUniswapV3SwapCallback
    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata _data
    ) external {
        require(amount0Delta > 0 || amount1Delta > 0); // swaps entirely within 0-liquidity regions are not supported
        SwapCallbackData memory data = abi.decode(_data, (SwapCallbackData));
        (address tokenIn, address tokenOut, uint24 fee) = data
            .path
            .decodeFirstPool();
        CallbackValidation.verifyCallback(factoryV3, tokenIn, tokenOut, fee);

        (bool isExactInput, uint256 amountToPay) = amount0Delta > 0
            ? (tokenIn < tokenOut, uint256(amount0Delta))
            : (tokenOut < tokenIn, uint256(amount1Delta));
        if (isExactInput) {
            pay(tokenIn, data.payer, msg.sender, amountToPay);
        } else {
            // either initiate the next swap or pay
            if (data.path.hasMultiplePools()) {
                data.path = data.path.skipToken();
                exactOutputInternal(amountToPay, msg.sender, 0, data);
            } else {
                amountInCached = amountToPay;
                tokenIn = tokenOut; // swap in/out because exact output swaps are reversed
                pay(tokenIn, data.payer, msg.sender, amountToPay);
            }
        }
    }
    /// @dev Performs a single exact output swap
    function exactOutputInternal(
        uint256 amountOut,
        address recipient,
        uint160 sqrtPriceLimitX96,
        SwapCallbackData memory data
    ) private returns (uint256 amountIn) {
        // allow swapping to the router address with address 0
        if (recipient == address(0)) recipient = address(this);

        (address tokenOut, address tokenIn, uint24 fee) = data
            .path
            .decodeFirstPool();

        bool zeroForOne = tokenIn < tokenOut;

        (int256 amount0Delta, int256 amount1Delta) = getPool(
            tokenIn,
            tokenOut,
            fee
        ).swap(
                recipient,
                zeroForOne,
                -amountOut.toInt256(),
                sqrtPriceLimitX96 == 0
                    ? (
                        zeroForOne
                            ? TickMath.MIN_SQRT_RATIO + 1
                            : TickMath.MAX_SQRT_RATIO - 1
                    )
                    : sqrtPriceLimitX96,
                abi.encode(data)
            );

        uint256 amountOutReceived;
        (amountIn, amountOutReceived) = zeroForOne
            ? (uint256(amount0Delta), uint256(-amount1Delta))
            : (uint256(amount1Delta), uint256(-amount0Delta));
        // it's technically possible to not receive the full output amount,
        // so if no price limit has been specified, require this possibility away
        if (sqrtPriceLimitX96 == 0) require(amountOutReceived == amountOut);
    }

    // V3: Performs a single exact input swap
    function exactInputInternal(
        address poolAddress,
        uint256 amountIn,
        address recipient,
        uint160 sqrtPriceLimitX96,
        SwapCallbackData memory data
    ) private returns (uint256 amountOut) {
        // allow swapping to the router address with address 0
        if (recipient == address(0)) recipient = address(this);

        (address tokenIn, address tokenOut, ) = data.path.decodeFirstPool();

        bool zeroForOne = tokenIn < tokenOut;

        (int256 amount0, int256 amount1) = IUniswapV3Pool(poolAddress).swap(
            recipient,
            zeroForOne,
            amountIn.toInt256(),
            sqrtPriceLimitX96 == 0
                ? (
                    zeroForOne
                        ? TickMath.MIN_SQRT_RATIO + 1
                        : TickMath.MAX_SQRT_RATIO - 1
                )
                : sqrtPriceLimitX96,
            abi.encode(data)
        );

        return uint256(-(zeroForOne ? amount1 : amount0));
    }

    // V3: ExactIn single-hop
    function swapV3ExactIn(
        ExactInputSingleParams memory params
    )
        external
        payable
        nonReentrant
        checkDeadline(params.deadline)
        returns (uint256 amountOut)
    {
        require(params.amountIn > 0, "SwapFee: amount in is zero");

        if (params.tokenIn == address(0)) {
            params.tokenIn = WETH;
            require(
                msg.value >= params.amountIn,
                "SwapFee: amount in and value mismatch"
            );
            // refund
            uint amount = msg.value - params.amountIn;
            if (amount > 0) {
                (bool success, ) = address(msg.sender).call{value: amount}("");
                require(success, "SwapFee: refund ETH error");
            }
        }

        uint256 fee = takeFee(params.tokenIn, params.amountIn);
        params.amountIn = params.amountIn - fee;

        bool nativeOut = false;
        if (params.tokenOut == WETH) nativeOut = true;

        // update factoryV3 globally, so as to pass callback verification
        factoryV3 = params.factoryAddress;
        amountOut = exactInputInternal(
            params.poolAddress,
            params.amountIn,
            nativeOut ? address(0) : params.recipient,
            params.sqrtPriceLimitX96,
            SwapCallbackData({
                path: abi.encodePacked(
                    params.tokenIn,
                    params.fee,
                    params.tokenOut
                ),
                payer: msg.sender
            })
        );

        require(
            amountOut >= params.amountOutMinimum,
            "SwapFee: insufficient out amount"
        );

        if (nativeOut) {
            IWETH(WETH).withdraw(amountOut);
            (bool success, ) = address(params.recipient).call{value: amountOut}(
                ""
            );

            require(success, "SwapFee: send ETH out error");
        }
    }

    // V3-V3: ExactIn multi-hop
    function swapV3MultiHopExactIn(
        ExactInputParams memory params
    )
        public
        payable
        nonReentrant
        checkDeadline(params.deadline)
        returns (uint256 amountOut)
    {
        require(params.amountIn > 0, "SwapFee: amount in is zero");
        if (msg.value > 0) {
            require(
                msg.value >= params.amountIn,
                "SwapFee: amount in and value mismatch"
            );
            // refund
            uint amount = msg.value - params.amountIn;
            if (amount > 0) {
                (bool success, ) = address(msg.sender).call{value: amount}("");
                require(success, "SwapFee: refund ETH error");
            }
        }

        (address tokenIn, , ) = params.path.decodeFirstPool();
        if (tokenIn == address(0)) {
            tokenIn = WETH;
        }
        uint256 fee = takeFee(tokenIn, params.amountIn);
        params.amountIn = params.amountIn - fee;

        address payer = msg.sender; // msg.sender pays for the first hop

        uint i = 0;
        while (true) {
            bool hasMultiplePools = params.path.hasMultiplePools();

            // the outputs of prior swaps become the inputs to subsequent ones
            factoryV3 = params.factoryAddresses[i];
            params.amountIn = exactInputInternal(
                params.poolAddresses[i],
                params.amountIn,
                hasMultiplePools
                    ? address(this)
                    : (params.nativeOut ? address(this) : params.recipient),
                0,
                SwapCallbackData({
                    path: params.path.getFirstPool(),
                    payer: payer
                })
            );

            // decide whether to continue or terminate
            if (hasMultiplePools) {
                payer = address(this); // at this point, the caller has paid
                params.path = params.path.skipToken();
                i++;
            } else {
                amountOut = params.amountIn;
                break;
            }
        }

        require(
            amountOut >= params.amountOutMinimum,
            "SwapFee: too little received"
        );
        if (params.nativeOut) {
            IWETH(WETH).withdraw(amountOut);
            (bool success, ) = address(params.recipient).call{value: amountOut}(
                ""
            );
            require(success, "SwapFee: send ETH out error");
        }
    }

    // V3: compute pool address
    function getPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) public view returns (IUniswapV3Pool) {
        return
            IUniswapV3Pool(
                PoolAddress.computeAddress(
                    factoryV3,
                    PoolAddress.getPoolKey(tokenA, tokenB, fee)
                )
            );
    }

    function isStrEqual(
        string memory str1,
        string memory str2
    ) internal pure returns (bool) {
        return keccak256(bytes(str1)) == keccak256(bytes(str2));
    }

    // Mixed: ExactIn multi-hop, token not supporting zero address
    function swapMixedMultiHopExactIn(
        ExactInputMixedParams memory params
    )
        public
        payable
        nonReentrant
        checkDeadline(params.deadline)
        returns (uint256 amountOut)
    {
        require(params.routes.length == 2, "SwapX: only 2 routes supported");

        require(params.amountIn > 0, "SwapX: amount in is zero");

        (address tokenIn, address tokenOut1, uint24 fee1) = params
            .path1
            .decodeFirstPool();
        bool nativeIn = false;
        if (tokenIn == WETH || tokenIn == address(0)) {
            require(
                msg.value >= params.amountIn,
                "SwapX: amount in and value mismatch"
            );
            nativeIn = true;
            tokenIn = WETH;
            // refund
            uint amount = msg.value - params.amountIn;
            if (amount > 0) {
                (bool success, ) = address(msg.sender).call{value: amount}("");
                require(success, "SwapX: refund ETH error");
            }
        }
        uint256 fee = takeFee(
            tokenIn == WETH ? address(0) : tokenIn,
            params.amountIn
        );
        params.amountIn = params.amountIn - fee;

        if (
            isStrEqual(params.routes[0], "v2") &&
            isStrEqual(params.routes[1], "v2")
        ) {
            // uni - sushi, or verse
            address poolAddress1 = params.poolAddress1; // UniswapV2Library.pairFor(params.factory1, tokenIn, tokenOut1);
            if (nativeIn) {
                pay(tokenIn, address(this), poolAddress1, params.amountIn);
            } else pay(tokenIn, msg.sender, poolAddress1, params.amountIn);

            address[] memory path1 = new address[](2);
            path1[0] = tokenIn;
            path1[1] = tokenOut1;

            (, address tokenOut, ) = params.path2.decodeFirstPool();
            address[] memory path2 = new address[](2);
            path2[0] = tokenOut1;
            path2[1] = tokenOut;
            address poolAddress2 = params.poolAddress2; // UniswapV2Library.pairFor(params.factory2, tokenOut1, tokenOut);

            bool nativeOut = tokenOut == WETH;

            uint balanceBefore = IERC20(tokenOut).balanceOf(
                nativeOut ? address(this) : params.recipient
            );
            _swapSupportingFeeOnTransferTokens(
                path1,
                poolAddress2,
                params.factory1
            );
            _swapSupportingFeeOnTransferTokens(
                path2,
                nativeOut ? address(this) : params.recipient,
                params.factory2
            );
            amountOut = IERC20(tokenOut)
                .balanceOf(nativeOut ? address(this) : params.recipient)
                .sub(balanceBefore);
            if (nativeOut) {
                IWETH(WETH).withdraw(amountOut);
                fee = takeFee(address(0), amountOut);
                (bool success, ) = address(params.recipient).call{
                    value: amountOut - fee
                }("");
                require(success, "SwapX: send ETH out error");
            }
        } else if (
            isStrEqual(params.routes[0], "v2") &&
            isStrEqual(params.routes[1], "v3")
        ) {
            address poolAddress1 = params.poolAddress1; //UniswapV2Library.pairFor(params.factory1, tokenIn, tokenOut1);
            if (nativeIn) {
                pay(tokenIn, address(this), poolAddress1, params.amountIn);
            } else pay(tokenIn, msg.sender, poolAddress1, params.amountIn);

            address[] memory path1 = new address[](2);
            path1[0] = tokenIn;
            path1[1] = tokenOut1;
            uint[] memory amounts1 = UniswapV2Library.getAmountsOut(
                params.factory1,
                params.amountIn,
                path1
            );
            uint amountOut1 = amounts1[amounts1.length - 1];

            (, address tokenOut, ) = params.path2.decodeFirstPool();
            bool nativeOut = tokenOut == WETH;
            uint balanceBefore = IERC20(tokenOut).balanceOf(
                nativeOut ? address(this) : params.recipient
            );
            _swapSupportingFeeOnTransferTokens(
                path1,
                address(this),
                params.factory1
            );

            factoryV3 = params.factory2;
            amountOut = exactInputInternal(
                params.poolAddress2,
                amountOut1,
                nativeOut ? address(this) : params.recipient,
                0,
                SwapCallbackData({path: params.path2, payer: address(this)})
            );
            amountOut = IERC20(tokenOut)
                .balanceOf(nativeOut ? address(this) : params.recipient)
                .sub(balanceBefore);

            if (nativeOut) {
                IWETH(WETH).withdraw(amountOut);
                fee = takeFee(address(0), amountOut);
                (bool success, ) = address(params.recipient).call{
                    value: amountOut - fee
                }("");
                require(success, "SwapX: send ETH out error");
            }
        } else if (
            isStrEqual(params.routes[0], "v3") &&
            isStrEqual(params.routes[1], "v2")
        ) {
            (address tokenIn2, address tokenOut, ) = params
                .path2
                .decodeFirstPool();
            address pairV2Address = params.poolAddress2; //UniswapV2Library.pairFor(params.factory2, tokenIn2, tokenOut);

            factoryV3 = params.factory1;
            uint amountOut1 = exactInputInternal(
                params.poolAddress1,
                params.amountIn,
                pairV2Address,
                0,
                SwapCallbackData({
                    path: abi.encodePacked(tokenIn, fee1, tokenOut1),
                    payer: msg.sender
                })
            );

            address[] memory path2 = new address[](2);
            path2[0] = tokenIn2;
            path2[1] = tokenOut;
            uint[] memory amounts2 = UniswapV2Library.getAmountsOut(
                params.factory2,
                amountOut1,
                path2
            );
            amountOut = amounts2[amounts2.length - 1];

            bool nativeOut = tokenOut == WETH;
            uint balanceBefore = IERC20(tokenOut).balanceOf(
                nativeOut ? address(this) : params.recipient
            );
            _swapSupportingFeeOnTransferTokens(
                path2,
                nativeOut ? address(this) : params.recipient,
                params.factory2
            );
            amountOut = IERC20(tokenOut)
                .balanceOf(nativeOut ? address(this) : params.recipient)
                .sub(balanceBefore);
            if (nativeOut) {
                IWETH(WETH).withdraw(amountOut);
                fee = takeFee(address(0), amountOut);
                (bool success, ) = address(params.recipient).call{
                    value: amountOut - fee
                }("");
                require(success, "SwapX: send ETH out error");
            }
        }
        require(
            amountOut >= params.amountOutMinimum,
            "SwapX: too little received"
        );
    }

    // 处理代币支付逻辑
    function pay(
        address token,
        address payer,
        address recipient,
        uint256 value
    ) internal {
        if (token == WETH && address(this).balance >= value) {
            // TODO: 测试时注意一下这里的逻辑
            // pay with WETH
            IWETH(WETH).deposit{value: value}(); // wrap only what is needed to pay
            IWETH(WETH).transfer(recipient, value);
        } else if (payer == address(this)) {
            // pay with tokens already in the contract (for the exact input multihop case)
            //IERC20(token).safeTransfer(recipient, value);
            IERC20(token).transfer(recipient, value);
        } else {
            // pull payment
            IERC20(token).safeTransferFrom(payer, recipient, value);
            // IERC20(token).transferFrom(payer, recipient, value);
        }
    }

    // 收取手续费，并且将手续费发送给手续费收集地址
    // mapping(address => uint256) UserFeeRate 可以考虑设置不同地址的手续费率
    function takeFee(
        address tokenIn,
        uint256 amountIn
    ) internal returns (uint256) {
        uint256 fee = amountIn.mul(feeRate).div(FEE_DENOMINATOR);

        if (tokenIn == address(0) && address(this).balance > fee) {
            // 处理原生代币的情况
            (bool success, ) = address(feeCollector).call{value: fee}("");
            require(success, "SwapFee: take fee error");
        } else {
            // 处理 ERC20 代币的情况，包括 WETH
            IERC20(tokenIn).safeTransferFrom(msg.sender, feeCollector, fee);
        }

        emit FeeCollected(tokenIn, msg.sender, fee, block.timestamp);

        return fee;
    }

    // 设置手续费收集地址
    function setFeeCollector(address _feeCollector) public {
        require(msg.sender == admin, "Only admin can set fee collector");
        feeCollector = _feeCollector;
    }

    // 查询手续费收集地址
    function getFeeCollector() public view returns (address) {
        return feeCollector;
    }

    // 设置手续费率
    function setFeeRate(uint256 _fee) public {
        require(msg.sender == admin, "Only admin can set fee");
        feeRate = _fee;
    }

    function setAdmin(address _admin) public {
        require(msg.sender == admin, "Only admin can set admin");
        admin = _admin;
    }

    // 获取管理员地址
    function getAdmin() public view returns (address) {
        return admin;
    }

    // 获取手续费率
    function getFeeRate() public view returns (uint256) {
        return feeRate;
    }

    // 提取合约中的代币
    function withdrawAny(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        if (token == address(0)) {
            (bool success, bytes memory data) = payable(to).call{value: amount}(
                ""
            );
            require(success, string(data));
        } else {
            SafeERC20.safeTransfer(IERC20(token), to, amount);
        }
    }
}
