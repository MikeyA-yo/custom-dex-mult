// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IDexFactory.sol";
import "./interfaces/IDexPair.sol";
import "./interfaces/IWETH.sol";
import "./interfaces/IERC20.sol";
import "./DexLibrary.sol";

/// @title DexRouter — User-Facing Entry Point
/// @notice Handles token approvals/transfers, multi-hop routing, slippage/deadline enforcement, and ETH wrapping.
/// @dev Users interact with this contract only. It orchestrates calls to Factory and Pair contracts.
contract DexRouter {
    address public immutable factory;
    address public immutable WETH;

    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, "DexRouter: EXPIRED");
        _;
    }

    constructor(address _factory, address _WETH) {
        factory = _factory;
        WETH = _WETH;
    }

    receive() external payable {
        assert(msg.sender == WETH); // only accept ETH via fallback from the WETH contract
    }

    // ──────────────────────────────────────────────
    //  Add Liquidity
    // ──────────────────────────────────────────────

    function _addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) internal returns (uint256 amountA, uint256 amountB) {
        // Create pair if it doesn't exist yet
        if (IDexFactory(factory).getPair(tokenA, tokenB) == address(0)) {
            IDexFactory(factory).createPair(tokenA, tokenB);
        }

        (uint256 reserveA, uint256 reserveB) = DexLibrary.getReserves(factory, tokenA, tokenB);

        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint256 amountBOptimal = DexLibrary.quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, "DexRouter: INSUFFICIENT_B_AMOUNT");
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = DexLibrary.quote(amountBDesired, reserveB, reserveA);
                assert(amountAOptimal <= amountADesired);
                require(amountAOptimal >= amountAMin, "DexRouter: INSUFFICIENT_A_AMOUNT");
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        (amountA, amountB) = _addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin);
        address pair = DexLibrary.pairFor(factory, tokenA, tokenB);
        _safeTransferFrom(tokenA, msg.sender, pair, amountA);
        _safeTransferFrom(tokenB, msg.sender, pair, amountB);
        liquidity = IDexPair(pair).mint(to);
    }

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) returns (uint256 amountToken, uint256 amountETH, uint256 liquidity) {
        (amountToken, amountETH) =
            _addLiquidity(token, WETH, amountTokenDesired, msg.value, amountTokenMin, amountETHMin);
        address pair = DexLibrary.pairFor(factory, token, WETH);
        _safeTransferFrom(token, msg.sender, pair, amountToken);
        IWETH(WETH).deposit{value: amountETH}();
        assert(IWETH(WETH).transfer(pair, amountETH));
        liquidity = IDexPair(pair).mint(to);
        // refund dust eth, if any
        if (msg.value > amountETH) {
            _safeTransferETH(msg.sender, msg.value - amountETH);
        }
    }

    // ──────────────────────────────────────────────
    //  Remove Liquidity
    // ──────────────────────────────────────────────

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) public ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        address pair = DexLibrary.pairFor(factory, tokenA, tokenB);
        IDexPair(pair).transferFrom(msg.sender, pair, liquidity); // send LP tokens to pair
        (uint256 amount0, uint256 amount1) = IDexPair(pair).burn(to);
        (address token0,) = DexLibrary.sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
        require(amountA >= amountAMin, "DexRouter: INSUFFICIENT_A_AMOUNT");
        require(amountB >= amountBMin, "DexRouter: INSUFFICIENT_B_AMOUNT");
    }

    function removeLiquidityETH(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) public ensure(deadline) returns (uint256 amountToken, uint256 amountETH) {
        (amountToken, amountETH) =
            removeLiquidity(token, WETH, liquidity, amountTokenMin, amountETHMin, address(this), deadline);
        _safeTransfer(token, to, amountToken);
        IWETH(WETH).withdraw(amountETH);
        _safeTransferETH(to, amountETH);
    }

    // ──────────────────────────────────────────────
    //  Swap: Exact Input
    // ──────────────────────────────────────────────

    /// @dev Requires the initial amount to have already been sent to the first pair
    function _swap(uint256[] memory amounts, address[] memory path, address _to) internal {
        for (uint256 i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0,) = DexLibrary.sortTokens(input, output);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) =
                input == token0 ? (uint256(0), amountOut) : (amountOut, uint256(0));
            address to = i < path.length - 2 ? DexLibrary.pairFor(factory, output, path[i + 2]) : _to;
            IDexPair(DexLibrary.pairFor(factory, input, output)).swap(amount0Out, amount1Out, to, new bytes(0));
        }
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        amounts = DexLibrary.getAmountsOut(factory, amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "DexRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        _safeTransferFrom(path[0], msg.sender, DexLibrary.pairFor(factory, path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        amounts = DexLibrary.getAmountsIn(factory, amountOut, path);
        require(amounts[0] <= amountInMax, "DexRouter: EXCESSIVE_INPUT_AMOUNT");
        _safeTransferFrom(path[0], msg.sender, DexLibrary.pairFor(factory, path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    // ──────────────────────────────────────────────
    //  Swap: ETH Variants
    // ──────────────────────────────────────────────

    function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline)
        external
        payable
        ensure(deadline)
        returns (uint256[] memory amounts)
    {
        require(path[0] == WETH, "DexRouter: INVALID_PATH");
        amounts = DexLibrary.getAmountsOut(factory, msg.value, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "DexRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        IWETH(WETH).deposit{value: amounts[0]}();
        assert(IWETH(WETH).transfer(DexLibrary.pairFor(factory, path[0], path[1]), amounts[0]));
        _swap(amounts, path, to);
    }

    function swapTokensForExactETH(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        require(path[path.length - 1] == WETH, "DexRouter: INVALID_PATH");
        amounts = DexLibrary.getAmountsIn(factory, amountOut, path);
        require(amounts[0] <= amountInMax, "DexRouter: EXCESSIVE_INPUT_AMOUNT");
        _safeTransferFrom(path[0], msg.sender, DexLibrary.pairFor(factory, path[0], path[1]), amounts[0]);
        _swap(amounts, path, address(this));
        IWETH(WETH).withdraw(amounts[amounts.length - 1]);
        _safeTransferETH(to, amounts[amounts.length - 1]);
    }

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        require(path[path.length - 1] == WETH, "DexRouter: INVALID_PATH");
        amounts = DexLibrary.getAmountsOut(factory, amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "DexRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        _safeTransferFrom(path[0], msg.sender, DexLibrary.pairFor(factory, path[0], path[1]), amounts[0]);
        _swap(amounts, path, address(this));
        IWETH(WETH).withdraw(amounts[amounts.length - 1]);
        _safeTransferETH(to, amounts[amounts.length - 1]);
    }

    function swapETHForExactTokens(uint256 amountOut, address[] calldata path, address to, uint256 deadline)
        external
        payable
        ensure(deadline)
        returns (uint256[] memory amounts)
    {
        require(path[0] == WETH, "DexRouter: INVALID_PATH");
        amounts = DexLibrary.getAmountsIn(factory, amountOut, path);
        require(amounts[0] <= msg.value, "DexRouter: EXCESSIVE_INPUT_AMOUNT");
        IWETH(WETH).deposit{value: amounts[0]}();
        assert(IWETH(WETH).transfer(DexLibrary.pairFor(factory, path[0], path[1]), amounts[0]));
        _swap(amounts, path, to);
        // refund dust eth, if any
        if (msg.value > amounts[0]) {
            _safeTransferETH(msg.sender, msg.value - amounts[0]);
        }
    }

    // ──────────────────────────────────────────────
    //  View / Helper Functions
    // ──────────────────────────────────────────────

    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) public pure returns (uint256 amountB) {
        return DexLibrary.quote(amountA, reserveA, reserveB);
    }

    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        public
        pure
        returns (uint256 amountOut)
    {
        return DexLibrary.getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut)
        public
        pure
        returns (uint256 amountIn)
    {
        return DexLibrary.getAmountIn(amountOut, reserveIn, reserveOut);
    }

    function getAmountsOut(uint256 amountIn, address[] memory path) public view returns (uint256[] memory amounts) {
        return DexLibrary.getAmountsOut(factory, amountIn, path);
    }

    function getAmountsIn(uint256 amountOut, address[] memory path) public view returns (uint256[] memory amounts) {
        return DexLibrary.getAmountsIn(factory, amountOut, path);
    }

    // ──────────────────────────────────────────────
    //  Internal Helpers
    // ──────────────────────────────────────────────

    function _safeTransfer(address token, address to, uint256 value) private {
        (bool success, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "DexRouter: TRANSFER_FAILED");
    }

    function _safeTransferFrom(address token, address from, address to, uint256 value) private {
        (bool success, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "DexRouter: TRANSFER_FROM_FAILED");
    }

    function _safeTransferETH(address to, uint256 value) private {
        (bool success,) = to.call{value: value}(new bytes(0));
        require(success, "DexRouter: ETH_TRANSFER_FAILED");
    }
}
