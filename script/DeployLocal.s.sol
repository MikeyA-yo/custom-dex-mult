// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/DexFactory.sol";
import "../src/DexRouter.sol";
import "../src/WETH9.sol";
import "../test/mocks/MockERC20.sol"; // Using the mock to have minting ability easily

contract DeployLocal is Script {
    function run() external {
        // Anvil's default account 0
        uint256 deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

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

        // 3. Add Initial Liquidity (10,000 of each to set 1:1 price)
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
            block.timestamp + 1000
        );

        // Let's also add some liquidity with WETH for both tokens
        router.addLiquidityETH{value: 10 ether}(
            address(token10x), 10_000 ether, 0, 0, deployer, block.timestamp + 1000
        );
        
        router.addLiquidityETH{value: 10 ether}(
            address(tokenAyo), 10_000 ether, 0, 0, deployer, block.timestamp + 1000
        );

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
        vm.writeFile("frontend/src/utils/addresses.anvil.json", json);
        vm.writeFile("frontend/src/utils/addresses.json", json);

        console.log("Deployed successfully!");
        console.log("WETH:", address(weth));
        console.log("Factory:", address(factory));
        console.log("Router:", address(router));
        console.log("10x Token:", address(token10x));
        console.log("Ayo Token:", address(tokenAyo));
        console.log("Addresses exported to frontend/src/utils/addresses.json");
    }
}
