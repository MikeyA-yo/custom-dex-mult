// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/DexFactory.sol";
import "../src/DexPair.sol";
import "../src/DexRouter.sol";
import "../src/DexLibrary.sol";
import "../src/WETH9.sol";
import "./mocks/MockERC20.sol";

contract DexRouterTest is Test {
    DexFactory public factory;
    DexRouter public router;
    WETH9 public weth;
    MockERC20 public tokenA;
    MockERC20 public tokenB;
    MockERC20 public tokenC;

    address public user = makeAddr("user");
    uint256 constant INITIAL_BALANCE = 100 ether;
    uint256 constant DEADLINE = type(uint256).max;

    function setUp() public {
        factory = new DexFactory(address(this));
        weth = new WETH9();
        router = new DexRouter(address(factory), address(weth));

        tokenA = new MockERC20("Token A", "TKA", 18);
        tokenB = new MockERC20("Token B", "TKB", 18);
        tokenC = new MockERC20("Token C", "TKC", 18);

        // Fund user
        tokenA.mint(user, INITIAL_BALANCE);
        tokenB.mint(user, INITIAL_BALANCE);
        tokenC.mint(user, INITIAL_BALANCE);
        vm.deal(user, INITIAL_BALANCE);

        // Approve router
        vm.startPrank(user);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        tokenC.approve(address(router), type(uint256).max);
        vm.stopPrank();
    }

    // ── Helpers ──

    function _addLiquidityAB(uint256 amountA, uint256 amountB) internal {
        vm.prank(user);
        router.addLiquidity(
            address(tokenA),
            address(tokenB),
            amountA,
            amountB,
            0, // amountAMin
            0, // amountBMin
            user,
            DEADLINE
        );
    }

    // ── Add Liquidity ──

    function test_addLiquidity_createsPairAndMints() public {
        vm.prank(user);
        (uint256 amountA, uint256 amountB, uint256 liquidity) = router.addLiquidity(
            address(tokenA), address(tokenB), 5 ether, 10 ether, 4 ether, 9 ether, user, DEADLINE
        );

        assertEq(amountA, 5 ether);
        assertEq(amountB, 10 ether);
        assertTrue(liquidity > 0, "Should receive LP tokens");

        address pair = factory.getPair(address(tokenA), address(tokenB));
        assertTrue(pair != address(0), "Pair should be created");
    }

    function test_addLiquidity_maintainsPriceRatio() public {
        _addLiquidityAB(5 ether, 10 ether);

        // Add more liquidity — should maintain 1:2 ratio
        vm.prank(user);
        (uint256 amountA, uint256 amountB,) = router.addLiquidity(
            address(tokenA), address(tokenB), 5 ether, 20 ether, 0, 0, user, DEADLINE
        );

        // amountB should be adjusted to maintain ratio
        assertEq(amountA, 5 ether);
        assertEq(amountB, 10 ether, "Should maintain 1:2 price ratio");
    }

    function test_addLiquidityETH() public {
        vm.prank(user);
        (uint256 amountToken, uint256 amountETH, uint256 liquidity) =
            router.addLiquidityETH{value: 5 ether}(address(tokenA), 10 ether, 0, 0, user, DEADLINE);

        assertTrue(amountToken > 0);
        assertTrue(amountETH > 0);
        assertTrue(liquidity > 0);
    }

    // ── Remove Liquidity ──

    function test_removeLiquidity() public {
        _addLiquidityAB(5 ether, 10 ether);

        address pair = factory.getPair(address(tokenA), address(tokenB));
        uint256 lpBalance = DexPair(pair).balanceOf(user);

        vm.startPrank(user);
        DexPair(pair).approve(address(router), lpBalance);
        (uint256 amountA, uint256 amountB) =
            router.removeLiquidity(address(tokenA), address(tokenB), lpBalance, 0, 0, user, DEADLINE);
        vm.stopPrank();

        assertTrue(amountA > 0, "Should receive tokenA");
        assertTrue(amountB > 0, "Should receive tokenB");
    }

    function test_removeLiquidityETH() public {
        vm.startPrank(user);
        router.addLiquidityETH{value: 5 ether}(address(tokenA), 10 ether, 0, 0, user, DEADLINE);

        address pair = factory.getPair(address(tokenA), address(weth));
        uint256 lpBalance = DexPair(pair).balanceOf(user);

        DexPair(pair).approve(address(router), lpBalance);
        uint256 ethBefore = user.balance;
        (uint256 amountToken, uint256 amountETH) =
            router.removeLiquidityETH(address(tokenA), lpBalance, 0, 0, user, DEADLINE);
        vm.stopPrank();

        assertTrue(amountToken > 0);
        assertTrue(amountETH > 0);
        assertEq(user.balance, ethBefore + amountETH, "Should receive ETH");
    }

    // ── Swap: Exact Tokens For Tokens ──

    function test_swapExactTokensForTokens() public {
        _addLiquidityAB(10 ether, 10 ether);

        uint256 swapAmount = 1 ether;
        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);

        uint256 balBBefore = tokenB.balanceOf(user);

        vm.prank(user);
        uint256[] memory amounts = router.swapExactTokensForTokens(swapAmount, 0, path, user, DEADLINE);

        assertEq(amounts[0], swapAmount, "Input amount should match");
        assertTrue(amounts[1] > 0, "Should receive output");
        assertEq(tokenB.balanceOf(user), balBBefore + amounts[1]);
    }

    function test_swapExactTokensForTokens_revertsOnSlippage() public {
        _addLiquidityAB(10 ether, 10 ether);

        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);

        vm.prank(user);
        vm.expectRevert("DexRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        router.swapExactTokensForTokens(
            1 ether,
            10 ether, // unrealistically high amountOutMin — will revert
            path,
            user,
            DEADLINE
        );
    }

    function test_swapExactTokensForTokens_revertsOnExpiredDeadline() public {
        _addLiquidityAB(10 ether, 10 ether);

        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);

        vm.prank(user);
        vm.expectRevert("DexRouter: EXPIRED");
        router.swapExactTokensForTokens(1 ether, 0, path, user, block.timestamp - 1);
    }

    // ── Swap: Tokens For Exact Tokens ──

    function test_swapTokensForExactTokens() public {
        _addLiquidityAB(10 ether, 10 ether);

        uint256 desiredOut = 0.5 ether;
        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);

        uint256 balABefore = tokenA.balanceOf(user);
        uint256 balBBefore = tokenB.balanceOf(user);

        vm.prank(user);
        uint256[] memory amounts = router.swapTokensForExactTokens(desiredOut, 10 ether, path, user, DEADLINE);

        assertEq(amounts[amounts.length - 1], desiredOut, "Should receive exact output");
        assertEq(tokenA.balanceOf(user), balABefore - amounts[0]);
        assertEq(tokenB.balanceOf(user), balBBefore + desiredOut);
    }

    // ── Swap: ETH Variants ──

    function test_swapExactETHForTokens() public {
        // Create ETH/TokenA pool
        vm.startPrank(user);
        router.addLiquidityETH{value: 10 ether}(address(tokenA), 10 ether, 0, 0, user, DEADLINE);

        address[] memory path = new address[](2);
        path[0] = address(weth);
        path[1] = address(tokenA);

        uint256 balBefore = tokenA.balanceOf(user);
        uint256[] memory amounts = router.swapExactETHForTokens{value: 1 ether}(0, path, user, DEADLINE);
        vm.stopPrank();

        assertTrue(amounts[1] > 0, "Should receive tokens");
        assertEq(tokenA.balanceOf(user), balBefore + amounts[1]);
    }

    function test_swapExactTokensForETH() public {
        vm.startPrank(user);
        router.addLiquidityETH{value: 10 ether}(address(tokenA), 10 ether, 0, 0, user, DEADLINE);

        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(weth);

        uint256 ethBefore = user.balance;
        uint256[] memory amounts = router.swapExactTokensForETH(1 ether, 0, path, user, DEADLINE);
        vm.stopPrank();

        assertTrue(amounts[1] > 0, "Should receive ETH");
        assertEq(user.balance, ethBefore + amounts[1]);
    }

    function test_swapETHForExactTokens() public {
        vm.startPrank(user);
        router.addLiquidityETH{value: 10 ether}(address(tokenA), 10 ether, 0, 0, user, DEADLINE);

        address[] memory path = new address[](2);
        path[0] = address(weth);
        path[1] = address(tokenA);

        uint256 desiredOut = 0.5 ether;
        uint256 ethBefore = user.balance;
        uint256[] memory amounts = router.swapETHForExactTokens{value: 5 ether}(desiredOut, path, user, DEADLINE);
        vm.stopPrank();

        assertEq(amounts[amounts.length - 1], desiredOut);
        // Should refund unused ETH
        assertTrue(user.balance > ethBefore - 5 ether, "Should refund excess ETH");
    }

    // ── Multi-hop Swap ──

    function test_multiHopSwap() public {
        // Create A/B and B/C pools
        _addLiquidityAB(10 ether, 10 ether);

        vm.prank(user);
        router.addLiquidity(address(tokenB), address(tokenC), 10 ether, 10 ether, 0, 0, user, DEADLINE);

        // Swap A → B → C
        address[] memory path = new address[](3);
        path[0] = address(tokenA);
        path[1] = address(tokenB);
        path[2] = address(tokenC);

        uint256 balCBefore = tokenC.balanceOf(user);

        vm.prank(user);
        uint256[] memory amounts = router.swapExactTokensForTokens(1 ether, 0, path, user, DEADLINE);

        assertEq(amounts.length, 3);
        assertTrue(amounts[2] > 0, "Should receive tokenC");
        assertEq(tokenC.balanceOf(user), balCBefore + amounts[2]);
    }

    // ── View Functions ──

    function test_getAmountOut() public view {
        uint256 amountOut = router.getAmountOut(1 ether, 10 ether, 10 ether);
        // With 0.3% fee: (1e18 * 997 * 10e18) / (10e18 * 1000 + 1e18 * 997)
        assertTrue(amountOut > 0 && amountOut < 1 ether, "Output should be less than input due to fee + price impact");
    }

    function test_getAmountIn() public view {
        uint256 amountIn = router.getAmountIn(0.5 ether, 10 ether, 10 ether);
        assertTrue(amountIn > 0.5 ether, "Input should be more than output due to fee + price impact");
    }

    function test_getAmountsOut() public {
        _addLiquidityAB(10 ether, 10 ether);

        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);

        uint256[] memory amounts = router.getAmountsOut(1 ether, path);
        assertEq(amounts[0], 1 ether);
        assertTrue(amounts[1] > 0);
    }

    function test_quote() public view {
        uint256 amountB = router.quote(1 ether, 5 ether, 10 ether);
        assertEq(amountB, 2 ether, "Quote should give proportional amount");
    }
}
