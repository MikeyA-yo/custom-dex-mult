import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from './useWeb3';
import { ABIS } from '../utils/contracts';
import { POOLS, pairKind, poolTokenAddress } from '../utils/tokens';

const EMPTY_BALANCES = { ETH: 0n, WETH: 0n, '10X': 0n, AYO: 0n };

function readErrorMessage(selectedNetwork) {
  if (selectedNetwork === 'anvil') {
    return 'Local Anvil node is not running at 127.0.0.1:8545.';
  }
  return 'Could not reach the Sepolia network.';
}

export function useBalances() {
  const { account, readProvider, tokens, dataVersion, selectedNetwork } = useWeb3();
  const balanceKey = `${account ?? ''}|${selectedNetwork}`;
  const [snapshot, setSnapshot] = useState({
    key: '',
    balances: EMPTY_BALANCES,
    error: '',
    loaded: false,
  });

  useEffect(() => {
    if (!readProvider || !tokens?.WETH || !tokens['10X'] || !tokens.AYO) return undefined;
    let active = true;

    const load = async () => {
      try {
        const weth = new ethers.Contract(tokens.WETH, ABIS.ERC20, readProvider);
        const token10x = new ethers.Contract(tokens['10X'], ABIS.ERC20, readProvider);
        const ayo = new ethers.Contract(tokens.AYO, ABIS.ERC20, readProvider);
        const [eth, wethBal, tenBal, ayoBal] = await Promise.all([
          account ? readProvider.getBalance(account) : Promise.resolve(0n),
          account ? weth.balanceOf(account) : Promise.resolve(0n),
          account ? token10x.balanceOf(account) : Promise.resolve(0n),
          account ? ayo.balanceOf(account) : Promise.resolve(0n),
        ]);
        if (!active) return;
        setSnapshot({
          key: balanceKey,
          balances: { ETH: eth, WETH: wethBal, '10X': tenBal, AYO: ayoBal },
          error: '',
          loaded: true,
        });
      } catch {
        if (!active) return;
        setSnapshot({
          key: balanceKey,
          balances: EMPTY_BALANCES,
          error: readErrorMessage(selectedNetwork),
          loaded: false,
        });
      }
    };

    load();
    const timer = setInterval(load, 8000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [account, balanceKey, readProvider, tokens, dataVersion, selectedNetwork]);

  if (snapshot.key !== balanceKey) {
    return { balances: EMPTY_BALANCES, error: '', loaded: false };
  }
  return { balances: snapshot.balances, error: snapshot.error, loaded: snapshot.loaded };
}

const EMPTY_PAIR = {
  exists: false,
  pairAddress: null,
  reserveA: 0n,
  reserveB: 0n,
  totalSupply: 0n,
  lpBalance: 0n,
  loading: true,
  error: '',
};

async function readPair(provider, factoryAddress, account, addressA, addressB) {
  const factory = new ethers.Contract(factoryAddress, ABIS.Factory, provider);
  const pairAddress = await factory.getPair(addressA, addressB);
  if (!pairAddress || pairAddress === ethers.ZeroAddress) {
    return {
      exists: false,
      pairAddress: null,
      reserveA: 0n,
      reserveB: 0n,
      totalSupply: 0n,
      lpBalance: 0n,
    };
  }

  const pair = new ethers.Contract(pairAddress, ABIS.Pair, provider);
  const [reserves, token0, totalSupply, lpBalance] = await Promise.all([
    pair.getReserves(),
    pair.token0(),
    pair.totalSupply(),
    account ? pair.balanceOf(account) : Promise.resolve(0n),
  ]);
  const aIsToken0 = token0.toLowerCase() === addressA.toLowerCase();
  return {
    exists: true,
    pairAddress,
    reserveA: aIsToken0 ? reserves[0] : reserves[1],
    reserveB: aIsToken0 ? reserves[1] : reserves[0],
    totalSupply,
    lpBalance,
  };
}

function samePair(prev, next) {
  return (
    prev.exists === next.exists &&
    prev.pairAddress === next.pairAddress &&
    prev.reserveA === next.reserveA &&
    prev.reserveB === next.reserveB &&
    prev.totalSupply === next.totalSupply &&
    prev.lpBalance === next.lpBalance &&
    prev.loading === false &&
    prev.error === ''
  );
}

export function usePair(symbolA, symbolB) {
  const { account, readProvider, tokens, addresses, dataVersion, selectedNetwork } = useWeb3();
  const kind = pairKind(symbolA, symbolB);
  const key = `${kind}|${symbolA}|${symbolB}|${addresses?.Factory ?? ''}`;
  const [snapshot, setSnapshot] = useState({ key: '', pair: null });

  useEffect(() => {
    if (kind !== 'pool') return undefined;
    if (!readProvider || !addresses?.Factory || !tokens) return undefined;

    const addressA = poolTokenAddress(symbolA, tokens);
    const addressB = poolTokenAddress(symbolB, tokens);
    if (!addressA || !addressB || addressA.toLowerCase() === addressB.toLowerCase()) return undefined;

    let active = true;
    const load = async () => {
      try {
        const next = await readPair(readProvider, addresses.Factory, account, addressA, addressB);
        if (!active) return;
        const pair = { ...next, loading: false, error: '' };
        setSnapshot((prev) => {
          if (prev.key === key && prev.pair && samePair(prev.pair, pair)) return prev;
          return { key, pair };
        });
      } catch {
        if (!active) return;
        setSnapshot({
          key,
          pair: { ...EMPTY_PAIR, loading: false, error: readErrorMessage(selectedNetwork) },
        });
      }
    };

    load();
    const timer = setInterval(load, 8000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [key, kind, symbolA, symbolB, account, readProvider, tokens, addresses, dataVersion, selectedNetwork]);

  if (kind !== 'pool') return { kind, ...EMPTY_PAIR, loading: false };
  if (!readProvider || !addresses?.Factory || !tokens) {
    return {
      kind,
      ...EMPTY_PAIR,
      loading: false,
      error: 'Contracts are not configured for this network.',
    };
  }
  const addressA = poolTokenAddress(symbolA, tokens);
  const addressB = poolTokenAddress(symbolB, tokens);
  if (!addressA || !addressB || addressA.toLowerCase() === addressB.toLowerCase()) {
    return { kind, ...EMPTY_PAIR, loading: false };
  }
  if (snapshot.key !== key || !snapshot.pair) return { kind, ...EMPTY_PAIR, loading: true };
  return { kind, ...snapshot.pair };
}

const EMPTY_POSITIONS = POOLS.map((pool) => ({
  ...pool,
  exists: false,
  pairAddress: null,
  reserveBase: 0n,
  reserveQuote: 0n,
  totalSupply: 0n,
  lpBalance: 0n,
}));

export function usePositions() {
  const { account, readProvider, tokens, addresses, dataVersion, selectedNetwork } = useWeb3();
  const factoryAddress = addresses?.Factory ?? '';
  const [snapshot, setSnapshot] = useState({
    factory: '',
    positions: EMPTY_POSITIONS,
    loading: true,
    error: '',
  });

  useEffect(() => {
    if (!readProvider || !factoryAddress || !tokens) return undefined;
    let active = true;

    const load = async () => {
      try {
        const next = await Promise.all(
          POOLS.map(async (pool) => {
            const addressA = poolTokenAddress(pool.base, tokens);
            const addressB = poolTokenAddress(pool.quote, tokens);
            const read = await readPair(readProvider, factoryAddress, account, addressA, addressB);
            return {
              base: pool.base,
              quote: pool.quote,
              exists: read.exists,
              pairAddress: read.pairAddress,
              reserveBase: read.reserveA,
              reserveQuote: read.reserveB,
              totalSupply: read.totalSupply,
              lpBalance: read.lpBalance,
            };
          }),
        );
        if (!active) return;
        setSnapshot({ factory: factoryAddress, positions: next, loading: false, error: '' });
      } catch {
        if (!active) return;
        setSnapshot({
          factory: factoryAddress,
          positions: EMPTY_POSITIONS,
          loading: false,
          error: readErrorMessage(selectedNetwork),
        });
      }
    };

    load();
    const timer = setInterval(load, 8000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [account, factoryAddress, readProvider, tokens, dataVersion, selectedNetwork]);

  if (snapshot.factory !== factoryAddress) {
    return { positions: EMPTY_POSITIONS, loading: true, error: '' };
  }
  return { positions: snapshot.positions, loading: snapshot.loading, error: snapshot.error };
}
