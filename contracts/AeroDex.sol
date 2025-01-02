// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

import "./interfaces/ISwapRouter.sol";
import "./interfaces/IRouter.sol";
import "./AeroDexStorage.sol";
import "./interfaces/IWETH.sol";

contract AeroDex is AeroDexStorage {
    // CL Router
    ISwapRouter public swapRouter;
    // Amm Router
    IRouter public router;

    // WETH
    address private immutable WETH;

    constructor(address _swapRouter, address _router, address _WETH) {
        swapRouter = ISwapRouter(_swapRouter);
        router = IRouter(_router);
        WETH = _WETH;
    }
    // AMM Swap Functions
    function v2SwapExactInput(
        uint256 amountIn,
        uint256 amountOutMin,
        Route[] calldata routes,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountOut) {
        // 判断输入是否为ETH
        require(amountIn > 0, "AeroDex: INSUFFICIENT_INPUT_AMOUNT");

        // 判断输出是否为ETH
    }

    // CL Swap Functions

    function CLSwapExactInputSingle(
        ISwapRouter.ExactInputSingleParams memory params
    ) external payable returns (uint256 amountOut) {
        return swapRouter.exactInputSingle(params);
    }

    function CLSwapExactInput(
        ISwapRouter.ExactInputParams memory params
    ) external payable returns (uint256 amountOut) {
        return swapRouter.exactInput(params);
    }
}
