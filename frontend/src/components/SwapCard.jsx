import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUpDown, Settings } from 'lucide-react';
import { ethers } from 'ethers';
import { useWeb3 } from '../hooks/useWeb3';
import { useBalances, usePair, usePositions } from '../hooks/useMarket';
import { useEthUsd } from '../hooks/useEthUsd';
import { ABIS } from '../utils/contracts';
import { TRADABLE, pairKind, underlyingSymbol } from '../utils/tokens';
import { ensureAllowance } from '../utils/dexTx';
import {
  IMPACT_HIGH_BPS,
  IMPACT_WARN_BPS,
  applySlippageDown,
  applySlippageUp,
  deadline,
  decodeRevert,
  ethPerWholeToken,
  formatImpact,
  formatTokenAmount,
  formatTokenInput,
  formatUsdScaled,
  usdScaled,
  getAmountIn,
  getAmountOut,
  maxSpendableEth,
  priceImpactBps,
  spotOutPerIn,
  tryParseEther,
} from '../utils/dexMath';
import AmountField from './AmountField';
import StatusBanner from './StatusBanner';

const SLIPPAGE_PRESETS = [0.1, 0.5, 1];
const QUOTE_ASSETS = TRADABLE.filter((token) => token.symbol !== 'ETH');
const LISTED = ['10X', 'AYO'];

export default function SwapCard() {
  const {
    account,
    connectWallet,
    router,
    signer,
    tokens,
    isCorrectNetwork,
    selectedNetwork,
    activeNetworkConfig,
    switchWalletToNetwork,
    bumpData,
  } = useWeb3();

  const [tradeMode, setTradeMode] = useState('buy');
  const [asset, setAsset] = useState('10X');
  const [swapIn, setSwapIn] = useState('10X');
  const [swapOut, setSwapOut] = useState('AYO');
  const tokenIn = tradeMode === 'buy' ? 'ETH' : tradeMode === 'sell' ? asset : swapIn;
  const tokenOut = tradeMode === 'buy' ? asset : tradeMode === 'sell' ? 'ETH' : swapOut;
  const [amountIn, setAmountIn] = useState('');
  const [amountOut, setAmountOut] = useState('');
  const [lastEdited, setLastEdited] = useState('IN');
  const [slippagePercent, setSlippagePercent] = useState(0.5);
  const [customSlippageInput, setCustomSlippageInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [customTolerable, setCustomTolerable] = useState('');
  const [tolerableLocked, setTolerableLocked] = useState(false);
  const [invertRate, setInvertRate] = useState(false);
  const [phase, setPhase] = useState('');
  const [status, setStatus] = useState(null);

  const { balances, error: balanceError, loaded: balancesLoaded } = useBalances();
  const { positions, loading: pricesLoading } = usePositions();
  const { ethUsd, error: ethUsdError } = useEthUsd();
  const pair = usePair(tokenIn, tokenOut);
  const kind = pairKind(tokenIn, tokenOut);

  const quote = useMemo(() => {
    const edited = lastEdited === 'IN' ? tryParseEther(amountIn) : tryParseEther(amountOut);
    if (edited == null || edited === 0n) return null;
    if (kind === 'wrap') return { inWei: edited, outWei: edited };
    if (!pair.exists || pair.reserveA === 0n || pair.reserveB === 0n) return null;
    if (lastEdited === 'IN') {
      const outWei = getAmountOut(edited, pair.reserveA, pair.reserveB);
      return outWei ? { inWei: edited, outWei } : null;
    }
    const inWei = getAmountIn(edited, pair.reserveA, pair.reserveB);
    return inWei ? { inWei, outWei: edited } : null;
  }, [amountIn, amountOut, lastEdited, kind, pair.exists, pair.reserveA, pair.reserveB]);

  const shownIn = lastEdited === 'IN' ? amountIn : (quote ? formatTokenInput(quote.inWei) : '');
  const shownOut = lastEdited === 'OUT' ? amountOut : (quote ? formatTokenInput(quote.outWei) : '');

  const autoMinOut = quote ? applySlippageDown(quote.outWei, slippagePercent) : 0n;
  const autoMaxIn = quote ? applySlippageUp(quote.inWei, slippagePercent) : 0n;
  const customWei = tolerableLocked ? tryParseEther(customTolerable) : null;
  const minOutWei = kind === 'wrap' ? (quote?.outWei ?? 0n) : (tolerableLocked ? customWei : autoMinOut);
  const maxInWei = kind === 'wrap' ? (quote?.inWei ?? 0n) : (tolerableLocked ? customWei : autoMaxIn);

  const impact = quote && kind === 'pool'
    ? priceImpactBps(quote.inWei, quote.outWei, pair.reserveA, pair.reserveB)
    : null;
  const spot = kind === 'pool' ? spotOutPerIn(pair.reserveA, pair.reserveB) : (kind === 'wrap' ? 10n ** 18n : null);
  const execution = quote && quote.inWei > 0n ? (quote.outWei * 10n ** 18n) / quote.inWei : null;
  const rateValue = execution == null
    ? null
    : (invertRate ? (quote.inWei * 10n ** 18n) / quote.outWei : execution);

  const balanceIn = balances[tokenIn] ?? 0n;
  const spendCap = tokenIn === 'ETH' ? maxSpendableEth(balanceIn) : balanceIn;
  const spendIn = lastEdited === 'IN' ? (quote?.inWei ?? 0n) : (maxInWei ?? 0n);

  const resetQuoteInputs = () => {
    setAmountIn('');
    setAmountOut('');
    setLastEdited('IN');
    setTolerableLocked(false);
    setCustomTolerable('');
    setStatus(null);
  };

  const chooseIn = (symbol) => {
    if (tradeMode === 'sell') {
      setAsset(symbol);
    } else if (tradeMode === 'swap') {
      if (symbol === swapOut) setSwapOut(swapIn);
      setSwapIn(symbol);
    }
    setTolerableLocked(false);
    setStatus(null);
  };

  const chooseOut = (symbol) => {
    if (tradeMode === 'buy') {
      setAsset(symbol);
    } else if (tradeMode === 'swap') {
      if (symbol === swapIn) setSwapIn(swapOut);
      setSwapOut(symbol);
    }
    setTolerableLocked(false);
    setStatus(null);
  };

  const selectMode = (mode) => {
    if (mode === tradeMode) return;
    if (mode !== 'swap' && tradeMode === 'swap') {
      const nextAsset = swapOut !== 'ETH' ? swapOut : (swapIn !== 'ETH' ? swapIn : asset);
      setAsset(nextAsset);
    }
    if (mode === 'swap' && tradeMode === 'buy') {
      setSwapIn('ETH');
      setSwapOut(asset);
    }
    if (mode === 'swap' && tradeMode === 'sell') {
      setSwapIn(asset);
      setSwapOut('ETH');
    }
    setTradeMode(mode);
    resetQuoteInputs();
  };

  const openListed = (mode, symbol) => {
    if (tradeMode === mode && asset === symbol) return;
    setTradeMode(mode);
    setAsset(symbol);
    resetQuoteInputs();
  };

  const switchTokens = () => {
    const received = lastEdited === 'OUT'
      ? amountOut
      : (quote ? ethers.formatEther(quote.outWei) : '');
    if (tradeMode === 'buy') {
      setTradeMode('sell');
    } else if (tradeMode === 'sell') {
      setTradeMode('buy');
    } else {
      setSwapIn(swapOut);
      setSwapOut(swapIn);
    }
    setLastEdited('IN');
    setAmountIn(received);
    setAmountOut('');
    setTolerableLocked(false);
    setStatus(null);
  };

  const onSlippagePreset = (percent) => {
    setSlippagePercent(percent);
    setCustomSlippageInput('');
    setTolerableLocked(false);
  };

  const onCustomSlippage = (value) => {
    setCustomSlippageInput(value);
    const num = Number(value);
    if (value !== '' && Number.isFinite(num) && num >= 0 && num <= 50) {
      setSlippagePercent(num);
      setTolerableLocked(false);
    }
  };

  const typedAmount = tryParseEther(lastEdited === 'IN' ? amountIn : amountOut);
  const action = describeSwap({
    kind,
    pair,
    quote,
    lastEdited,
    tokenIn,
    tokenOut,
    spendIn,
    spendCap,
    balanceIn,
    balancesLoaded,
    ethBalance: balances.ETH ?? 0n,
    impact,
    tolerableLocked,
    customWei,
    minOutWei,
    maxInWei,
    phase,
    typedAmount,
    tradeMode,
  });

  const handleSwap = async () => {
    if (!action.ready || !signer || !tokens || !quote) return;
    setStatus(null);
    const path = [
      tokenIn === 'ETH' ? tokens.WETH : tokens[tokenIn],
      tokenOut === 'ETH' ? tokens.WETH : tokens[tokenOut],
    ];
    const ttl = deadline(20);

    try {
      if (kind === 'wrap') {
        setPhase(tokenIn === 'ETH' ? 'Wrapping ETH…' : 'Unwrapping WETH…');
        const weth = new ethers.Contract(tokens.WETH, ABIS.WETH, signer);
        const tx = tokenIn === 'ETH'
          ? await weth.deposit({ value: quote.inWei })
          : await weth.withdraw(quote.inWei);
        await tx.wait();
      } else if (!router) {
        throw new Error('Router is not available on this network.');
      } else {
        const routerAddress = await router.getAddress();
        if (tokenIn !== 'ETH') {
          setPhase(`Approving ${tokenIn}…`);
          const allowanceAmount = lastEdited === 'IN' ? quote.inWei : maxInWei;
          await ensureAllowance({
            tokenAddress: tokens[tokenIn],
            owner: account,
            spender: routerAddress,
            amount: allowanceAmount,
            signer,
          });
        }

        setPhase(tradeMode === 'buy' ? 'Buying…' : tradeMode === 'sell' ? 'Selling…' : 'Swapping…');
        let tx;
        if (tokenIn === 'ETH' && lastEdited === 'IN') {
          tx = await router.swapExactETHForTokens(minOutWei, path, account, ttl, { value: quote.inWei });
        } else if (tokenIn === 'ETH') {
          tx = await router.swapETHForExactTokens(quote.outWei, path, account, ttl, { value: maxInWei });
        } else if (tokenOut === 'ETH' && lastEdited === 'IN') {
          tx = await router.swapExactTokensForETH(quote.inWei, minOutWei, path, account, ttl);
        } else if (tokenOut === 'ETH') {
          tx = await router.swapTokensForExactETH(quote.outWei, maxInWei, path, account, ttl);
        } else if (lastEdited === 'IN') {
          tx = await router.swapExactTokensForTokens(quote.inWei, minOutWei, path, account, ttl);
        } else {
          tx = await router.swapTokensForExactTokens(quote.outWei, maxInWei, path, account, ttl);
        }
        await tx.wait();
      }

      setStatus({
        type: 'success',
        text: kind === 'wrap'
          ? (tokenIn === 'ETH' ? 'Wrapped ETH into WETH.' : 'Unwrapped WETH into ETH.')
          : tradeMode === 'buy'
            ? `Bought ${tokenOut} with ${tokenIn}.`
            : tradeMode === 'sell'
              ? `Sold ${tokenIn} for ${tokenOut}.`
              : `Swapped ${tokenIn} for ${tokenOut}.`,
      });
      setAmountIn('');
      setAmountOut('');
      setCustomTolerable('');
      setTolerableLocked(false);
      bumpData();
    } catch (err) {
      setStatus({ type: 'error', text: decodeRevert(err) });
    } finally {
      setPhase('');
    }
  };

  const poolName = `${underlyingSymbol(tokenIn)} / ${underlyingSymbol(tokenOut)}`;
  const rateBase = invertRate ? tokenOut : tokenIn;
  const rateQuote = invertRate ? tokenIn : tokenOut;
  const feeWei = quote ? (quote.inWei * 3n) / 1000n : 0n;
  const tolerableDisplay = lastEdited === 'IN'
    ? formatTokenAmount(minOutWei ?? 0n, 8)
    : formatTokenAmount(maxInWei ?? 0n, 8);

  return (
    <div className="glass-panel dex-card">
      <div className="card-head">
        <h2>{tradeMode === 'buy' ? 'Buy' : tradeMode === 'sell' ? 'Sell' : 'Swap'}</h2>
        <div className="card-head-actions">
          <span className="network-pill">{activeNetworkConfig.shortName}</span>
          <button
            type="button"
            className="btn-icon"
            aria-label="Swap settings"
            onClick={() => setShowSettings((open) => !open)}
          >
            <Settings size={17} />
          </button>
        </div>
      </div>

      <div className="segmented" role="tablist" aria-label="Trade type">
        {['buy', 'sell', 'swap'].map((mode) => (
          <button
            type="button"
            key={mode}
            role="tab"
            aria-selected={tradeMode === mode}
            className={tradeMode === mode ? 'is-active' : undefined}
            onClick={() => selectMode(mode)}
          >
            {mode === 'buy' ? 'Buy' : mode === 'sell' ? 'Sell' : 'Swap'}
          </button>
        ))}
      </div>
      <p className="trade-hint">
        {tradeMode === 'buy'
          ? (asset === 'WETH'
            ? 'Buying WETH wraps ETH at 1:1. 10X and AYO are bought from their ETH pools.'
            : `Spend ETH to buy ${asset}. The trade uses the ${asset}/WETH pool.`)
          : tradeMode === 'sell'
            ? (asset === 'WETH'
              ? 'Selling WETH unwraps it back into ETH.'
              : `Sell ${asset} for ETH from the ${asset}/WETH pool.`)
            : 'Swap any pair directly, including 10X for AYO.'}
      </p>

      <MarketList
        positions={positions}
        loading={pricesLoading}
        balances={balances}
        activeSymbol={tradeMode === 'swap' ? '' : asset}
        activeMode={tradeMode}
        ethUsd={ethUsd}
        ethUsdError={ethUsdError}
        onBuy={(symbol) => openListed('buy', symbol)}
        onSell={(symbol) => openListed('sell', symbol)}
      />

      {showSettings && kind === 'pool' ? (
        <div className="settings-panel">
          <div className="settings-row">
            <span>Slippage tolerance</span>
            <strong>{slippagePercent}%</strong>
          </div>
          <div className="slippage-row">
            {SLIPPAGE_PRESETS.map((preset) => (
              <button
                type="button"
                key={preset}
                className={`slippage-btn ${slippagePercent === preset && customSlippageInput === '' ? 'active' : ''}`}
                onClick={() => onSlippagePreset(preset)}
              >
                {preset}%
              </button>
            ))}
            <div className="slippage-custom">
              <input
                type="text"
                inputMode="decimal"
                placeholder="Custom"
                value={customSlippageInput}
                onChange={(event) => onCustomSlippage(event.target.value.replace(/[^\d.]/g, ''))}
              />
              <span>%</span>
            </div>
          </div>
          <div className="settings-split">
            <div className="settings-row">
              <span>{lastEdited === 'IN' ? 'Minimum received' : 'Maximum paid'}</span>
              {tolerableLocked ? (
                <button type="button" className="text-button" onClick={() => setTolerableLocked(false)}>
                  Reset to auto
                </button>
              ) : (
                <span className="muted">Auto</span>
              )}
            </div>
            <div className="tolerable-row">
              <input
                type="text"
                inputMode="decimal"
                value={tolerableLocked ? customTolerable : (quote ? formatTokenInput(lastEdited === 'IN' ? autoMinOut : autoMaxIn) : '')}
                onChange={(event) => {
                  setCustomTolerable(event.target.value.replace(/[^\d.]/g, ''));
                  setTolerableLocked(true);
                }}
              />
              <strong>{lastEdited === 'IN' ? tokenOut : tokenIn}</strong>
            </div>
          </div>
        </div>
      ) : null}

      {balanceError || pair.error ? (
        <StatusBanner type="warning">{balanceError || pair.error}</StatusBanner>
      ) : null}
      {status ? <StatusBanner type={status.type}>{status.text}</StatusBanner> : null}

      <AmountField
        label={tradeMode === 'sell' ? 'You sell' : 'You pay'}
        amount={shownIn}
        onAmount={(value) => {
          setLastEdited('IN');
          setAmountIn(value);
          setTolerableLocked(false);
          setStatus(null);
        }}
        symbol={tokenIn}
        onSymbol={chooseIn}
        balance={balanceIn}
        account={account}
        loading={kind === 'pool' && pair.loading}
        showQuickAmounts
        locked={tradeMode === 'buy'}
        options={tradeMode === 'sell' ? QUOTE_ASSETS : TRADABLE}
        fiat={dollarLabel(shownIn, tokenIn, positions, ethUsd)}
      />

      <div className="flip-row">
        <button
          type="button"
          className="flip-btn"
          onClick={switchTokens}
          aria-label={tradeMode === 'buy' ? 'Switch to sell' : tradeMode === 'sell' ? 'Switch to buy' : 'Switch tokens'}
        >
          <ArrowDown size={15} />
        </button>
      </div>

      <AmountField
        label={tradeMode === 'buy' ? 'You buy' : 'You receive'}
        amount={shownOut}
        onAmount={(value) => {
          setLastEdited('OUT');
          setAmountOut(value);
          setTolerableLocked(false);
          setStatus(null);
        }}
        symbol={tokenOut}
        onSymbol={chooseOut}
        balance={balances[tokenOut] ?? 0n}
        account={account}
        loading={kind === 'pool' && pair.loading}
        locked={tradeMode === 'sell'}
        options={tradeMode === 'buy' ? QUOTE_ASSETS : TRADABLE}
        fiat={dollarLabel(shownOut, tokenOut, positions, ethUsd)}
      />

      {rateValue != null ? (
        <div className="rate-row">
          <button type="button" className="rate-pill" onClick={() => setInvertRate((value) => !value)}>
            <span>
              1 {rateBase} ≈ {formatTokenAmount(rateValue, 6)} {rateQuote}
            </span>
            <ArrowUpDown size={12} />
          </button>
          <span className={`mode-pill ${lastEdited === 'IN' ? 'mode-exact-in' : 'mode-exact-out'}`}>
            {kind === 'wrap' ? 'Wrap' : lastEdited === 'IN' ? 'Exact pay' : 'Exact receive'}
          </span>
        </div>
      ) : null}

      {quote && kind === 'pool' ? (
        <div className="stat-box">
          <div className="stat-row">
            <span>Pool price</span>
            <span>
              {spot ? `1 ${tokenIn} = ${formatTokenAmount(spot, 6)} ${tokenOut}` : '—'}
              {dollarLabel('1', tokenIn, positions, ethUsd) ? ` · ${dollarLabel('1', tokenIn, positions, ethUsd)}` : ''}
            </span>
          </div>
          <div className="stat-row">
            <span>Price impact</span>
            <span className={impactClass(impact)}>{formatImpact(impact)}</span>
          </div>
          <div className="stat-row">
            <span>Reserves</span>
            <span>
              {formatTokenAmount(pair.reserveA)} {underlyingSymbol(tokenIn)}
              {' · '}
              {formatTokenAmount(pair.reserveB)} {underlyingSymbol(tokenOut)}
            </span>
          </div>
          <div className="stat-row">
            <span>{lastEdited === 'IN' ? 'Minimum received' : 'Maximum paid'}</span>
            <span>
              {tolerableDisplay} {lastEdited === 'IN' ? tokenOut : tokenIn}
            </span>
          </div>
          <div className="stat-row">
            <span>Liquidity provider fee (0.3%)</span>
            <span>{formatTokenAmount(feeWei, 6)} {tokenIn}</span>
          </div>
          <div className="stat-row">
            <span>Route</span>
            <span className="accent-text">{tokenIn} → {tokenOut} · {poolName}</span>
          </div>
        </div>
      ) : null}

      {quote && kind === 'wrap' ? (
        <StatusBanner type="info">
          {tokenIn === 'ETH'
            ? 'This wraps ETH into WETH at 1:1. It does not trade through a pool.'
            : 'This unwraps WETH back into ETH at 1:1. It does not trade through a pool.'}
        </StatusBanner>
      ) : null}

      {impact != null && impact >= IMPACT_WARN_BPS ? (
        <StatusBanner type="warning">
          Price impact is {formatImpact(impact)}. The {poolName} pool is thin relative to this trade.
        </StatusBanner>
      ) : null}

      <SwapButton
        account={account}
        isCorrectNetwork={isCorrectNetwork}
        networkName={activeNetworkConfig.name}
        onConnect={connectWallet}
        onSwitch={() => switchWalletToNetwork(selectedNetwork)}
        action={action}
        onSwap={handleSwap}
      />
    </div>
  );
}

function SwapButton({ account, isCorrectNetwork, networkName, onConnect, onSwitch, action, onSwap }) {
  if (!account) {
    return (
      <button type="button" className="btn btn-primary btn-block" onClick={onConnect}>
        Connect Wallet
      </button>
    );
  }
  if (!isCorrectNetwork) {
    return (
      <button type="button" className="btn btn-danger btn-block" onClick={onSwitch}>
        Switch Wallet to {networkName}
      </button>
    );
  }
  return (
    <button type="button" className="btn btn-primary btn-block" onClick={onSwap} disabled={!action.ready}>
      {action.label}
    </button>
  );
}

function describeSwap({
  kind,
  pair,
  quote,
  lastEdited,
  tokenIn,
  tokenOut,
  spendIn,
  spendCap,
  balanceIn,
  balancesLoaded,
  ethBalance,
  impact,
  tolerableLocked,
  customWei,
  minOutWei,
  maxInWei,
  phase,
  typedAmount,
  tradeMode,
}) {
  if (phase) return { ready: false, label: phase };
  if (kind === 'same') return { ready: false, label: 'Choose two different tokens' };
  if (kind === 'pool' && pair.loading && !pair.exists) return { ready: false, label: 'Loading pool…' };
  if (kind === 'pool' && pair.error) return { ready: false, label: 'Network unavailable' };
  if (typedAmount && typedAmount > 0n && kind === 'pool' && !pair.loading && !pair.exists) {
    return { ready: false, label: 'No pool for this pair' };
  }
  if (typedAmount && typedAmount > 0n && kind === 'pool' && !pair.loading && pair.reserveA === 0n) {
    return { ready: false, label: 'Pool has no liquidity' };
  }
  if (typedAmount && typedAmount > 0n && kind === 'pool' && !quote) {
    return { ready: false, label: lastEdited === 'OUT' ? 'Not enough liquidity' : 'Amount is too small' };
  }
  if (!quote) return { ready: false, label: 'Enter an amount' };
  if (spendIn > spendCap) {
    if (tokenIn === 'ETH' && spendIn <= balanceIn) {
      return { ready: false, label: 'Leave a little ETH for gas' };
    }
    return { ready: false, label: `Insufficient ${tokenIn} balance` };
  }
  if (balancesLoaded && tokenIn !== 'ETH' && ethBalance === 0n) {
    return { ready: false, label: 'You need ETH for gas' };
  }
  if (kind === 'pool' && tolerableLocked) {
    if (customWei == null) {
      return { ready: false, label: lastEdited === 'IN' ? 'Enter a valid minimum' : 'Enter a valid maximum' };
    }
    if (lastEdited === 'IN' && customWei > quote.outWei) {
      return { ready: false, label: 'Minimum is above the quote' };
    }
    if (lastEdited === 'OUT' && customWei < quote.inWei) {
      return { ready: false, label: 'Maximum is below the quote' };
    }
  }
  if (kind === 'pool' && (minOutWei == null || maxInWei == null)) {
    return { ready: false, label: 'Enter a valid slippage limit' };
  }
  if (kind === 'wrap') {
    return { ready: true, label: tokenIn === 'ETH' ? 'Wrap ETH' : 'Unwrap WETH' };
  }
  if (impact != null && impact >= IMPACT_HIGH_BPS) {
    if (tradeMode === 'buy') return { ready: true, label: 'Buy anyway' };
    if (tradeMode === 'sell') return { ready: true, label: 'Sell anyway' };
    return { ready: true, label: 'Swap anyway' };
  }
  if (tradeMode === 'buy') return { ready: true, label: `Buy ${tokenOut}` };
  if (tradeMode === 'sell') return { ready: true, label: `Sell ${tokenIn}` };
  return { ready: true, label: `Swap ${tokenIn} for ${tokenOut}` };
}

function dollarLabel(amountText, symbol, positions, ethUsd) {
  const wei = tryParseEther(amountText);
  if (wei == null || wei === 0n) return '';
  return formatUsdScaled(usdScaled(wei, ethPerWholeToken(symbol, positions), ethUsd)) ?? '';
}

function MarketList({ positions, loading, balances, activeSymbol, activeMode, ethUsd, ethUsdError, onBuy, onSell }) {
  const ethLabel = formatUsdScaled(usdScaled(10n ** 18n, 10n ** 18n, ethUsd));
  return (
    <div className="market-list">
      <p className="trade-hint">
        {ethLabel ? `ETH ${ethLabel}` : ethUsdError ? ethUsdError : 'Loading the ETH dollar price…'}
      </p>
      {LISTED.map((symbol) => {
        const pool = positions.find((position) => position.base === symbol && position.quote === 'WETH');
        const price = pool?.exists ? spotOutPerIn(pool.reserveBase, pool.reserveQuote) : null;
        const unitUsd = price ? formatUsdScaled(usdScaled(10n ** 18n, price, ethUsd)) : null;
        const held = balances[symbol] ?? 0n;
        const active = activeSymbol === symbol && (activeMode === 'buy' || activeMode === 'sell');
        return (
          <div key={symbol} className={active ? 'market-row is-active' : 'market-row'}>
            <div>
              <strong>{symbol}</strong>
              <p>
                {loading && !pool?.exists
                  ? 'Loading price…'
                  : price
                    ? `1 ${symbol} = ${formatTokenAmount(price, 6)} ETH${unitUsd ? ` · ${unitUsd}` : ''}`
                    : 'No ETH pool yet'}
                {held > 0n ? ` · You hold ${formatTokenAmount(held)}` : ''}
              </p>
            </div>
            <div className="market-actions">
              <button type="button" className="chip chip-accent" onClick={() => onBuy(symbol)}>
                Buy
              </button>
              <button type="button" className="chip" onClick={() => onSell(symbol)}>
                Sell
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function impactClass(impact) {
  if (impact == null) return '';
  if (impact >= IMPACT_HIGH_BPS) return 'impact-high';
  if (impact >= IMPACT_WARN_BPS) return 'impact-warn';
  return '';
}
