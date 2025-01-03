// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

import "./interfaces/ISwapRouter.sol";
import "./interfaces/IRouter.sol";
import "./interfaces/IWETH.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./libs/SafeMath.sol";

contract AeroDex is Ownable {
    using SafeERC20 for IERC20;
    using SafeMath for uint;

    // CL Router
    ISwapRouter public v3Router;
    // Amm Router
    IRouter public v2Router;

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

    constructor(
        address _v3Router,
        address _v2Router,
        address _WETH,
        uint256 _feeRate
    ) Ownable(msg.sender) {
        v3Router = ISwapRouter(_v3Router);
        v2Router = IRouter(_v2Router);
        WETH = _WETH;
        feeRate = _feeRate;
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
    ) external payable checkDeadline(deadline) returns (uint256) {
        require(amountIn > 0, "AeroDex: INSUFFICIENT_INPUT_AMOUNT");

        // 收取手续费
        uint256 fee = takeFee(routes[0].from, amountIn);
        amountIn = amountIn - fee;

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
        IERC20(routes[0].from).approve(address(v2Router), amountIn);

        uint256[] memory amounts;
        // 如果输出为ETH，调用swapExactTokensForETH
        if (nativeOut) {
            amounts = v2Router.swapExactTokensForETH(
                amountIn,
                amountOutMin,
                routes,
                to,
                deadline
            );
        } else {
            amounts = v2Router.swapExactTokensForTokens(
                amountIn,
                amountOutMin,
                routes,
                to,
                deadline
            );
        }
        return amounts[amounts.length - 1];
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
        require(params.amountIn > 0, "AeroDex: INSUFFICIENT_INPUT_AMOUNT");

        // 收取手续费
        uint256 fee = takeFee(params.tokenIn, params.amountIn);
        params.amountIn = params.amountIn - fee;

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
        IERC20(params.tokenIn).approve(address(v3Router), params.amountIn);

        uint256 amount;
        address recipient = params.recipient;
        // 如果输出为ETH，则先将WETH发送到合约地址,再发送ETH
        if (nativeOut) {
            params.recipient = address(this);
            amount = v3Router.exactInputSingle(params);

            // 将WETH发送到recipient
            IWETH(WETH).withdraw(amount);
            (bool success, ) = payable(recipient).call{value: amount}("");
            require(success, "AeroDex: ETH_TRANSFER_FAILED");
        } else {
            amount = v3Router.exactInputSingle(params);
        }
        return amount;
    }

    function AeroV3ExactInput(
        ISwapRouter.ExactInputParams memory params,
        address tokenIn,
        bool nativeIn,
        bool nativeOut
    )
        external
        payable
        checkDeadline(params.deadline)
        returns (uint256 amountOut)
    {
        require(params.amountIn > 0, "AeroDex: INSUFFICIENT_INPUT_AMOUNT");

        // 收取手续费
        uint256 fee = takeFee(tokenIn, params.amountIn);
        params.amountIn = params.amountIn - fee;

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
        IERC20(tokenIn).approve(address(v3Router), params.amountIn);

        uint256 amount;
        address recipient = params.recipient;
        // 如果输出为ETH，则先将WETH发送到合约地址,再发送ETH
        if (nativeOut) {
            params.recipient = address(this);
            amount = v3Router.exactInput(params);
            // 将WETH发送到recipient
            IWETH(WETH).withdraw(amount);
            (bool success, ) = payable(recipient).call{value: amount}("");
            require(success, "AeroDex: ETH_TRANSFER_FAILED");
        } else {
            amount = v3Router.exactInput(params);
        }
        return amount;
    }

    // 收取手续费，并且将手续费发送给手续费收集地址
    // mapping(address => uint256) UserFeeRate 可以考虑设置不同地址的手续费率
    function takeFee(
        address tokenIn,
        uint256 amountIn
    ) internal returns (uint256) {
        uint256 fee = amountIn.mul(feeRate).div(FEE_DENOMINATOR);

        if (
            tokenIn == WETH &&
            msg.value >= amountIn &&
            address(this).balance > fee
        ) {
            tokenIn = address(0);
            // 处理原生代币的情况
            (bool success, ) = address(feeCollector).call{value: fee}("");
            require(success, "SwapFee: take fee error");
        } else {
            // 检查 tokenIn 是否授权给合约
            require(
                IERC20(tokenIn).allowance(msg.sender, address(this)) >=
                    amountIn,
                "AeroDex: INSUFFICIENT_ALLOWANCE"
            );
            // 处理 ERC20 代币的情况，包括 WETH
            IERC20(tokenIn).safeTransferFrom(msg.sender, feeCollector, fee);
        }

        emit FeeCollected(tokenIn, msg.sender, fee, block.timestamp);

        return fee;
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
