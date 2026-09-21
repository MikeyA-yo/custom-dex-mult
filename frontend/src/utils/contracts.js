import sepoliaAddresses from './addresses.sepolia.json';
import anvilAddresses from './addresses.anvil.json';
import RouterABI from './abis/DexRouter.json';
import FactoryABI from './abis/DexFactory.json';
import PairABI from './abis/DexPair.json';
import WETHABI from './abis/WETH9.json';
import ERC20ABI from './abis/MockERC20.json';

export const ABIS = {
  Router: RouterABI.abi,
  Factory: FactoryABI.abi,
  Pair: PairABI.abi,
  WETH: WETHABI.abi,
  ERC20: ERC20ABI.abi,
};

export const NETWORKS = {
  sepolia: {
    id: 'sepolia',
    name: 'Sepolia Testnet',
    shortName: 'Sepolia',
    chainId: 11155111,
    chainIdHex: '0xaa36a7',
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    explorerUrl: 'https://sepolia.etherscan.io',
    currency: {
      name: 'Sepolia ETH',
      symbol: 'ETH',
      decimals: 18,
    },
    addresses: sepoliaAddresses,
    tokens: {
      '10X': sepoliaAddresses.Token10x,
      'AYO': sepoliaAddresses.TokenAyo,
      'WETH': sepoliaAddresses.WETH,
    },
  },
  anvil: {
    id: 'anvil',
    name: 'Anvil Localhost',
    shortName: 'Anvil Local',
    chainId: 31337,
    chainIdHex: '0x7a69',
    rpcUrl: 'http://127.0.0.1:8545',
    explorerUrl: '',
    currency: {
      name: 'ETH',
      symbol: 'ETH',
      decimals: 18,
    },
    addresses: anvilAddresses,
    tokens: {
      '10X': anvilAddresses.Token10x,
      'AYO': anvilAddresses.TokenAyo,
      'WETH': anvilAddresses.WETH,
    },
  },
};

// Default export for backward compatibility
export const CONTRACT_ADDRESSES = sepoliaAddresses;

export const TOKENS = {
  '10X': sepoliaAddresses.Token10x,
  'AYO': sepoliaAddresses.TokenAyo,
  'WETH': sepoliaAddresses.WETH,
};
