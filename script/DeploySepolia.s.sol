// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/DexFactory.sol";
import "../src/DexRouter.sol";
import "../src/WETH9.sol";
import "../test/mocks/MockERC20.sol";

contract DeploySepolia is Script {
    function run() external {
        bytes32 pkBytes = vm.envOr("PRIVATE_KEY", bytes32(0));
        uint256 deployerPrivateKey = uint256(pkBytes);
        if (deployerPrivateKey == 0) {
            deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0));
        }
        
        address deployer;
        if (deployerPrivateKey != 0) {
            deployer = vm.addr(deployerPrivateKey);
            vm.startBroadcast(deployerPrivateKey);
        } else {
            deployer = msg.sender;
            vm.startBroadcast();
        }

        console.log("Broadcasting with deployer:", deployer);

        // 1. Core Contracts
        WETH9 weth = new WETH9();
        DexFactory factory = new DexFactory(deployer);
        DexRouter router = new DexRouter(address(factory), address(weth));

        // 2. Tokens
        MockERC20 token10x = new MockERC20("10x Token", "10X", 18);
        MockERC20 tokenAyo = new MockERC20("Ayo Token", "AYO", 18);

        // Mint initial supply to deployer (1,000,000 tokens each)
        token10x.mint(deployer, 1_000_000 ether);
        tokenAyo.mint(deployer, 1_000_000 ether);

        // 3. Add Initial Liquidity for 10X / AYO (Zero ETH required)
        token10x.approve(address(router), type(uint256).max);
        tokenAyo.approve(address(router), type(uint256).max);

        router.addLiquidity(
            address(token10x),
            address(tokenAyo),
            10_000 ether,
            10_000 ether,
            0,
            0,
            deployer,
            block.timestamp + 1800
        );

        // If deployer has some spare Sepolia ETH, we can seed small liquidity with ETH
        if (deployer.balance >= 0.02 ether) {
            router.addLiquidityETH{value: 0.005 ether}(
                address(token10x),
                500 ether,
                0,
                0,
                deployer,
                block.timestamp + 1800
            );

            router.addLiquidityETH{value: 0.005 ether}(
                address(tokenAyo),
                500 ether,
                0,
                0,
                deployer,
                block.timestamp + 1800
            );
            console.log("Seeded ETH liquidity with 0.01 Sepolia ETH total!");
        } else {
            console.log("Low Sepolia ETH balance: Skipped ETH pool seeding to conserve gas. 10X/AYO pool is live!");
        }

        vm.stopBroadcast();

        // 4. Export addresses to JSON for the frontend
        string memory json = string.concat(
            '{\n',
            '  "WETH": "', vm.toString(address(weth)), '",\n',
            '  "Factory": "', vm.toString(address(factory)), '",\n',
            '  "Router": "', vm.toString(address(router)), '",\n',
            '  "Token10x": "', vm.toString(address(token10x)), '",\n',
            '  "TokenAyo": "', vm.toString(address(tokenAyo)), '"\n',
            '}'
        );
        vm.writeFile("frontend/src/utils/addresses.sepolia.json", json);
        vm.writeFile("frontend/src/utils/addresses.json", json);

        console.log("-----------------------------------------");
        console.log("Sepolia Deployment Complete!");
        console.log("WETH:", address(weth));
        console.log("DexFactory:", address(factory));
        console.log("DexRouter:", address(router));
        console.log("10x Token:", address(token10x));
        console.log("Ayo Token:", address(tokenAyo));
        console.log("Updated frontend/src/utils/addresses.json");
        console.log("-----------------------------------------");
    }
}
