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

    struct ExactInputMixedParams {
        string[] routes;
        bytes path1;
        address factory1;
        address poolAddress1;
        bytes path2;
        address factory2;
        address poolAddress2;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    struct SwapCallbackData {
        bytes path;
        address payer;
    }
}
