import addresses from './addresses.json';
import RouterABI from './abis/DexRouter.json';
import FactoryABI from './abis/DexFactory.json';
import PairABI from './abis/DexPair.json';
import WETHABI from './abis/WETH9.json';
import ERC20ABI from './abis/MockERC20.json';

export const CONTRACT_ADDRESSES = addresses;

export const ABIS = {
  Router: RouterABI.abi,
  Factory: FactoryABI.abi,
  Pair: PairABI.abi,
  WETH: WETHABI.abi,
  ERC20: ERC20ABI.abi,
};

// Available test tokens
export const TOKENS = {
  '10X': addresses.Token10x,
  'AYO': addresses.TokenAyo,
  'WETH': addresses.WETH
};
