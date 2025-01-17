// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IUniversalRouter.sol";
import "./interfaces/IWETH.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./libs/SafeMath.sol";

/// @notice Thrown when executing commands with an expired deadline
error TransactionDeadlinePassed();

contract UniversalRouter is Ownable, ReentrancyGuard {
    using SafeMath for uint;

    using SafeERC20 for IERC20;
    address public feeCollector;

    address public immutable WETH;
    // 手续费率 如需为 1% 则设置为 10000
    uint256 private feeRate;

    // 手续费分母
    uint256 private immutable FEE_DENOMINATOR = 1000000;

    event FeeCollected(
        address indexed token,
        address indexed payer,
        uint256 amount,
        uint256 timestamp
    );

    event Withdraw(address token, address to, uint256 amount);

    constructor(
        address _feeCollector,
        address _WETH,
        uint256 _feeRate
    ) Ownable(msg.sender) {
        WETH = _WETH;
        feeCollector = _feeCollector;
        feeRate = _feeRate;
    }
    modifier checkDeadline(uint256 deadline) {
        if (block.timestamp > deadline) revert TransactionDeadlinePassed();
        _;
    }

    struct UniversalParams {
        address universalRouter;
        address tokenIn;
        address tokenOut;
        uint256 amountInWithFee;
        uint256 amountIn;
        uint256 amountOutMin;
    }

    function execute(
        UniversalParams memory params,
        bytes calldata commands,
        bytes[] calldata inputs,
        uint256 deadline
    ) external payable checkDeadline(deadline) nonReentrant {
        require(
            params.amountIn > 0,
            "UniversalRouter: amountIn must be greater than 0"
        );
        require(
            params.amountInWithFee - params.amountIn >= 0,
            "UniversalRouter: amountInWithFee must be greater than amountIn"
        );

        uint256 fee = params.amountInWithFee - params.amountIn;

        if (params.tokenIn == address(0)) {
            require(
                msg.value == params.amountInWithFee,
                "UniversalRouter: msg.value must be equal to amountInWithFee"
            );
            params.tokenIn = WETH;
            // 将 ETH 转换为 WETH
            IWETH(WETH).deposit{value: params.amountIn}();

            // 将 手续费 转给 feeCollector;
            (bool success, ) = address(feeCollector).call{value: fee}("");
            require(success, "UniversalRouter: take fee error");
            emit FeeCollected(address(0), msg.sender, fee, block.timestamp);
        } else {
            // 先把所有钱都 转到 合约中
            IERC20(params.tokenIn).transferFrom(
                msg.sender,
                address(this),
                params.amountInWithFee
            );
            if (fee > 0) {
                // 把手续费转给 feeCollector;
                IERC20(params.tokenIn).safeTransfer(feeCollector, fee);
                emit FeeCollected(
                    params.tokenIn,
                    msg.sender,
                    fee,
                    block.timestamp
                );
            }
        }
        // 记录 兑换前 余额
        uint256 balanceBefore = params.tokenOut == address(0)
            ? IERC20(WETH).balanceOf(address(this))
            : IERC20(params.tokenOut).balanceOf(address(this));

        // 授权给 universalRouter
        // IERC20(params.tokenIn).approve(params.approveTo, params.amountIn);
        // 将 钱 转入 universalRouter
        IERC20(params.tokenIn).safeTransfer(
            params.universalRouter,
            params.amountIn
        );

        IUniversalRouter(params.universalRouter).execute(
            commands,
            inputs,
            deadline
        );
        uint256 balanceAfter = params.tokenOut == address(0)
            ? IERC20(WETH).balanceOf(address(this))
            : IERC20(params.tokenOut).balanceOf(address(this));

        uint256 amountOut = balanceAfter - balanceBefore;

        if (params.tokenOut == address(0)) {
            require(
                amountOut >= params.amountOutMin,
                "UniversalRouter: insufficient output amount"
            );
            // 将WETH 转为ETH
            IWETH(WETH).withdraw(amountOut);
            fee = amountOut.mul(feeRate).div(FEE_DENOMINATOR);

            // 将 手续费 转给 feeCollector;
            (bool success, ) = address(feeCollector).call{value: fee}("");
            require(success, "UniversalRouter: take fee error");
            emit FeeCollected(address(0), msg.sender, fee, block.timestamp);

            // 将 余额 转给 msg.sender
            (success, ) = msg.sender.call{value: amountOut - fee}("");
            require(success, "UniversalRouter: swap failed");
        }
        if (fee == 0) {
            require(
                amountOut >= params.amountOutMin,
                "UniversalRouter: insufficient output amount"
            );
            // 计算手续费
            fee = amountOut.mul(feeRate).div(FEE_DENOMINATOR);
            // 将 手续费 转给 feeCollector;
            bool success = IERC20(params.tokenOut).transfer(feeCollector, fee);
            require(success, "UniversalRouter: take fee error");
            emit FeeCollected(
                params.tokenOut,
                msg.sender,
                fee,
                block.timestamp
            );

            // 将 余额 转给 msg.sender
            success = IERC20(params.tokenOut).transfer(
                msg.sender,
                amountOut - fee
            );
            require(success, "UniversalRouter: swap failed");
        }
    }

    // withdrawAny 避免有代币被锁定在合约中
    function withdrawAny(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner nonReentrant {
        if (to == address(0)) {
            to = feeCollector; // 默认提取到手续费收集地址
        }
        if (token == address(0)) {
            require(
                address(this).balance >= amount,
                "UniversalRouter: insufficient balance"
            );
            (bool success, bytes memory data) = payable(to).call{value: amount}(
                ""
            );
            require(success, string(data));
        } else {
            require(
                IERC20(token).balanceOf(address(this)) >= amount,
                "UniversalRouter: insufficient balance"
            );
            SafeERC20.safeTransfer(IERC20(token), to, amount);
        }
        emit Withdraw(token, to, amount);
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

    /// @notice To receive ETH
    receive() external payable {}
}
