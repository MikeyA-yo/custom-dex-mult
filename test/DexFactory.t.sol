// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/DexFactory.sol";
import "../src/DexPair.sol";
import "./mocks/MockERC20.sol";

contract DexFactoryTest is Test {
    DexFactory public factory;
    MockERC20 public tokenA;
    MockERC20 public tokenB;
    MockERC20 public tokenC;

    address public admin = makeAddr("admin");

    function setUp() public {
        factory = new DexFactory(admin);
        tokenA = new MockERC20("Token A", "TKA", 18);
        tokenB = new MockERC20("Token B", "TKB", 18);
        tokenC = new MockERC20("Token C", "TKC", 18);
    }

    // ── Pair Creation ──

    function test_createPair() public {
        address pair = factory.createPair(address(tokenA), address(tokenB));
        assertTrue(pair != address(0), "Pair should not be zero address");
        assertEq(factory.allPairsLength(), 1, "Should have 1 pair");
        assertEq(factory.getPair(address(tokenA), address(tokenB)), pair);
        assertEq(factory.getPair(address(tokenB), address(tokenA)), pair, "Reverse lookup should work");
    }

    function test_createPair_setsTokensSorted() public {
        address pair = factory.createPair(address(tokenA), address(tokenB));
        (address token0, address token1) =
            address(tokenA) < address(tokenB) ? (address(tokenA), address(tokenB)) : (address(tokenB), address(tokenA));
        assertEq(DexPair(pair).token0(), token0);
        assertEq(DexPair(pair).token1(), token1);
    }

    function test_createPair_revertsOnDuplicate() public {
        factory.createPair(address(tokenA), address(tokenB));
        vm.expectRevert("DexFactory: PAIR_EXISTS");
        factory.createPair(address(tokenA), address(tokenB));
    }

    function test_createPair_revertsOnIdenticalTokens() public {
        vm.expectRevert("DexFactory: IDENTICAL_ADDRESSES");
        factory.createPair(address(tokenA), address(tokenA));
    }

    function test_createPair_revertsOnZeroAddress() public {
        vm.expectRevert("DexFactory: ZERO_ADDRESS");
        factory.createPair(address(0), address(tokenA));
    }

    function test_createMultiplePairs() public {
        factory.createPair(address(tokenA), address(tokenB));
        factory.createPair(address(tokenB), address(tokenC));
        factory.createPair(address(tokenA), address(tokenC));
        assertEq(factory.allPairsLength(), 3);
    }

    // ── Fee Administration ──

    function test_feeTo_defaultsToZero() public view {
        assertEq(factory.feeTo(), address(0));
    }

    function test_setFeeTo() public {
        address treasury = makeAddr("treasury");
        vm.prank(admin);
        factory.setFeeTo(treasury);
        assertEq(factory.feeTo(), treasury);
    }

    function test_setFeeTo_revertsForNonAdmin() public {
        address treasury = makeAddr("treasury");
        address randomUser = makeAddr("randomUser");
        vm.prank(randomUser);
        vm.expectRevert("DexFactory: FORBIDDEN");
        factory.setFeeTo(treasury);
    }

    function test_setFeeToSetter() public {
        address newAdmin = makeAddr("newAdmin");
        vm.prank(admin);
        factory.setFeeToSetter(newAdmin);
        assertEq(factory.feeToSetter(), newAdmin);

        // Old admin can no longer set feeTo
        vm.prank(admin);
        vm.expectRevert("DexFactory: FORBIDDEN");
        factory.setFeeTo(makeAddr("x"));

        // New admin can
        vm.prank(newAdmin);
        factory.setFeeTo(makeAddr("x"));
    }
}
