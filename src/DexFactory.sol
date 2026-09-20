// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IDexFactory.sol";
import "./DexPair.sol";

/// @title DexFactory — Pair Registry & Creator
/// @notice Deploys new DexPair contracts and maintains a registry of all pools.
/// @dev Uses create2 for deterministic pair addresses.
contract DexFactory is IDexFactory {
    address public feeTo;
    address public feeToSetter;

    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    constructor(address _feeToSetter) {
        feeToSetter = _feeToSetter;
    }

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    /// @notice Create a new liquidity pair for two tokens
    /// @dev Tokens are sorted internally. Reverts if pair already exists or tokens are identical.
    /// @param tokenA First token address
    /// @param tokenB Second token address
    /// @return pair The address of the newly created DexPair contract
    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(tokenA != tokenB, "DexFactory: IDENTICAL_ADDRESSES");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "DexFactory: ZERO_ADDRESS");
        require(getPair[token0][token1] == address(0), "DexFactory: PAIR_EXISTS");

        bytes memory bytecode = type(DexPair).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        assembly {
            pair := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        require(pair != address(0), "DexFactory: CREATE2_FAILED");

        DexPair(pair).initialize(token0, token1);
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair; // populate mapping in the reverse direction
        allPairs.push(pair);

        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    function setFeeTo(address _feeTo) external {
        require(msg.sender == feeToSetter, "DexFactory: FORBIDDEN");
        feeTo = _feeTo;
    }

    function setFeeToSetter(address _feeToSetter) external {
        require(msg.sender == feeToSetter, "DexFactory: FORBIDDEN");
        feeToSetter = _feeToSetter;
    }
}
