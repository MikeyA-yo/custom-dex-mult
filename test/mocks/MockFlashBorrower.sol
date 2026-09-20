// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../../src/interfaces/IDexCallee.sol";
import "../../src/interfaces/IDexPair.sol";
import "../../src/interfaces/IERC20.sol";

/// @title MockFlashBorrower — Test contract for flash swap functionality
contract MockFlashBorrower is IDexCallee {
    address public pair;
    address public tokenToBorrow;
    bool public shouldRepay;

    constructor(address _pair, bool _shouldRepay) {
        pair = _pair;
        shouldRepay = _shouldRepay;
    }

    function initFlashSwap(address _token, uint256 amount) external {
        tokenToBorrow = _token;
        address token0 = IDexPair(pair).token0();
        address token1 = IDexPair(pair).token1();

        uint256 amount0Out = _token == token0 ? amount : 0;
        uint256 amount1Out = _token == token1 ? amount : 0;

        // Initiate flash swap
        IDexPair(pair).swap(amount0Out, amount1Out, address(this), abi.encode("flash"));
    }

    function dexCall(address, uint256 amount0, uint256 amount1, bytes calldata) external override {
        if (shouldRepay) {
            // Calculate the repayment amount (amount + 0.3% fee, rounded up)
            uint256 amountBorrowed = amount0 > 0 ? amount0 : amount1;
            uint256 fee = (amountBorrowed * 3) / 997 + 1;
            uint256 amountToRepay = amountBorrowed + fee;

            // Transfer repayment back to pair
            IERC20(tokenToBorrow).transfer(msg.sender, amountToRepay);
        }
        // If shouldRepay is false, don't repay — the swap should revert
    }

    // Allow this contract to receive tokens
    receive() external payable {}
}
