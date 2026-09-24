import { ethers } from 'ethers';

const ETHER = 10n ** 18n;
const BPS_DENOM = 10000n;

/** Leave this much ETH behind so a native transfer can still pay gas. */
export const ETH_GAS_RESERVE = 500000000000000n;

export const IMPACT_WARN_BPS = 500n;
export const IMPACT_HIGH_BPS = 1500n;

function slippageBps(percent) {
  if (!Number.isFinite(percent) || percent < 0) return 50n;
  const bps = Math.round(percent * 100);
  if (bps > 5000) return 5000n;
  return BigInt(bps);
}

export function applySlippageDown(amount, percent) {
  if (typeof amount !== 'bigint') return 0n;
  const bps = slippageBps(percent);
  return (amount * (BPS_DENOM - bps)) / BPS_DENOM;
}

export function applySlippageUp(amount, percent) {
  if (typeof amount !== 'bigint') return 0n;
  const bps = slippageBps(percent);
  return (amount * (BPS_DENOM + bps)) / BPS_DENOM;
}

/** Matches DexLibrary.getAmountOut (0.3% fee). */
export function getAmountOut(amountIn, reserveIn, reserveOut) {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return null;
  const amountInWithFee = amountIn * 997n;
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * 1000n + amountInWithFee;
  const amountOut = numerator / denominator;
  return amountOut > 0n ? amountOut : null;
}

/** Matches DexLibrary.getAmountIn, including the round-up. */
export function getAmountIn(amountOut, reserveIn, reserveOut) {
  if (amountOut <= 0n || reserveIn <= 0n || reserveOut <= 0n) return null;
  if (amountOut >= reserveOut) return null;
  const numerator = reserveIn * amountOut * 1000n;
  const denominator = (reserveOut - amountOut) * 997n;
  return numerator / denominator + 1n;
}

/** Proportional deposit, matching DexLibrary.quote. */
export function quoteLiquidity(amountA, reserveA, reserveB) {
  if (amountA <= 0n || reserveA <= 0n || reserveB <= 0n) return null;
  const amountB = (amountA * reserveB) / reserveA;
  return amountB > 0n ? amountB : null;
}

/**
 * Price impact beyond the 0.3% fee, in basis points.
 * Compares the quote with an infinitesimal swap at the same reserves.
 */
export function priceImpactBps(amountIn, amountOut, reserveIn, reserveOut) {
  if (amountIn <= 0n || amountOut <= 0n || reserveIn <= 0n || reserveOut <= 0n) return null;
  const ideal = (amountIn * 997n * reserveOut) / (reserveIn * 1000n);
  if (ideal === 0n || amountOut >= ideal) return 0n;
  return ((ideal - amountOut) * BPS_DENOM) / ideal;
}

/** Output of 1 whole input token at the current reserves, scaled by 1e18. */
export function spotOutPerIn(reserveIn, reserveOut) {
  if (reserveIn <= 0n || reserveOut <= 0n) return null;
  return (reserveOut * ETHER) / reserveIn;
}

export function maxSpendableEth(balance) {
  if (typeof balance !== 'bigint' || balance <= ETH_GAS_RESERVE) return 0n;
  return balance - ETH_GAS_RESERVE;
}

export function tryParseEther(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  try {
    return ethers.parseEther(text);
  } catch {
    return null;
  }
}

export function sanitizeAmount(value) {
  const cleaned = String(value).replace(/[^\d.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts[0]}.${parts.slice(1).join('')}`;
}

export function formatTokenInput(value) {
  if (typeof value !== 'bigint') return '';
  if (value === 0n) return '0';
  const [whole, frac = ''] = ethers.formatEther(value).split('.');
  const cut = frac.slice(0, 8).replace(/0+$/, '');
  return cut ? `${whole}.${cut}` : whole;
}

export function formatTokenAmount(value, maxFrac = 6) {
  if (typeof value !== 'bigint') return '0';
  if (value === 0n) return '0';
  if (value < 10n ** 12n) return '< 0.000001';
  const [whole, frac = ''] = ethers.formatEther(value).split('.');
  const wholeFmt = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cut = frac.slice(0, maxFrac).replace(/0+$/, '');
  return cut ? `${wholeFmt}.${cut}` : wholeFmt;
}

export function formatShare(part, whole) {
  if (typeof part !== 'bigint' || typeof whole !== 'bigint' || whole === 0n) return '0%';
  if (part === 0n) return '0%';
  const bps = (part * BPS_DENOM) / whole;
  if (bps === 0n) return '< 0.01%';
  return `${(Number(bps) / 100).toFixed(2)}%`;
}

export function formatImpact(bps) {
  if (bps == null) return '—';
  if (bps === 0n) return '< 0.01%';
  const pct = Number(bps) / 100;
  if (!Number.isFinite(pct)) return '—';
  return `${pct.toFixed(2)}%`;
}

const USD_SCALE = 10n ** 8n;

/** ETH per one whole token, from the token/WETH pool. ETH and WETH are 1. */
export function ethPerWholeToken(symbol, positions) {
  if (symbol === 'ETH' || symbol === 'WETH') return ETHER;
  const pool = positions?.find((position) => position.base === symbol && position.quote === 'WETH');
  if (!pool?.exists || pool.reserveBase === 0n || pool.reserveQuote === 0n) return null;
  return spotOutPerIn(pool.reserveBase, pool.reserveQuote);
}

/** Dollar value scaled by 1e8. Uses the pool ETH price times the ETH/USD rate. */
export function usdScaled(tokenWei, ethPerToken, ethUsd) {
  if (typeof tokenWei !== 'bigint' || tokenWei <= 0n || typeof ethPerToken !== 'bigint' || ethPerToken <= 0n) return null;
  if (!Number.isFinite(ethUsd) || ethUsd <= 0) return null;
  const ethUsdScaled = BigInt(Math.round(ethUsd * 1e8));
  const ethWei = (tokenWei * ethPerToken) / ETHER;
  return (ethWei * ethUsdScaled) / ETHER;
}

export function formatUsdScaled(scaled) {
  if (scaled == null) return null;
  if (scaled <= 0n) return '$0.00';
  if (scaled < 100n) return '<$0.000001';
  const whole = scaled / USD_SCALE;
  const frac = (scaled % USD_SCALE).toString().padStart(8, '0');
  const wholeFmt = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (whole >= 1n) return `$${wholeFmt}.${frac.slice(0, 2)}`;
  const trimmed = frac.slice(0, 6).replace(/0+$/, '');
  return `$${wholeFmt}.${trimmed}`;
}

export function deadline(minutes = 20) {
  return Math.floor(Date.now() / 1000) + minutes * 60;
}

const REVERT_TEXT = [
  ['INSUFFICIENT_OUTPUT_AMOUNT', 'Price moved past your slippage. Raise the tolerance and try again.'],
  ['EXCESSIVE_INPUT_AMOUNT', 'This trade would cost more than your maximum input.'],
  ['EXPIRED', 'The transaction deadline passed. Submit it again.'],
  ['TRANSFER_FROM_FAILED', 'The token transfer failed. Check your balance and approval.'],
  ['TRANSFER_FAILED', 'The token transfer failed.'],
  ['ETH_TRANSFER_FAILED', 'The ETH transfer failed.'],
  ['INSUFFICIENT_LIQUIDITY_MINTED', 'The deposit is too small to mint liquidity.'],
  ['INSUFFICIENT_LIQUIDITY_BURNED', 'That liquidity amount is too small to withdraw.'],
  ['INSUFFICIENT_LIQUIDITY', 'The pool does not have enough liquidity for this trade.'],
  ['INSUFFICIENT_A_AMOUNT', 'The first token moved past your slippage.'],
  ['INSUFFICIENT_B_AMOUNT', 'The second token moved past your slippage.'],
  ['INSUFFICIENT_INPUT_AMOUNT', 'Enter an amount greater than zero.'],
  ['IDENTICAL_ADDRESSES', 'Choose two different tokens.'],
  ['INVALID_PATH', 'This path is not valid for an ETH swap.'],
  ['INVALID_TO', 'The swap recipient is invalid.'],
];

function collectErrorText(err) {
  const chunks = [];
  const seen = new Set();
  const walk = (value, depth) => {
    if (value == null || depth > 5) return;
    if (typeof value === 'string') {
      chunks.push(value);
      return;
    }
    if (typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    for (const key of ['shortMessage', 'reason', 'message', 'data']) {
      if (typeof value[key] === 'string') chunks.push(value[key]);
    }
    walk(value.cause, depth + 1);
    walk(value.error, depth + 1);
    walk(value.info?.error, depth + 1);
  };
  walk(err, 0);
  return chunks.join(' | ');
}

export function decodeRevert(err) {
  const message = collectErrorText(err);
  for (const [code, text] of REVERT_TEXT) {
    if (message.includes(code)) return text;
  }
  if (/user rejected|user denied|ACTION_REJECTED/i.test(message)) {
    return 'Transaction cancelled in the wallet.';
  }
  if (/insufficient funds/i.test(message)) {
    return 'Not enough ETH to cover the amount and gas.';
  }
  const cleaned = message.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Transaction failed.';
  return cleaned.length > 180 ? `${cleaned.slice(0, 180)}…` : cleaned;
}
