import { useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { ethers } from 'ethers';
import { useWeb3 } from '../hooks/useWeb3';
import { useBalances, usePair } from '../hooks/useMarket';
import { ensureAllowance } from '../utils/dexTx';
import { pairKind, underlyingSymbol } from '../utils/tokens';
import {
  applySlippageDown,
  deadline,
  decodeRevert,
  formatShare,
  formatTokenAmount,
  maxSpendableEth,
  quoteLiquidity,
  spotOutPerIn,
  tryParseEther,
} from '../utils/dexMath';
import AmountField from './AmountField';
import PositionsPanel from './PositionsPanel';
import StatusBanner from './StatusBanner';

export default function PoolCard() {
  const [mode, setMode] = useState('add');
  const { activeNetworkConfig } = useWeb3();

  return (
    <div className="glass-panel dex-card">
      <div className="card-head">
        <h2>{mode === 'add' ? 'Add liquidity' : 'Your liquidity'}</h2>
        <span className="network-pill">{activeNetworkConfig.shortName}</span>
      </div>
      <div className="segmented" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'add'}
          className={mode === 'add' ? 'is-active' : undefined}
          onClick={() => setMode('add')}
        >
          Add
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'positions'}
          className={mode === 'positions' ? 'is-active' : undefined}
          onClick={() => setMode('positions')}
        >
          Positions
        </button>
      </div>
      {mode === 'add' ? <AddLiquidity /> : <PositionsPanel />}
    </div>
  );
}

function AddLiquidity() {
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

  const [tokenA, setTokenA] = useState('10X');
  const [tokenB, setTokenB] = useState('AYO');
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');
  const [lastEdited, setLastEdited] = useState('A');
  const [phase, setPhase] = useState('');
  const [status, setStatus] = useState(null);

  const { balances, error: balanceError, loaded: balancesLoaded } = useBalances();
  const pair = usePair(tokenA, tokenB);
  const kind = pairKind(tokenA, tokenB);
  const poolEmpty = kind === 'pool' && (!pair.exists || pair.reserveA === 0n || pair.reserveB === 0n);
  const ratioKnown = kind === 'pool' && pair.exists && pair.reserveA > 0n && pair.reserveB > 0n;

  const deposit = depositAmounts({
    amountA,
    amountB,
    lastEdited,
    ratioKnown,
    reserveA: pair.reserveA,
    reserveB: pair.reserveB,
  });

  const shownA = ratioKnown && lastEdited === 'B' && deposit
    ? ethers.formatEther(deposit.a)
    : amountA;
  const shownB = ratioKnown && lastEdited === 'A' && deposit
    ? ethers.formatEther(deposit.b)
    : amountB;

  const spot = ratioKnown ? spotOutPerIn(pair.reserveA, pair.reserveB) : null;
  const opening = !ratioKnown && deposit && deposit.a > 0n
    ? (deposit.b * 10n ** 18n) / deposit.a
    : null;

  const chooseA = (symbol) => {
    if (symbol === tokenB) setTokenB(tokenA);
    setTokenA(symbol);
    setAmountA('');
    setAmountB('');
    setStatus(null);
  };

  const chooseB = (symbol) => {
    if (symbol === tokenA) setTokenA(tokenB);
    setTokenB(symbol);
    setAmountA('');
    setAmountB('');
    setStatus(null);
  };

  const flip = () => {
    const nextAmount = ratioKnown ? shownB : amountB;
    const otherAmount = ratioKnown ? '' : amountA;
    setTokenA(tokenB);
    setTokenB(tokenA);
    setLastEdited('A');
    setAmountA(nextAmount);
    setAmountB(otherAmount);
    setStatus(null);
  };

  const action = describeAdd({
    kind,
    pair,
    deposit,
    tokenA,
    tokenB,
    balances,
    balancesLoaded,
    phase,
  });

  const handleAdd = async () => {
    if (!action.ready || !router || !signer || !tokens || !deposit) return;
    setStatus(null);
    const minA = applySlippageDown(deposit.a, 0.5);
    const minB = applySlippageDown(deposit.b, 0.5);
    const ttl = deadline(20);
    try {
      const routerAddress = await router.getAddress();
      if (tokenA === 'ETH' || tokenB === 'ETH') {
        const ethIsA = tokenA === 'ETH';
        const tokenSymbol = ethIsA ? tokenB : tokenA;
        const tokenAmount = ethIsA ? deposit.b : deposit.a;
        const ethAmount = ethIsA ? deposit.a : deposit.b;
        const tokenMin = ethIsA ? minB : minA;
        const ethMin = ethIsA ? minA : minB;
        setPhase(`Approving ${tokenSymbol}…`);
        await ensureAllowance({
          tokenAddress: tokens[tokenSymbol],
          owner: account,
          spender: routerAddress,
          amount: tokenAmount,
          signer,
        });
        setPhase('Adding liquidity…');
        const tx = await router.addLiquidityETH(
          tokens[tokenSymbol],
          tokenAmount,
          tokenMin,
          ethMin,
          account,
          ttl,
          { value: ethAmount },
        );
        await tx.wait();
      } else {
        setPhase(`Approving ${tokenA}…`);
        await ensureAllowance({
          tokenAddress: tokens[tokenA],
          owner: account,
          spender: routerAddress,
          amount: deposit.a,
          signer,
        });
        setPhase(`Approving ${tokenB}…`);
        await ensureAllowance({
          tokenAddress: tokens[tokenB],
          owner: account,
          spender: routerAddress,
          amount: deposit.b,
          signer,
        });
        setPhase('Adding liquidity…');
        const tx = await router.addLiquidity(
          tokens[tokenA],
          tokens[tokenB],
          deposit.a,
          deposit.b,
          minA,
          minB,
          account,
          ttl,
        );
        await tx.wait();
      }
      setStatus({ type: 'success', text: `Deposited ${tokenA} and ${tokenB} into the pool.` });
      setAmountA('');
      setAmountB('');
      bumpData();
    } catch (err) {
      setStatus({ type: 'error', text: decodeRevert(err) });
    } finally {
      setPhase('');
    }
  };

  const poolLabel = `${underlyingSymbol(tokenA)} / ${underlyingSymbol(tokenB)}`;

  return (
    <div className="add-liquidity">
      <p className="lede">
        Deposit both tokens at the pool price. Liquidity providers earn a 0.3% fee on every swap in this pool.
      </p>
      {balanceError ? <StatusBanner type="warning">{balanceError}</StatusBanner> : null}
      {pair.error ? <StatusBanner type="warning">{pair.error}</StatusBanner> : null}
      {status ? <StatusBanner type={status.type}>{status.text}</StatusBanner> : null}
      {kind === 'wrap' ? (
        <StatusBanner type="info">
          ETH and WETH are the same asset. Wrap on the Swap tab. A liquidity pool needs 10X or AYO on one side.
        </StatusBanner>
      ) : null}
      {kind === 'pool' && poolEmpty && !pair.loading ? (
        <StatusBanner type="warning">
          This pool is empty. The amounts you deposit set the starting price.
        </StatusBanner>
      ) : null}
      {kind === 'pool' && (tokenA === 'ETH' || tokenB === 'ETH') ? (
        <StatusBanner type="info">
          ETH is wrapped into WETH and deposited in the {poolLabel} pool.
        </StatusBanner>
      ) : null}

      <AmountField
        label="Deposit"
        amount={shownA}
        onAmount={(value) => {
          setLastEdited('A');
          setAmountA(value);
          setStatus(null);
        }}
        symbol={tokenA}
        onSymbol={chooseA}
        balance={balances[tokenA] ?? 0n}
        account={account}
        loading={kind === 'pool' && pair.loading}
        showQuickAmounts
      />

      <div className="flip-row">
        <button type="button" className="flip-btn" onClick={flip} aria-label="Switch tokens">
          <ArrowDown size={15} />
        </button>
      </div>

      <AmountField
        label="Deposit"
        amount={shownB}
        onAmount={(value) => {
          setLastEdited('B');
          setAmountB(value);
          setStatus(null);
        }}
        symbol={tokenB}
        onSymbol={chooseB}
        balance={balances[tokenB] ?? 0n}
        account={account}
        loading={kind === 'pool' && pair.loading}
        showQuickAmounts
      />

      {kind === 'pool' && ratioKnown ? (
        <div className="stat-box">
          <div className="stat-row">
            <span>Pool price</span>
            <span>1 {tokenA} = {formatTokenAmount(spot ?? 0n, 6)} {tokenB}</span>
          </div>
          <div className="stat-row">
            <span>Reserves</span>
            <span>
              {formatTokenAmount(pair.reserveA)} {underlyingSymbol(tokenA)}
              {' · '}
              {formatTokenAmount(pair.reserveB)} {underlyingSymbol(tokenB)}
            </span>
          </div>
          {pair.lpBalance > 0n ? (
            <div className="stat-row">
              <span>Your share</span>
              <span>{formatShare(pair.lpBalance, pair.totalSupply)}</span>
            </div>
          ) : null}
          <div className="stat-row">
            <span>Slippage tolerance</span>
            <span>0.5%</span>
          </div>
        </div>
      ) : null}

      {opening != null ? (
        <div className="stat-box">
          <div className="stat-row">
            <span>Starting price</span>
            <span>1 {tokenA} = {formatTokenAmount(opening, 6)} {tokenB}</span>
          </div>
        </div>
      ) : null}

      {!account ? (
        <button type="button" className="btn btn-primary btn-block" onClick={connectWallet}>
          Connect Wallet
        </button>
      ) : !isCorrectNetwork ? (
        <button
          type="button"
          className="btn btn-danger btn-block"
          onClick={() => switchWalletToNetwork(selectedNetwork)}
        >
          Switch Wallet to {activeNetworkConfig.name}
        </button>
      ) : (
        <button type="button" className="btn btn-primary btn-block" onClick={handleAdd} disabled={!action.ready}>
          {action.label}
        </button>
      )}
    </div>
  );
}

function depositAmounts({ amountA, amountB, lastEdited, ratioKnown, reserveA, reserveB }) {
  if (ratioKnown) {
    if (lastEdited === 'A') {
      const a = tryParseEther(amountA);
      if (a == null || a === 0n) return null;
      const b = quoteLiquidity(a, reserveA, reserveB);
      return b ? { a, b } : null;
    }
    const b = tryParseEther(amountB);
    if (b == null || b === 0n) return null;
    const a = quoteLiquidity(b, reserveB, reserveA);
    return a ? { a, b } : null;
  }
  const a = tryParseEther(amountA);
  const b = tryParseEther(amountB);
  if (a == null || b == null || a === 0n || b === 0n) return null;
  return { a, b };
}

function describeAdd({ kind, pair, deposit, tokenA, tokenB, balances, balancesLoaded, phase }) {
  if (phase) return { ready: false, label: phase };
  if (kind === 'same') return { ready: false, label: 'Choose two different tokens' };
  if (kind === 'wrap') return { ready: false, label: 'Pick a pool token' };
  if (kind === 'pool' && pair.loading && !pair.exists) return { ready: false, label: 'Loading pool…' };
  if (pair.error) return { ready: false, label: 'Network unavailable' };
  if (!deposit) return { ready: false, label: 'Enter an amount' };

  const cap = (symbol) => (symbol === 'ETH' ? maxSpendableEth(balances.ETH ?? 0n) : (balances[symbol] ?? 0n));
  if (deposit.a > cap(tokenA)) {
    if (tokenA === 'ETH' && deposit.a <= (balances.ETH ?? 0n)) {
      return { ready: false, label: 'Leave a little ETH for gas' };
    }
    return { ready: false, label: `Insufficient ${tokenA} balance` };
  }
  if (deposit.b > cap(tokenB)) {
    if (tokenB === 'ETH' && deposit.b <= (balances.ETH ?? 0n)) {
      return { ready: false, label: 'Leave a little ETH for gas' };
    }
    return { ready: false, label: `Insufficient ${tokenB} balance` };
  }
  const paysEth = tokenA === 'ETH' || tokenB === 'ETH';
  if (balancesLoaded && !paysEth && (balances.ETH ?? 0n) === 0n) {
    return { ready: false, label: 'You need ETH for gas' };
  }
  return { ready: true, label: 'Add liquidity' };
}
