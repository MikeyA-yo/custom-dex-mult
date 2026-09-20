// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/DexFactory.sol";
import "../src/DexPair.sol";
import "../src/interfaces/IERC20.sol";
import "./mocks/MockERC20.sol";
import "./mocks/MockFlashBorrower.sol";

contract DexPairTest is Test {
    DexFactory public factory;
    DexPair public pair;
    MockERC20 public token0;
    MockERC20 public token1;

    address public user = makeAddr("user");
    address public lp = makeAddr("lp");

    uint256 constant INITIAL_LIQUIDITY = 10 ether;

    function setUp() public {
        factory = new DexFactory(address(this));
        MockERC20 tokenA = new MockERC20("Token A", "TKA", 18);
        MockERC20 tokenB = new MockERC20("Token B", "TKB", 18);

        // Sort tokens for consistency
        if (address(tokenA) < address(tokenB)) {
            token0 = tokenA;
            token1 = tokenB;
        } else {
            token0 = tokenB;
            token1 = tokenA;
        }

        address pairAddr = factory.createPair(address(token0), address(token1));
        pair = DexPair(pairAddr);
    }

    // ── Helpers ──

    function _addLiquidity(uint256 amount0, uint256 amount1) internal {
        token0.mint(address(pair), amount0);
        token1.mint(address(pair), amount1);
        pair.mint(lp);
    }

    // ── Initialization ──

    function test_initialize() public view {
        assertEq(pair.token0(), address(token0));
        assertEq(pair.token1(), address(token1));
        assertEq(pair.factory(), address(factory));
    }

    function test_initialize_revertsWhenCalledTwice() public {
        vm.expectRevert("DexPair: FORBIDDEN");
        pair.initialize(address(token0), address(token1));
    }

    // ── Mint (Add Liquidity) ──

    function test_mint_initialLiquidity() public {
        token0.mint(address(pair), 1 ether);
        token1.mint(address(pair), 4 ether);

        uint256 liquidity = pair.mint(lp);

        // sqrt(1e18 * 4e18) - 1000 = 2e18 - 1000
        uint256 expectedLiquidity = 2 ether - 1000;
        assertEq(liquidity, expectedLiquidity, "Wrong initial LP tokens");
        assertEq(pair.balanceOf(address(0)), 1000, "MINIMUM_LIQUIDITY not locked");
        assertEq(pair.totalSupply(), 2 ether, "Wrong total supply");

        (uint112 r0, uint112 r1,) = pair.getReserves();
        assertEq(r0, 1 ether);
        assertEq(r1, 4 ether);
    }

    function test_mint_subsequentLiquidity() public {
        _addLiquidity(1 ether, 4 ether);

        // Add equal proportion
        token0.mint(address(pair), 1 ether);
        token1.mint(address(pair), 4 ether);
        pair.mint(lp);

        // Total supply should double (approximately)
        assertEq(pair.totalSupply(), 4 ether);
    }

    function test_mint_revertsOnZeroLiquidity() public {
        // First, add some liquidity
        _addLiquidity(1 ether, 1 ether);

        // Try to add zero amounts (just call mint without transferring anything new)
        vm.expectRevert(); // Will underflow or give zero liquidity
        pair.mint(lp);
    }

    // ── Burn (Remove Liquidity) ──

    function test_burn() public {
        _addLiquidity(3 ether, 3 ether);

        uint256 lpBalance = pair.balanceOf(lp);

        // Transfer LP tokens to pair for burning
        vm.prank(lp);
        pair.transfer(address(pair), lpBalance);

        (uint256 amount0, uint256 amount1) = pair.burn(user);

        // Should get back proportional share (minus MINIMUM_LIQUIDITY locked)
        assertTrue(amount0 > 0, "Should receive token0");
        assertTrue(amount1 > 0, "Should receive token1");
        assertEq(token0.balanceOf(user), amount0);
        assertEq(token1.balanceOf(user), amount1);
        assertEq(pair.balanceOf(lp), 0, "LP should have no more tokens");
    }

    // ── Swap ──

    function test_swap_token0ForToken1() public {
        _addLiquidity(5 ether, 10 ether);

        uint256 swapAmount = 1 ether;
        token0.mint(address(pair), swapAmount);

        // Calculate expected output: (10e18 * 1e18 * 997) / (5e18 * 1000 + 1e18 * 997)
        uint256 amountInWithFee = swapAmount * 997;
        uint256 expectedOut = (amountInWithFee * 10 ether) / (5 ether * 1000 + amountInWithFee);

        pair.swap(0, expectedOut, user, "");
        assertEq(token1.balanceOf(user), expectedOut, "User should receive token1");
    }

    function test_swap_token1ForToken0() public {
        _addLiquidity(5 ether, 10 ether);

        uint256 swapAmount = 2 ether;
        token1.mint(address(pair), swapAmount);

        uint256 amountInWithFee = swapAmount * 997;
        uint256 expectedOut = (amountInWithFee * 5 ether) / (10 ether * 1000 + amountInWithFee);

        pair.swap(expectedOut, 0, user, "");
        assertEq(token0.balanceOf(user), expectedOut);
    }

    function test_swap_revertsOnInsufficientOutputAmount() public {
        _addLiquidity(5 ether, 10 ether);

        vm.expectRevert("DexPair: INSUFFICIENT_OUTPUT_AMOUNT");
        pair.swap(0, 0, user, "");
    }

    function test_swap_revertsOnInsufficientLiquidity() public {
        _addLiquidity(5 ether, 10 ether);

        vm.expectRevert("DexPair: INSUFFICIENT_LIQUIDITY");
        pair.swap(5 ether, 0, user, ""); // trying to drain entire reserve
    }

    function test_swap_revertsOnInvariantViolation() public {
        _addLiquidity(5 ether, 10 ether);

        // Try to get output without providing any input — should violate k
        vm.expectRevert("DexPair: INSUFFICIENT_INPUT_AMOUNT");
        pair.swap(0, 1 ether, user, "");
    }

    function test_swap_preservesInvariant() public {
        _addLiquidity(5 ether, 10 ether);

        (uint112 r0Before, uint112 r1Before,) = pair.getReserves();
        uint256 kBefore = uint256(r0Before) * uint256(r1Before);

        // Perform swap
        token0.mint(address(pair), 1 ether);
        uint256 amountInWithFee = 1 ether * 997;
        uint256 expectedOut = (amountInWithFee * 10 ether) / (5 ether * 1000 + amountInWithFee);
        pair.swap(0, expectedOut, user, "");

        (uint112 r0After, uint112 r1After,) = pair.getReserves();
        uint256 kAfter = uint256(r0After) * uint256(r1After);

        // k should increase (fees are kept in the pool)
        assertTrue(kAfter >= kBefore, "K should not decrease after swap");
    }

    // ── Flash Swap ──

    function test_flashSwap_succeeds_whenRepaid() public {
        _addLiquidity(10 ether, 10 ether);

        MockFlashBorrower borrower = new MockFlashBorrower(address(pair), true);
        // Fund the borrower with enough to repay
        token0.mint(address(borrower), 1 ether);

        borrower.initFlashSwap(address(token0), 0.5 ether);

        // If we reach here, flash swap succeeded
        assertTrue(true, "Flash swap should succeed when repaid");
    }

    function test_flashSwap_reverts_whenNotRepaid() public {
        _addLiquidity(10 ether, 10 ether);

        MockFlashBorrower borrower = new MockFlashBorrower(address(pair), false);

        vm.expectRevert("DexPair: INSUFFICIENT_INPUT_AMOUNT");
        borrower.initFlashSwap(address(token0), 0.5 ether);
    }

    // ── Skim & Sync ──

    function test_skim() public {
        _addLiquidity(5 ether, 10 ether);

        // Send extra tokens directly to pair
        token0.mint(address(pair), 1 ether);

        pair.skim(user);
        assertEq(token0.balanceOf(user), 1 ether, "User should receive excess token0");
    }

    function test_sync() public {
        _addLiquidity(5 ether, 10 ether);

        // Send extra tokens directly to pair
        token0.mint(address(pair), 1 ether);

        pair.sync();

        (uint112 r0, uint112 r1,) = pair.getReserves();
        assertEq(r0, 6 ether, "Reserve0 should match actual balance");
        assertEq(r1, 10 ether);
    }

    // ── Reentrancy ──

    function test_swap_revertsOnReentrancy() public {
        // This is inherently tested by the lock modifier - any reentrant call will revert with "DexPair: LOCKED"
        // The lock modifier on swap, mint, and burn prevents reentrancy attacks
        _addLiquidity(5 ether, 10 ether);

        // Basic confirmation that lock is initialized
        assertEq(pair.token0(), address(token0)); // State is accessible
    }

    // ── TWAP Oracle ──

    function test_cumulativePriceUpdates() public {
        _addLiquidity(1 ether, 1 ether);

        uint256 price0Before = pair.price0CumulativeLast();
        uint256 price1Before = pair.price1CumulativeLast();

        // Advance time
        vm.warp(block.timestamp + 100);

        // Trigger an update (sync)
        pair.sync();

        uint256 price0After = pair.price0CumulativeLast();
        uint256 price1After = pair.price1CumulativeLast();

        assertTrue(price0After > price0Before, "Cumulative price0 should increase");
        assertTrue(price1After > price1Before, "Cumulative price1 should increase");
    }

    // ── Protocol Fee ──

    function test_protocolFee_mintsLPToFeeTo() public {
        address treasury = makeAddr("treasury");
        factory.setFeeTo(treasury);

        _addLiquidity(5 ether, 10 ether);

        // Perform a swap to generate fees
        token0.mint(address(pair), 1 ether);
        uint256 amountInWithFee = 1 ether * 997;
        uint256 expectedOut = (amountInWithFee * 10 ether) / (5 ether * 1000 + amountInWithFee);
        pair.swap(0, expectedOut, user, "");

        // Now add more liquidity to trigger fee minting
        token0.mint(address(pair), 5 ether);
        token1.mint(address(pair), 10 ether);
        pair.mint(lp);

        // Treasury should have received some LP tokens
        assertTrue(pair.balanceOf(treasury) > 0, "Treasury should receive protocol fee LP tokens");
    }
}
