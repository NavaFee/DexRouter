// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0;

import "./contracts-upgradeable/security/PausableUpgradeable.sol";
import "./contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "./contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "./contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./contracts-upgradeable/proxy/utils/Initializable.sol";
import "./utils/SafeMath.sol";
import "./libs/Path.sol";
import "./libs/TickMath.sol";
import "./libs/SafeCast.sol";
import "./libs/UniswapV2Library.sol";
import "./libs/CallbackValidation.sol";
import "./interfaces/IUniswapV2Pair.sol";
import "./interfaces/IUniswapV3Pool.sol";
import "./interfaces/IUniswapV3SwapCallback.sol";
import "./interfaces/IBlastPoints.sol";
import "./Storage.sol";
import "./interfaces/IWETH.sol";

contract SwapX is
    Storage,
    IUniswapV3SwapCallback,
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeMath for uint;
    using Path for bytes;
    using SafeCast for uint256;

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

    function initialize(
        address _factoryV2,
        address _factoryV3,
        address _WETH,
        address _feeCollector,
        uint256 _feeRate
    ) public initializer {
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __Pausable_init();

        factoryV2 = _factoryV2;
        factoryV3 = _factoryV3;
        feeCollector = _feeCollector;
        feeRate = _feeRate;
        feeDenominator = 10000;
        WETH = _WETH;
        amountInCached = type(uint256).max;
    }

    // take fee
    function takeFee(
        address tokenIn,
        uint256 amountIn
    ) internal returns (uint256) {
        if (feeExcludeList[msg.sender]) return 0;

        uint256 fee = amountIn.mul(feeRate).div(feeDenominator);

        if (
            (tokenIn == address(0) || tokenIn == WETH) &&
            address(this).balance > fee
        ) {
            (bool success, ) = address(feeCollector).call{value: fee}("");
            require(success, "SwapX: take fee error");
        } else
            IERC20Upgradeable(tokenIn).safeTransferFrom(
                msg.sender,
                feeCollector,
                fee
            );

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
    ) public payable nonReentrant whenNotPaused returns (uint amountOut) {
        require(poolAddress != address(0), "SwapX: invalid pool address");
        require(amountIn > 0, "SwapX: amout in is zero");

        bool nativeIn = false;
        if (tokenIn == address(0)) {
            require(
                msg.value >= amountIn,
                "SwapX: amount in and value mismatch"
            );
            nativeIn = true;
            tokenIn = WETH;
            // refund
            uint amount = msg.value - amountIn;
            if (amount > 0) {
                (bool success, ) = address(msg.sender).call{value: amount}("");
                require(success, "SwapX: refund ETH error");
            }
            uint256 fee = takeFee(address(0), amountIn);
            amountIn = amountIn - fee;
        }

        if (nativeIn) {
            pay(tokenIn, address(this), poolAddress, amountIn);
        } else pay(tokenIn, msg.sender, poolAddress, amountIn);

        bool nativeOut = false;
        if (tokenOut == address(0)) nativeOut = true;

        uint balanceBefore = nativeOut
            ? IERC20Upgradeable(WETH).balanceOf(address(this))
            : IERC20Upgradeable(tokenOut).balanceOf(msg.sender);

        IUniswapV2Pair pair = IUniswapV2Pair(poolAddress);
        address token0 = pair.token0();
        uint amountInput;
        uint amountOutput;
        {
            // scope to avoid stack too deep errors
            (uint reserve0, uint reserve1, ) = pair.getReserves();
            (uint reserveInput, uint reserveOutput) = tokenIn == token0
                ? (reserve0, reserve1)
                : (reserve1, reserve0);
            amountInput = IERC20Upgradeable(tokenIn)
                .balanceOf(address(pair))
                .sub(reserveInput);
            amountOutput = UniswapV2Library.getAmountOut(
                amountInput,
                reserveInput,
                reserveOutput,
                10
            );
        }
        (uint amount0Out, uint amount1Out) = tokenIn == token0
            ? (uint(0), amountOutput)
            : (amountOutput, uint(0));
        address to = nativeOut ? address(this) : msg.sender;
        pair.swap(amount0Out, amount1Out, to, new bytes(0));

        if (nativeOut) {
            amountOut = IERC20Upgradeable(WETH).balanceOf(address(this)).sub(
                balanceBefore
            );
            IWETH(WETH).withdraw(amountOut);
            uint256 fee = takeFee(address(0), amountOut);
            (bool success, ) = address(msg.sender).call{value: amountOut - fee}(
                ""
            );
            require(success, "SwapX: send ETH out error");
        } else {
            amountOut = IERC20Upgradeable(tokenOut).balanceOf(msg.sender).sub(
                balanceBefore
            );
        }
        require(amountOut >= amountOutMin, "SwapX: insufficient output amount");
    }

    // **** SWAP ****
    // requires the initial amount to have already been sent to the first pair
    function _swap(
        uint[] memory amounts,
        address[] memory path,
        address _to,
        address _factory
    ) internal virtual {
        for (uint i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0, ) = UniswapV2Library.sortTokens(input, output);
            uint amountOut = amounts[i + 1];
            (uint amount0Out, uint amount1Out) = input == token0
                ? (uint(0), amountOut)
                : (amountOut, uint(0));
            address to = i < path.length - 2
                ? UniswapV2Library.pairFor(_factory, output, path[i + 2])
                : _to;
            IUniswapV2Pair(UniswapV2Library.pairFor(_factory, input, output))
                .swap(amount0Out, amount1Out, to, new bytes(0));
        }
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
            (address token0, ) = UniswapV2Library.sortTokens(input, output);
            IUniswapV2Pair pair = IUniswapV2Pair(
                UniswapV2Library.pairFor(_factory, input, output)
            );
            uint amountInput;
            uint amountOutput;
            {
                // scope to avoid stack too deep errors
                (uint reserve0, uint reserve1, ) = pair.getReserves();
                (uint reserveInput, uint reserveOutput) = input == token0
                    ? (reserve0, reserve1)
                    : (reserve1, reserve0);
                amountInput = IERC20Upgradeable(input)
                    .balanceOf(address(pair))
                    .sub(reserveInput);
                amountOutput = UniswapV2Library.getAmountOut(
                    amountInput,
                    reserveInput,
                    reserveOutput,
                    10
                );
            }
            (uint amount0Out, uint amount1Out) = input == token0
                ? (uint(0), amountOutput)
                : (amountOutput, uint(0));
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
        uint256 amountOutMin,
        address[] calldata path,
        address recipient,
        uint deadline,
        address factory
    )
        public
        payable
        nonReentrant
        whenNotPaused
        checkDeadline(deadline)
        returns (uint[] memory amounts)
    {
        require(amountIn > 0, "SwapX: amout in is zero");

        bool nativeIn = false;
        if (tokenIn == address(0)) {
            require(
                msg.value >= amountIn,
                "SwapX: amount in and value mismatch"
            );
            nativeIn = true;
            tokenIn = WETH;
            // refund
            uint amount = msg.value - amountIn;
            if (amount > 0) {
                (bool success, ) = address(msg.sender).call{value: amount}("");
                require(success, "SwapX: refund ETH error");
            }
        }

        bool nativeOut = false;
        address tokenOut = path[path.length - 1];
        if (tokenOut == WETH) {
            nativeOut = true;
        }

        if (!nativeOut) {
            uint256 fee = takeFee(tokenIn, amountIn);
            amountIn = amountIn - fee;
        }

        address firstPool = UniswapV2Library.pairFor(factory, path[0], path[1]);
        if (nativeIn) {
            pay(tokenIn, address(this), firstPool, amountIn);
        } else pay(tokenIn, msg.sender, firstPool, amountIn);
        require(tokenIn == path[0], "invalid path");

        amounts = UniswapV2Library.getAmountsOut(factory, amountIn, path);

        uint balanceBefore = IERC20Upgradeable(path[path.length - 1]).balanceOf(
            nativeOut ? address(this) : recipient
        );
        _swapSupportingFeeOnTransferTokens(
            path,
            nativeOut ? address(this) : recipient,
            factory
        );
        uint amountOut = IERC20Upgradeable(path[path.length - 1])
            .balanceOf(nativeOut ? address(this) : recipient)
            .sub(balanceBefore);
        amounts[path.length - 1] = amountOut;
        require(amountOut >= amountOutMin, "SwapX: insufficient output amount");
        if (nativeOut) {
            IWETH(WETH).withdraw(amountOut);
            uint256 fee = takeFee(address(0), amountOut);
            (bool success, ) = address(recipient).call{value: amountOut - fee}(
                ""
            );
            require(success, "SwapX: send ETH out error");
        }
    }

    /// UniswapV3SwapCallback
    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata _data
    ) external override {
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

    // V3: ExactIn single-hop
    function swapV3ExactIn(
        ExactInputSingleParams memory params
    )
        external
        payable
        nonReentrant
        whenNotPaused
        checkDeadline(params.deadline)
        returns (uint256 amountOut)
    {
        require(params.amountIn > 0, "SwapX: amount in is zero");

        if (params.tokenIn == WETH || params.tokenIn == address(0)) {
            params.tokenIn = WETH;
            require(
                msg.value >= params.amountIn,
                "SwapX: amount in and value mismatch"
            );
            // refund
            uint amount = msg.value - params.amountIn;
            if (amount > 0) {
                (bool success, ) = address(msg.sender).call{value: amount}("");
                require(success, "SwapX: refund ETH error");
            }
        }

        bool nativeOut = false;
        if (params.tokenOut == WETH) nativeOut = true;

        if (!nativeOut) {
            uint256 fee = takeFee(params.tokenIn, params.amountIn);
            params.amountIn = params.amountIn - fee;
        }

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
            "SwapX: insufficient out amount"
        );

        if (nativeOut) {
            IWETH(WETH).withdraw(amountOut);
            uint256 fee = takeFee(address(0), amountOut);
            (bool success, ) = address(params.recipient).call{
                value: amountOut - fee
            }("");
            require(success, "SwapX: send ETH out error");
        }
    }

    // V3-V3: ExactIn multi-hop
    function swapV3MultiHopExactIn(
        ExactInputParams memory params
    )
        public
        payable
        nonReentrant
        whenNotPaused
        checkDeadline(params.deadline)
        returns (uint256 amountOut)
    {
        require(params.amountIn > 0, "SwapX: amount in is zero");
        if (msg.value > 0) {
            require(
                msg.value >= params.amountIn,
                "SwapX: amount in and value mismatch"
            );
            // refund
            uint amount = msg.value - params.amountIn;
            if (amount > 0) {
                (bool success, ) = address(msg.sender).call{value: amount}("");
                require(success, "SwapX: refund ETH error");
            }
        }

        (address tokenIn, , ) = params.path.decodeFirstPool();
        if (tokenIn == WETH || tokenIn == address(0)) {
            tokenIn = WETH;
            uint256 fee = takeFee(address(0), params.amountIn);
            params.amountIn = params.amountIn - fee;
        }

        address payer = msg.sender; // msg.sender pays for the first hop

        bool nativeOut = false;

        uint i = 0;
        while (true) {
            bool hasMultiplePools = params.path.hasMultiplePools();

            if (!hasMultiplePools) {
                (, address tokenOut, ) = params.path.decodeFirstPool();
                if (tokenOut == WETH) nativeOut = true;
            }
            // the outputs of prior swaps become the inputs to subsequent ones
            factoryV3 = params.factoryAddresses[i];
            params.amountIn = exactInputInternal(
                params.poolAddresses[i],
                params.amountIn,
                hasMultiplePools
                    ? address(this)
                    : (nativeOut ? address(this) : params.recipient),
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
            "SwapX: too little received"
        );
        if (nativeOut) {
            IWETH(WETH).withdraw(amountOut);
            uint256 fee = takeFee(address(0), amountOut);
            (bool success, ) = address(params.recipient).call{
                value: amountOut - fee
            }("");
            require(success, "SwapX: send ETH out error");
        }
    }


    // Mixed: ExactOut multi-hop
    /*
    function swapMixedMultiHopExactOut(
        ExactOutputMixedParams memory params
    ) external payable nonReentrant whenNotPaused checkDeadline(params.deadline) returns (uint256 amountIn) {

        require(params.amountInMaximum > 0, "SwapX: amount in max is zero");
        if (msg.value > 0)
            require(msg.value >= params.amountInMaximum, "SwapX: amount in max and value mismatch");

        (address tokenIn, address tokenOut1,) = params.path1.decodeFirstPool();
        (, address tokenOut,) = params.path2.decodeFirstPool();

        bool nativeIn = tokenIn == WETH || tokenIn == address(0);
        bool nativeOut = tokenOut == WETH || tokenIn == address(0);

        if (isStrEqual(params.routes[0], "v2") && isStrEqual(params.routes[1], "v2")) {
            // uni - sushi, or verse
            address poolAddress1 = UniswapV2Library.pairFor(params.factory1, tokenIn, tokenOut1);

            address poolAddress2 = UniswapV2Library.pairFor(params.factory2, tokenOut1, tokenOut);
            address[] memory path2 = new address[](2);
            path2[0] = tokenOut1;
            path2[1] = tokenOut;
            uint[] memory amounts2 = UniswapV2Library.getAmountsIn(params.factory2, params.amountOut, path2);

            address[] memory path1 = new address[](2);
            path1[0] = tokenIn;
            path1[1] = tokenOut1;
            uint[] memory amounts1 = UniswapV2Library.getAmountsIn(params.factory1, amounts2[0], path1);
            amountIn = amounts1[0];

            if (nativeIn) {
                pay(tokenIn, address(this), poolAddress1, amountIn);
            } else
                pay(tokenIn, msg.sender, poolAddress1, amountIn);

            uint256 balanceBefore = IERC20Upgradeable(tokenOut).balanceOf(nativeOut ? address(this) : params.recipient);
            _swap(amounts1, path1, poolAddress2, params.factory1);

            _swap(amounts2, path2, nativeOut ? address(this) : params.recipient, params.factory2);
            uint256 amountOut = IERC20Upgradeable(tokenOut).balanceOf(nativeOut ? address(this) : params.recipient).sub(balanceBefore);
            if (nativeOut) {
                IWETH(WETH).withdraw(amountOut);
                uint256 fee = takeFee(address(0), amountOut);
                (bool success, ) = address(params.recipient).call{value: amountOut-fee}("");
                require(success, "SwapX: send ETH out error");
            }

        } else if (isStrEqual(params.routes[0], "v2") && isStrEqual(params.routes[1], "v3")) {
            // NOTE: v3 not support fee-on-transfer token, so the mid-token amountIn is exactly same as params.amountIn2 
            // v3 path bytes is reversed
            (tokenOut, ,) = params.path2.decodeFirstPool();

            uint256 balanceBefore = IERC20Upgradeable(tokenOut).balanceOf(nativeOut ? address(this) : params.recipient);
            address poolAddress1 = params.poolAddress1; //UniswapV2Library.pairFor(params.factory1, tokenIn, tokenOut1);
            address[] memory path1 = new address[](2);
            path1[0] = tokenIn;
            path1[1] = tokenOut1;
            uint[] memory amounts1 = UniswapV2Library.getAmountsIn(params.factory1, params.amountIn2, path1);
            amountIn = amounts1[0];
            if (nativeIn) {
                pay(tokenIn, address(this), poolAddress1, amountIn);
            } else
                pay(tokenIn, msg.sender, poolAddress1, amountIn);

            _swap(amounts1, path1, address(this), params.factory1);

            factoryV3 = params.factory2;
            uint amountIn2 = exactOutputInternal(
                params.poolAddress2,
                params.amountOut,
                params.recipient,
                0,
                SwapCallbackData({path: params.path2, payer: address(this)})
            );
            require(amountIn2 == params.amountIn2, "SwapX: not support fee-on-transfer token for V3");

            uint256 amountOut = IERC20Upgradeable(tokenOut).balanceOf(nativeOut ? address(this) : params.recipient).sub(balanceBefore);
            if (nativeOut) {
                IWETH(WETH).withdraw(amountOut);
                uint256 fee = takeFee(address(0), amountOut);
                (bool success, ) = address(params.recipient).call{value: amountOut-fee}("");
                require(success, "SwapX: send ETH out error");
            }

        } else if (isStrEqual(params.routes[0], "v3") && isStrEqual(params.routes[1], "v2")) {

            (tokenOut1, tokenIn,) = params.path1.decodeFirstPool();

            address[] memory path2 = new address[](2); 
            path2[0] = tokenOut1;
            path2[1] = tokenOut;
            address poolAddress2 = params.poolAddress2; //UniswapV2Library.pairFor(params.factory2, tokenOut1, tokenOut);
            uint[] memory amounts2 = UniswapV2Library.getAmountsIn(params.factory2, params.amountOut, path2);
            uint amountIn2 = amounts2[0];

            uint256 balanceBefore = IERC20Upgradeable(tokenOut).balanceOf(nativeOut ? address(this) : params.recipient);

            factoryV3 = params.factory1;
            amountIn = exactOutputInternal(
                params.poolAddress1,
                amountIn2,
                poolAddress2,
                0,
                SwapCallbackData({path: params.path1, payer: msg.sender})
            );

            _swap(amounts2, path2, params.recipient, params.factory2);
            uint256 amountOut = IERC20Upgradeable(tokenOut).balanceOf(nativeOut ? address(this) : params.recipient).sub(balanceBefore);
            if (nativeOut) {
                IWETH(WETH).withdraw(amountOut);
                uint256 fee = takeFee(address(0), amountOut);
                (bool success, ) = address(params.recipient).call{value: amountOut-fee}("");
                require(success, "SwapX: send ETH out error");
            }
        } 


        uint256 fee = 0;
        if (nativeIn) {
            fee = takeFee(address(0), amountIn);
            amountIn = amountIn - fee;
            require(amountIn + fee <= params.amountInMaximum, "SwapX: too much requested");

            if (msg.value > 0) {
              uint amount = msg.value - amountIn - fee;
              // refund
              if (amount > 0) {
                  (bool success, ) = address(msg.sender).call{value: amount}("");
                  require(success, "SwapX: refund ETH error");
              }
            }
        } else {
            fee = takeFee(tokenIn, amountIn);
            require(amountIn + fee <= params.amountInMaximum, "SwapX: too much requested");
        }
    }
    */

    // V2: compute pair address
    function getPair(
        address factory,
        address tokenA,
        address tokenB
    ) public pure returns (address) {
        return UniswapV2Library.pairFor(factory, tokenA, tokenB);
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

    /// V3: Performs a single exact input swap
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

    function pay(
        address token,
        address payer,
        address recipient,
        uint256 value
    ) internal {
        if (token == WETH && address(this).balance >= value) {
            // pay with WETH
            IWETH(WETH).deposit{value: value}(); // wrap only what is needed to pay
            IWETH(WETH).transfer(recipient, value);
        } else if (payer == address(this)) {
            // pay with tokens already in the contract (for the exact input multihop case)
            //IERC20Upgradeable(token).safeTransfer(recipient, value);
            IERC20Upgradeable(token).transfer(recipient, value);
        } else {
            // pull payment
            //IERC20Upgradeable(token).safeTransferFrom(payer, recipient, value);
            IERC20Upgradeable(token).transferFrom(payer, recipient, value);
        }
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
