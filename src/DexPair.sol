// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IDexPair.sol";
import "./interfaces/IDexFactory.sol";
import "./interfaces/IDexCallee.sol";
import "./interfaces/IERC20.sol";
import "./libraries/Math.sol";
import "./libraries/UQ112x112.sol";

/// @title DexPair — AMM Liquidity Pool
/// @notice Each pair holds reserves of two ERC20 tokens and acts as an LP token (ERC20) itself.
/// @dev Implements the constant product invariant (x * y = k) with a 0.3% swap fee.
contract DexPair {
    using UQ112x112 for uint224;

    // ──────────────────────────────────────────────
    //  Constants
    // ──────────────────────────────────────────────
    uint256 public constant MINIMUM_LIQUIDITY = 10 ** 3;

    // ──────────────────────────────────────────────
    //  ERC20 LP Token State
    // ──────────────────────────────────────────────
    string public constant name = "Dex LP Token";
    string public constant symbol = "DEX-LP";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ──────────────────────────────────────────────
    //  Pair State
    // ──────────────────────────────────────────────
    address public factory;
    address public token0;
    address public token1;

    uint112 private reserve0;
    uint112 private reserve1;
    uint32 private blockTimestampLast;

    uint256 public price0CumulativeLast;
    uint256 public price1CumulativeLast;
    uint256 public kLast; // reserve0 * reserve1, as of immediately after the most recent liquidity event

    // ──────────────────────────────────────────────
    //  Reentrancy Lock
    // ──────────────────────────────────────────────
    uint256 private unlocked = 1;
    modifier lock() {
        require(unlocked == 1, "DexPair: LOCKED");
        unlocked = 0;
        _;
        unlocked = 1;
    }

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );
    event Sync(uint112 reserve0, uint112 reserve1);

    // ──────────────────────────────────────────────
    //  Constructor & Initialization
    // ──────────────────────────────────────────────
    constructor() {
        factory = msg.sender;
    }

    /// @notice Called once by the factory at the time of deployment
    function initialize(address _token0, address _token1) external {
        require(msg.sender == factory, "DexPair: FORBIDDEN");
        token0 = _token0;
        token1 = _token1;
    }

    // ──────────────────────────────────────────────
    //  ERC20 LP Token Functions
    // ──────────────────────────────────────────────
    function approve(address spender, uint256 value) external returns (bool) {
        _approve(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        if (allowance[from][msg.sender] != type(uint256).max) {
            require(allowance[from][msg.sender] >= value, "DexPair: INSUFFICIENT_ALLOWANCE");
            allowance[from][msg.sender] -= value;
        }
        _transfer(from, to, value);
        return true;
    }

    function _approve(address owner, address spender, uint256 value) private {
        allowance[owner][spender] = value;
        emit Approval(owner, spender, value);
    }

    function _transfer(address from, address to, uint256 value) private {
        require(balanceOf[from] >= value, "DexPair: INSUFFICIENT_BALANCE");
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }

    function _mint(address to, uint256 value) private {
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    function _burn(address from, uint256 value) private {
        require(balanceOf[from] >= value, "DexPair: INSUFFICIENT_BALANCE");
        balanceOf[from] -= value;
        totalSupply -= value;
        emit Transfer(from, address(0), value);
    }

    // ──────────────────────────────────────────────
    //  Reserves & Oracle
    // ──────────────────────────────────────────────
    function getReserves() public view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast) {
        _reserve0 = reserve0;
        _reserve1 = reserve1;
        _blockTimestampLast = blockTimestampLast;
    }

    /// @dev Update reserves and, on the first call per block, accumulate price for TWAP oracle
    function _update(uint256 balance0, uint256 balance1, uint112 _reserve0, uint112 _reserve1) private {
        require(balance0 <= type(uint112).max && balance1 <= type(uint112).max, "DexPair: OVERFLOW");

        uint32 blockTimestamp = uint32(block.timestamp % 2 ** 32);
        unchecked {
            uint32 timeElapsed = blockTimestamp - blockTimestampLast; // overflow is desired
            if (timeElapsed > 0 && _reserve0 != 0 && _reserve1 != 0) {
                // * never overflows, and + overflow is desired
                price0CumulativeLast += uint256(UQ112x112.encode(_reserve1).uqdiv(_reserve0)) * timeElapsed;
                price1CumulativeLast += uint256(UQ112x112.encode(_reserve0).uqdiv(_reserve1)) * timeElapsed;
            }
        }

        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
        blockTimestampLast = blockTimestamp;
        emit Sync(reserve0, reserve1);
    }

    /// @dev If fee is on, mint liquidity equivalent to 1/6th of the growth in sqrt(k)
    function _mintFee(uint112 _reserve0, uint112 _reserve1) private returns (bool feeOn) {
        address feeTo = IDexFactory(factory).feeTo();
        feeOn = feeTo != address(0);
        uint256 _kLast = kLast;
        if (feeOn) {
            if (_kLast != 0) {
                uint256 rootK = Math.sqrt(uint256(_reserve0) * uint256(_reserve1));
                uint256 rootKLast = Math.sqrt(_kLast);
                if (rootK > rootKLast) {
                    uint256 numerator = totalSupply * (rootK - rootKLast);
                    uint256 denominator = rootK * 5 + rootKLast;
                    uint256 liquidity = numerator / denominator;
                    if (liquidity > 0) _mint(feeTo, liquidity);
                }
            }
        } else if (_kLast != 0) {
            kLast = 0;
        }
    }

    // ──────────────────────────────────────────────
    //  Core AMM Functions
    // ──────────────────────────────────────────────

    /// @notice Mint LP tokens for a liquidity provider
    /// @dev Called after tokens have been transferred to this contract
    /// @param to The recipient of the LP tokens
    /// @return liquidity The amount of LP tokens minted
    function mint(address to) external lock returns (uint256 liquidity) {
        (uint112 _reserve0, uint112 _reserve1,) = getReserves();
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - _reserve0;
        uint256 amount1 = balance1 - _reserve1;

        bool feeOn = _mintFee(_reserve0, _reserve1);
        uint256 _totalSupply = totalSupply; // gas savings

        if (_totalSupply == 0) {
            liquidity = Math.sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            _mint(address(0), MINIMUM_LIQUIDITY); // permanently lock the first MINIMUM_LIQUIDITY tokens
        } else {
            liquidity = Math.min(
                (amount0 * _totalSupply) / _reserve0,
                (amount1 * _totalSupply) / _reserve1
            );
        }
        require(liquidity > 0, "DexPair: INSUFFICIENT_LIQUIDITY_MINTED");
        _mint(to, liquidity);

        _update(balance0, balance1, _reserve0, _reserve1);
        if (feeOn) kLast = uint256(reserve0) * uint256(reserve1);
        emit Mint(msg.sender, amount0, amount1);
    }

    /// @notice Burn LP tokens and return proportional share of reserves
    /// @dev LP tokens must be transferred to this contract before calling
    /// @param to The recipient of the underlying tokens
    /// @return amount0 Amount of token0 returned
    /// @return amount1 Amount of token1 returned
    function burn(address to) external lock returns (uint256 amount0, uint256 amount1) {
        (uint112 _reserve0, uint112 _reserve1,) = getReserves();
        address _token0 = token0;
        address _token1 = token1;
        uint256 balance0 = IERC20(_token0).balanceOf(address(this));
        uint256 balance1 = IERC20(_token1).balanceOf(address(this));
        uint256 liquidity = balanceOf[address(this)];

        bool feeOn = _mintFee(_reserve0, _reserve1);
        uint256 _totalSupply = totalSupply; // gas savings

        amount0 = (liquidity * balance0) / _totalSupply;
        amount1 = (liquidity * balance1) / _totalSupply;
        require(amount0 > 0 && amount1 > 0, "DexPair: INSUFFICIENT_LIQUIDITY_BURNED");

        _burn(address(this), liquidity);

        _safeTransfer(_token0, to, amount0);
        _safeTransfer(_token1, to, amount1);

        balance0 = IERC20(_token0).balanceOf(address(this));
        balance1 = IERC20(_token1).balanceOf(address(this));

        _update(balance0, balance1, _reserve0, _reserve1);
        if (feeOn) kLast = uint256(reserve0) * uint256(reserve1);
        emit Burn(msg.sender, amount0, amount1, to);
    }

    /// @notice Swap tokens — the core AMM function
    /// @dev At least one of amount0Out or amount1Out must be > 0.
    ///      Supports flash swaps via the `data` callback parameter.
    /// @param amount0Out Amount of token0 to send out
    /// @param amount1Out Amount of token1 to send out
    /// @param to Recipient of the output tokens
    /// @param data If non-empty, triggers a flash swap callback to `to`
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external lock {
        require(amount0Out > 0 || amount1Out > 0, "DexPair: INSUFFICIENT_OUTPUT_AMOUNT");
        (uint112 _reserve0, uint112 _reserve1,) = getReserves();
        require(amount0Out < _reserve0 && amount1Out < _reserve1, "DexPair: INSUFFICIENT_LIQUIDITY");

        uint256 balance0;
        uint256 balance1;
        {
            // scope for _token{0,1}, avoids stack too deep errors
            address _token0 = token0;
            address _token1 = token1;
            require(to != _token0 && to != _token1, "DexPair: INVALID_TO");

            if (amount0Out > 0) _safeTransfer(_token0, to, amount0Out); // optimistically transfer tokens
            if (amount1Out > 0) _safeTransfer(_token1, to, amount1Out); // optimistically transfer tokens
            if (data.length > 0) IDexCallee(to).dexCall(msg.sender, amount0Out, amount1Out, data);

            balance0 = IERC20(_token0).balanceOf(address(this));
            balance1 = IERC20(_token1).balanceOf(address(this));
        }

        uint256 amount0In = balance0 > _reserve0 - amount0Out ? balance0 - (_reserve0 - amount0Out) : 0;
        uint256 amount1In = balance1 > _reserve1 - amount1Out ? balance1 - (_reserve1 - amount1Out) : 0;
        require(amount0In > 0 || amount1In > 0, "DexPair: INSUFFICIENT_INPUT_AMOUNT");

        {
            // scope for reserve{0,1}Adjusted, avoids stack too deep errors
            // Adjusted = balance * 1000 - amountIn * 3 (0.3% fee)
            uint256 balance0Adjusted = balance0 * 1000 - amount0In * 3;
            uint256 balance1Adjusted = balance1 * 1000 - amount1In * 3;
            require(
                balance0Adjusted * balance1Adjusted >= uint256(_reserve0) * uint256(_reserve1) * (1000 ** 2),
                "DexPair: K"
            );
        }

        _update(balance0, balance1, _reserve0, _reserve1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    /// @notice Force balances to match reserves (send excess tokens to `to`)
    function skim(address to) external lock {
        address _token0 = token0;
        address _token1 = token1;
        _safeTransfer(_token0, to, IERC20(_token0).balanceOf(address(this)) - reserve0);
        _safeTransfer(_token1, to, IERC20(_token1).balanceOf(address(this)) - reserve1);
    }

    /// @notice Force reserves to match current balances
    function sync() external lock {
        _update(IERC20(token0).balanceOf(address(this)), IERC20(token1).balanceOf(address(this)), reserve0, reserve1);
    }

    // ──────────────────────────────────────────────
    //  Internal Helpers
    // ──────────────────────────────────────────────
    function _safeTransfer(address token, address to, uint256 value) private {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "DexPair: TRANSFER_FAILED");
    }
}
