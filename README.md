# 10x DEX - Constant Product AMM

A custom-built Decentralized Exchange (DEX) using the Constant Product AMM model ($x \times y = k$). Features complete smart contracts with Router, Factory, Pair implementations and a premium, glassmorphic React frontend.

## Features
- **Core Contracts**: Built from scratch (`DexFactory`, `DexPair`, `DexRouter`, `WETH9`).
- **Math**: Safe 112x112 fixed-point math for reserves and TWAP.
- **Security**: Built-in reentrancy guards (`lock` modifiers) and slippage/deadline protection.
- **Frontend UI**: Built with React, Vite, and ethers.js featuring a stunning dark mode glassmorphism design.

## Local Setup

### 1. Prerequisites
- [Foundry](https://getfoundry.sh/) (forge, anvil)
- Node.js & npm
- MetaMask browser extension

### 2. Start the Local Blockchain
Start a local Anvil node in your terminal:
```bash
anvil
```

### 3. Deploy Contracts Locally
In a new terminal window, run the deployment script to deploy the DEX, wrap ETH, and launch the two test tokens (10x and Ayo):
```bash
forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```
*Note: This script automatically copies the newly deployed addresses into the frontend.*

### 4. Run the Frontend
Navigate to the frontend folder, install dependencies, and start the development server:
```bash
cd frontend
npm install
npm run dev
```

### 5. Connect MetaMask
- **Add Network**: Add `Localhost 8545` to MetaMask (`http://127.0.0.1:8545`, Chain ID: `31337`).
- **Import Account**: Import the first Anvil test account into MetaMask using its private key:
  `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
- **Trade**: You now have 10,000 ETH and test tokens. Head over to `http://localhost:5173` to swap and add liquidity!

---

## 🌐 Deploy to Sepolia Testnet

You can deploy the complete DEX stack (WETH9, DexFactory, DexRouter, Mock Tokens, and initial liquidity pools) directly to Ethereum Sepolia.

### 1. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your configuration:
- `SEPOLIA_RPC_URL`: `https://ethereum-sepolia-rpc.publicnode.com` (or your Alchemy/Infura URL)
- `PRIVATE_KEY`: Your wallet's private key (make sure it has some Sepolia testnet ETH for gas)
- `ETHERSCAN_API_KEY`: *(Optional)* For automatic contract verification

### 2. Run the Sepolia Deployment Script
Execute the deployment using Foundry:
```bash
forge script script/DeploySepolia.s.sol --rpc-url sepolia --broadcast
```

*(Optional: To verify contracts on Etherscan during deployment, add `--verify`)*:
```bash
forge script script/DeploySepolia.s.sol --rpc-url sepolia --broadcast --verify
```

### 3. What the Deployment Does
- Deploys **WETH9**, **DexFactory**, and **DexRouter**.
- Deploys test tokens **10X** and **AYO**, minting initial balances to your deployer wallet.
- Automatically creates and seeds the **10X / AYO** liquidity pool on-chain.
- If your wallet holds $\ge 0.02$ Sepolia ETH, it also seeds initial ETH pools (**10X / ETH** and **AYO / ETH**).
- Automatically exports all deployed contract addresses into `frontend/src/utils/addresses.json`.

### 4. Test on Frontend
Start the frontend and switch your MetaMask network to **Sepolia**:
```bash
cd frontend
npm run dev
```
The dApp will automatically connect to your deployed Sepolia contracts!

