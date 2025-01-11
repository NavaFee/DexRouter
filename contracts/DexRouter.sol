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
import "./interfaces/ISwapRouter.sol";
import "./interfaces/IRouter.sol";
import "./libs/Path.sol";
import "./libs/SafeMath.sol";
import "./libs/TickMath.sol";
import "./libs/UniswapV2Library.sol";
import "./libs/CallbackValidation.sol";
import "./Storage.sol";

contract DexRouter is Storage, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeMath for uint;
    using Path for bytes;
    using SafeCast for uint256;

    IRouter public aeroV2Router;
    ISwapRouter public aeroV3Router;

    address public factoryV3;
    uint256 public amountInCached;

    // 是否为手续费token
    mapping(address => bool) public isFeeToken;

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
        address _weth,
        address _aeroV2Router,
        address _aeroV3Router
    ) Ownable(msg.sender) {
        admin = msg.sender;
        feeCollector = _feeCollector;
        feeRate = _fee;
        WETH = _weth;
        aeroV2Router = IRouter(_aeroV2Router);
        aeroV3Router = ISwapRouter(_aeroV3Router);
        isFeeToken[WETH] = true;
        amountInCached = type(uint256).max;
    }
    // 收取手续费，并且将手续费发送给手续费收集地址
    // mapping(address => uint256) UserFeeRate 可以考虑设置不同地址的手续费率
    function takeFee(
        address tokenIn,
        uint256 amountIn,
        bool isFeeFromOut
    ) internal returns (uint256) {
        uint256 fee = amountIn.mul(feeRate).div(FEE_DENOMINATOR);
        if (isFeeFromOut) {
            IERC20(tokenIn).safeTransfer(feeCollector, fee);
        } else {
            if (
                (tokenIn == address(0) || tokenIn == WETH) &&
                msg.value >= amountIn &&
                address(this).balance > fee
            ) {
                // 处理原生代币的情况
                (bool success, ) = address(feeCollector).call{value: fee}("");
                require(success, "DexRouter: take fee error");
            } else {
                // 检查 tokenIn 是否授权给合约
                require(
                    IERC20(tokenIn).allowance(msg.sender, address(this)) >=
                        amountIn,
                    "DexRouter: INSUFFICIENT_ALLOWANCE"
                );
                // 处理 ERC20 代币的情况，包括 WETH
                IERC20(tokenIn).safeTransferFrom(msg.sender, feeCollector, fee);
            }
        }

        emit FeeCollected(tokenIn, msg.sender, fee, block.timestamp);

        return fee;
    }

    // V2: Any swap, ExactIn single-hop - SupportingFeeOnTransferTokens
    function swapV2ExactIn(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        address poolAddress
    ) public payable nonReentrant returns (uint256 amountOut) {
        require(poolAddress != address(0), "DexRouter: invalid pool address");
        require(amountIn > 0, "DexRouter: amount_in invalid");

        bool isFeeFromOut = takeFeeFromOut(tokenOut);

        bool nativeIn = false;
        if (tokenIn == address(0)) {
            require(
                msg.value >= amountIn,
                "DexRouter: amount in and value mismatch"
            );
            nativeIn = true;
            tokenIn = WETH;
            // refund
            uint amount = msg.value - amountIn;
            if (amount > 0) {
                (bool success, ) = address(msg.sender).call{value: amount}("");
                require(success, "DexRouter: refund ETH error");
            }
        }

        if (!isFeeFromOut) {
            uint256 fee = takeFee(tokenIn, amountIn, isFeeFromOut);
            amountIn = amountIn - fee;
        }

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

        address to = (nativeOut || isFeeFromOut) ? address(this) : msg.sender;
        pair.swap(amount0Out, amount1Out, to, new bytes(0));

        if (nativeOut || isFeeFromOut) {
            amountOut = IERC20(tokenOut).balanceOf(address(this)).sub(
                balanceBefore
            );
            uint256 fee = takeFee(tokenOut, amountOut, isFeeFromOut);
            amountOut = amountOut - fee;
            if (nativeOut) {
                IWETH(WETH).withdraw(amountOut);
                (bool success, ) = address(msg.sender).call{value: amountOut}(
                    ""
                );
                require(success, "DexRouter: send ETH out error");
            } else {
                IERC20(tokenOut).safeTransfer(msg.sender, amountOut);
            }
        } else {
            amountOut = IERC20(tokenOut).balanceOf(msg.sender).sub(
                balanceBefore
            );
        }
        require(
            amountOut >= amountOutMin,
            "DexRouter: insufficient output amount"
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
        require(amountIn > 0, "DexRouter: amout in is zero");

        uint length = params.path.length;
        bool nativeIn = false;
        bool nativeOut = false;
        address tokenOut = params.path[length - 1];
        if (tokenOut == WETH) {
            nativeOut = true;
        }
        bool isFeeFromOut = takeFeeFromOut(tokenOut);

        if (tokenIn == address(0)) {
            require(
                msg.value >= amountIn,
                "DexRouter: amount in and value mismatch"
            );
            nativeIn = true;
            tokenIn = WETH;
            // refund
            uint amount = msg.value - amountIn;
            if (amount > 0) {
                (bool success, ) = address(msg.sender).call{value: amount}("");
                require(success, "DexRouter: refund ETH error");
            }
        }
        if (!isFeeFromOut) {
            uint256 fee = takeFee(tokenIn, amountIn, isFeeFromOut);
            amountIn = amountIn - fee;
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
            (nativeOut || isFeeFromOut) ? address(this) : params.recipient
        );
        _swapSupportingFeeOnTransferTokens(
            params.path,
            (nativeOut || isFeeFromOut) ? address(this) : params.recipient,
            params.factory
        );
        uint amountOut = IERC20(params.path[length - 1])
            .balanceOf(
                (nativeOut || isFeeFromOut) ? address(this) : params.recipient
            )
            .sub(balanceBefore);
        amounts[length - 1] = amountOut;
        require(
            amountOut >= params.amountOutMin,
            "DexRouter: insufficient output amount"
        );
        if (nativeOut || isFeeFromOut) {
            uint fee = takeFee(tokenOut, amountOut, isFeeFromOut);
            amountOut = amountOut - fee;
            if (nativeOut) {
                IWETH(WETH).withdraw(amountOut);
                (bool success, ) = address(params.recipient).call{
                    value: amountOut
                }("");
                require(success, "DexRouter: send ETH out error");
            } else {
                IERC20(tokenOut).safeTransfer(params.recipient, amountOut);
            }
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
                exactOutputInternal(
                    address(getPool(tokenIn, tokenOut, fee)),
                    amountToPay,
                    msg.sender,
                    0,
                    data
                );
            } else {
                amountInCached = amountToPay;
                tokenIn = tokenOut; // swap in/out because exact output swaps are reversed
                pay(tokenIn, data.payer, msg.sender, amountToPay);
            }
        }
    }

    /// Performs a single exact output swap
    function exactOutputInternal(
        address poolAddress,
        uint256 amountOut,
        address recipient,
        uint160 sqrtPriceLimitX96,
        SwapCallbackData memory data
    ) private returns (uint256 amountIn) {
        // allow swapping to the router address with address 0
        if (recipient == address(0)) recipient = address(this);

        (address tokenOut, address tokenIn, ) = data.path.decodeFirstPool();

        bool zeroForOne = tokenIn < tokenOut;

        (int256 amount0Delta, int256 amount1Delta) = IUniswapV3Pool(poolAddress)
            .swap(
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
        require(params.amountIn > 0, "DexRouter: amount in is zero");

        bool isFeeFromOut = takeFeeFromOut(params.tokenOut);

        if (params.tokenIn == address(0)) {
            params.tokenIn = WETH;
            require(
                msg.value >= params.amountIn,
                "DexRouter: amount in and value mismatch"
            );
            // refund
            uint amount = msg.value - params.amountIn;
            if (amount > 0) {
                (bool success, ) = address(msg.sender).call{value: amount}("");
                require(success, "DexRouter: refund ETH error");
            }
        }

        bool nativeOut = false;
        if (params.tokenOut == WETH) nativeOut = true;

        if (!isFeeFromOut) {
            uint256 fee = takeFee(
                params.tokenIn,
                params.amountIn,
                isFeeFromOut
            );
            params.amountIn = params.amountIn - fee;
        }

        // update factoryV3 globally, so as to pass callback verification
        factoryV3 = params.factoryAddress;
        amountOut = exactInputInternal(
            params.poolAddress,
            params.amountIn,
            (nativeOut || isFeeFromOut) ? address(0) : params.recipient,
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
            "DexRouter: insufficient out amount"
        );

        if (nativeOut || isFeeFromOut) {
            uint fee = takeFee(params.tokenOut, amountOut, isFeeFromOut);
            amountOut = amountOut - fee;
            if (nativeOut) {
                IWETH(WETH).withdraw(amountOut);
                (bool success, ) = address(params.recipient).call{
                    value: amountOut
                }("");
                require(success, "DexRouter: send ETH out error");
            } else {
                IERC20(params.tokenOut).safeTransfer(
                    params.recipient,
                    amountOut
                );
            }
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
        require(params.amountIn > 0, "DexRouter: amount in is zero");
        if (msg.value > 0) {
            require(
                msg.value >= params.amountIn,
                "DexRouter: amount in and value mismatch"
            );
            // refund
            uint amount = msg.value - params.amountIn;
            if (amount > 0) {
                (bool success, ) = address(msg.sender).call{value: amount}("");
                require(success, "DexRouter: refund ETH error");
            }
        }

        (address tokenIn, , ) = params.path.decodeFirstPool();
        if (tokenIn == address(0)) {
            tokenIn = WETH;
        }

        bool isFeeFromOut = takeFeeFromOut(params.tokenOut);
        if (!isFeeFromOut) {
            uint256 fee = takeFee(tokenIn, params.amountIn, isFeeFromOut);
            params.amountIn = params.amountIn - fee;
        }

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
                    : (
                        (params.nativeOut || isFeeFromOut)
                            ? address(this)
                            : params.recipient
                    ),
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
            "DexRouter: too little received"
        );
        if (params.nativeOut || isFeeFromOut) {
            uint fee = takeFee(params.tokenOut, amountOut, isFeeFromOut);
            amountOut = amountOut - fee;

            if (params.nativeOut) {
                IWETH(WETH).withdraw(amountOut);
                (bool success, ) = address(params.recipient).call{
                    value: amountOut
                }("");
                require(success, "DexRouter: send ETH out error");
            } else {
                IERC20(params.tokenOut).safeTransfer(
                    params.recipient,
                    amountOut
                );
            }
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
            IERC20(token).safeTransfer(recipient, value);
            // IERC20(token).transfer(recipient, value);
        } else {
            // pull payment
            IERC20(token).safeTransferFrom(payer, recipient, value);
            // IERC20(token).transferFrom(payer, recipient, value);
        }
    }

    // AMM Swap Functions
    // 非原生代币 Swap 前需要先将 tokenIn 授权给合约
    function AeroV2ExactInput(
        uint256 amountIn,
        uint256 amountOutMin,
        IRouter.Route[] calldata routes,
        address to,
        bool nativeIn,
        bool nativeOut,
        uint256 deadline
    ) external payable checkDeadline(deadline) returns (uint256 amountOut) {
        require(amountIn > 0, "DexRouter: INSUFFICIENT_INPUT_AMOUNT");

        address tokenOut = routes[routes.length - 1].to;
        bool isFeeFromOut = takeFeeFromOut(tokenOut);

        if (!isFeeFromOut) {
            uint256 fee = takeFee(routes[0].from, amountIn, isFeeFromOut);
            amountIn = amountIn - fee;
        }

        // 如果输入为ETH，将收到的ETH转换为WETH
        if (nativeIn) {
            IWETH(WETH).deposit{value: amountIn}();
        } else {
            // 转移 tokenIn 到 该合约
            IERC20(routes[0].from).safeTransferFrom(
                msg.sender,
                address(this),
                amountIn
            );
        }

        // 再 将 tokenIn 授权给router合约
        IERC20(routes[0].from).approve(address(aeroV2Router), amountIn);

        uint256[] memory amounts;
        // 如果输出为ETH，调用swapExactTokensForETH

        amounts = aeroV2Router.swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            routes,
            (nativeOut || isFeeFromOut) ? address(this) : to,
            deadline
        );

        amountOut = amounts[amounts.length - 1];
        require(
            amountOut >= amountOutMin,
            "DexRouter: INSUFFICIENT_OUTPUT_AMOUNT"
        );
        if (nativeOut || isFeeFromOut) {
            uint fee = takeFee(tokenOut, amountOut, isFeeFromOut);
            amountOut = amountOut - fee;

            if (nativeOut) {
                IWETH(WETH).withdraw(amountOut);
                (bool success, ) = address(to).call{value: amountOut}("");
                require(success, "DexRouter: send ETH out error");
            } else {
                IERC20(tokenOut).safeTransfer(to, amountOut);
            }
        }
    }

    // CL Swap Functions
    function AeroV3ExactInputSingle(
        ISwapRouter.ExactInputSingleParams memory params,
        bool nativeIn,
        bool nativeOut
    )
        external
        payable
        checkDeadline(params.deadline)
        returns (uint256 amountOut)
    {
        require(params.amountIn > 0, "DexRouter: INSUFFICIENT_INPUT_AMOUNT");

        bool isFeeFromOut = takeFeeFromOut(params.tokenOut);
        if (!isFeeFromOut) {
            uint256 fee = takeFee(
                params.tokenIn,
                params.amountIn,
                isFeeFromOut
            );
            params.amountIn = params.amountIn - fee;
        }

        // 如果输入为ETH，则先将ETH发送到合约地址,然后转换为WETH
        if (nativeIn) {
            IWETH(WETH).deposit{value: params.amountIn}();
        } else {
            // 转移 tokenIn 到合约
            IERC20(params.tokenIn).transferFrom(
                msg.sender,
                address(this),
                params.amountIn
            );
        }

        // 再 将 tokenIn 授权给V3合约
        IERC20(params.tokenIn).approve(address(aeroV3Router), params.amountIn);

        address recipient = params.recipient;
        // 如果输出为ETH，则先将WETH发送到合约地址,再发送ETH
        if (nativeOut || isFeeFromOut) {
            params.recipient = address(this);
            amountOut = aeroV3Router.exactInputSingle(params);

            uint fee = takeFee(params.tokenOut, amountOut, isFeeFromOut);
            amountOut = amountOut - fee;

            if (nativeOut) {
                IWETH(WETH).withdraw(amountOut);
                (bool success, ) = address(recipient).call{value: amountOut}(
                    ""
                );
                require(success, "DexRouter: send ETH out error");
            } else {
                IERC20(params.tokenOut).safeTransfer(recipient, amountOut);
            }
        } else {
            amountOut = aeroV3Router.exactInputSingle(params);
        }
    }

    function AeroV3ExactInput(
        ISwapRouter.ExactInputParams memory params,
        address tokenIn,
        address tokenOut,
        bool nativeIn,
        bool nativeOut
    )
        external
        payable
        checkDeadline(params.deadline)
        returns (uint256 amountOut)
    {
        require(params.amountIn > 0, "DexRouter: INSUFFICIENT_INPUT_AMOUNT");

        bool isFeeFromOut = takeFeeFromOut(tokenOut);
        if (!isFeeFromOut) {
            uint256 fee = takeFee(tokenIn, params.amountIn, isFeeFromOut);
            params.amountIn = params.amountIn - fee;
        }

        if (nativeIn) {
            IWETH(WETH).deposit{value: params.amountIn}();
        } else {
            // 转移 tokenIn 到合约
            IERC20(tokenIn).transferFrom(
                msg.sender,
                address(this),
                params.amountIn
            );
        }

        // 再 将 tokenIn 授权给V3合约
        IERC20(tokenIn).approve(address(aeroV3Router), params.amountIn);

        address recipient = params.recipient;
        // 如果输出为ETH，则先将WETH发送到合约地址,再发送ETH
        if (nativeOut || isFeeFromOut) {
            params.recipient = address(this);
            amountOut = aeroV3Router.exactInput(params);

            uint fee = takeFee(tokenOut, amountOut, isFeeFromOut);
            amountOut = amountOut - fee;

            if (nativeOut) {
                IWETH(WETH).withdraw(amountOut);
                (bool success, ) = address(recipient).call{value: amountOut}(
                    ""
                );
                require(success, "DexRouter: send ETH out error");
            } else {
                IERC20(tokenOut).safeTransfer(recipient, amountOut);
            }
        } else {
            amountOut = aeroV3Router.exactInput(params);
        }
    }
    // 判断是否从 Out 扣除手续费
    function takeFeeFromOut(address tokenOut) internal view returns (bool) {
        if (tokenOut == address(0) || isFeeToken[tokenOut]) {
            return true;
        }
        return false;
    }

    // 设置手续费收集地址
    function setFeeCollector(address _feeCollector) public onlyOwner {
        feeCollector = _feeCollector;
    }

    // 查询手续费收集地址
    function getFeeCollector() public view returns (address) {
        return feeCollector;
    }

    // 设置手续费率
    function setFeeRate(uint256 _fee) public onlyOwner {
        feeRate = _fee;
    }

    // 获取手续费率
    function getFeeRate() public view returns (uint256) {
        return feeRate;
    }

    // 设置手续费优先币种
    function setFeeTokens(
        address[] calldata tokens,
        bool[] calldata values
    ) external onlyOwner {
        require(tokens.length == values.length, "Invalid input");
        for (uint256 i = 0; i < tokens.length; i++) {
            isFeeToken[tokens[i]] = values[i];
        }
    }

    // 查询手续费优先币种
    function checkIsFeeToken(address token) public view returns (bool) {
        return isFeeToken[token];
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
