// SPDX-License-Identifier: MIT 
pragma solidity >=0.5.0;

/// @title Provides functions for deriving a pool address from the factory, tokens, and the fee
library PoolAddress {
    bytes32 internal constant POOL_INIT_CODE_HASH = 0x6ce8eb472fa82df5469c6ab6d485f17c3ad13c8cd7af59b3d4a8026c5ce0f7e2; // pancakeswap v3 

    /// @notice The identifying key of the pool
    struct PoolKey {
        address token0;
        address token1;
        uint24 fee;
    }

    /// @notice Returns PoolKey: the ordered tokens with the matched fee levels
    /// @param tokenA The first token of a pool, unsorted
    /// @param tokenB The second token of a pool, unsorted
    /// @param fee The fee level of the pool
    /// @return Poolkey The pool details with ordered token0 and token1 assignments
    function getPoolKey(
        address tokenA,
        address tokenB,
        uint24 fee
    ) internal pure returns (PoolKey memory) {
        if (tokenA > tokenB) (tokenA, tokenB) = (tokenB, tokenA);
        return PoolKey({token0: tokenA, token1: tokenB, fee: fee});
    }

    /// @notice Deterministically computes the pool address given the factory and PoolKey
    /// @param factory The Uniswap V3 factory contract address
    /// @param key The PoolKey
    /// @return pool The contract address of the V3 pool
    function computeAddress(address factory, PoolKey memory key) internal pure returns (address pool) {
        require(key.token0 < key.token1);
        if (factory == address(0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865)) {
            // pancakeswap v3(mainnet) 
            bytes32 pubKey = 
                keccak256(
                    abi.encodePacked(
                        hex'ff',
                        factory,
                        keccak256(abi.encode(key.token0, key.token1, key.fee)),
                        hex'6ce8eb472fa82df5469c6ab6d485f17c3ad13c8cd7af59b3d4a8026c5ce0f7e2' 
                    )
                );
            // bytes32 to address:
            assembly {
                mstore(0x0, pubKey)
                pool := mload(0x0)
            }
        } else if (factory == address(0x33128a8fC17869897dcE68Ed026d694621f6FDfD)) {
            // uniswap v3(mainnet) 
            bytes32 pubKey = 
                keccak256(
                    abi.encodePacked(
                        hex'ff',
                        factory,
                        keccak256(abi.encode(key.token0, key.token1, key.fee)),
                        hex'e34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54' 
                    )
                );
            // bytes32 to address:
            assembly {
                mstore(0x0, pubKey)
                pool := mload(0x0)
            }
        } else if (factory == address(0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865)) {
            // sushiswap v3(mainnet) 
            bytes32 pubKey = 
                keccak256(
                    abi.encodePacked(
                        hex'ff',
                        factory,
                        keccak256(abi.encode(key.token0, key.token1, key.fee)),
                        hex'e34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54' 
                    )
                );
            // bytes32 to address:
            assembly {
                mstore(0x0, pubKey)
                pool := mload(0x0)
            }
        } 
    }
}