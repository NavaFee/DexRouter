// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
pragma abicoder v2;

contract Storage {
    struct V2ExactInMultiHopParams {
        address factory;
        uint256 amountOutMin;
        address[] path;
        address recipient;
        uint deadline;
    }

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

    struct ExactInputParams {
        address[] factoryAddresses;
        address[] poolAddresses;
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        bool nativeOut;
    }

    struct SwapCallbackData {
        bytes path;
        address payer;
    }
}
