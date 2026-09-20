// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/DexFactory.sol";
import "../src/DexRouter.sol";
import "../src/WETH9.sol";

/// @title Deploy — Deploys the full DEX stack
/// @notice Deploys WETH9, DexFactory, and DexRouter
/// @dev Usage: forge script script/Deploy.s.sol --broadcast --rpc-url <RPC_URL> --private-key <KEY>
contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy WETH9 (or use existing on mainnet)
        WETH9 weth = new WETH9();
        console.log("WETH9 deployed at:", address(weth));

        // 2. Deploy Factory with deployer as fee admin
        DexFactory factory = new DexFactory(deployer);
        console.log("DexFactory deployed at:", address(factory));

        // 3. Deploy Router
        DexRouter router = new DexRouter(address(factory), address(weth));
        console.log("DexRouter deployed at:", address(router));

        vm.stopBroadcast();

        console.log("-------------------------------");
        console.log("Deployment complete!");
        console.log("Deployer / Fee Admin:", deployer);
    }
}
