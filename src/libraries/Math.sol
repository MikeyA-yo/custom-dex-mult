// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Math library for DEX
/// @notice Provides basic math utilities
library Math {
    function min(uint256 x, uint256 y) internal pure returns (uint256 z) {
        z = x < y ? x : y;
    }

    /// @notice Babylonian method for computing the square root
    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}
