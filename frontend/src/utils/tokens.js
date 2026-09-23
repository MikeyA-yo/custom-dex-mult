/** Tokens the UI can trade. ETH is native; its pool token is WETH. */
export const TRADABLE = [
  { symbol: 'ETH', name: 'Ether', native: true },
  { symbol: 'WETH', name: 'Wrapped Ether' },
  { symbol: '10X', name: '10x Token' },
  { symbol: 'AYO', name: 'Ayo Token' },
];

/** Underlying pools deployed by the scripts. ETH deposits use the WETH pool. */
export const POOLS = [
  { base: '10X', quote: 'AYO' },
  { base: '10X', quote: 'WETH' },
  { base: 'AYO', quote: 'WETH' },
];

export function pairKind(symbolA, symbolB) {
  if (!symbolA || !symbolB || symbolA === symbolB) return 'same';
  const wrap =
    (symbolA === 'ETH' && symbolB === 'WETH') ||
    (symbolA === 'WETH' && symbolB === 'ETH');
  return wrap ? 'wrap' : 'pool';
}

/** Address used inside a pair. Native ETH is the WETH reserve. */
export function poolTokenAddress(symbol, tokens) {
  if (!tokens || !symbol) return null;
  if (symbol === 'ETH' || symbol === 'WETH') return tokens.WETH ?? null;
  return tokens[symbol] ?? null;
}

export function underlyingSymbol(symbol) {
  return symbol === 'ETH' ? 'WETH' : symbol;
}
