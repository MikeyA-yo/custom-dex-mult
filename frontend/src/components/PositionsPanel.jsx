import { useState } from 'react';
import { useWeb3 } from '../hooks/useWeb3';
import { usePositions } from '../hooks/useMarket';
import { ensureAllowance } from '../utils/dexTx';
import {
  applySlippageDown,
  deadline,
  decodeRevert,
  formatShare,
  formatTokenAmount,
} from '../utils/dexMath';
import StatusBanner from './StatusBanner';

const PERCENTS = [25, 50, 75, 100];

export default function PositionsPanel() {
  const { positions, loading, error } = usePositions();
  const [status, setStatus] = useState(null);

  return (
    <div className="positions">
      <p className="lede">
        Liquidity providers earn a 0.3% fee on every swap. The fee stays in the pool and increases your share of the reserves.
      </p>
      {error ? <StatusBanner type="warning">{error}</StatusBanner> : null}
      {status ? <StatusBanner type={status.type}>{status.text}</StatusBanner> : null}
      {loading && positions.every((position) => !position.exists) ? (
        <p className="muted">Loading pools…</p>
      ) : null}
      {positions.map((position) => (
        <PositionCard
          key={`${position.base}-${position.quote}`}
          position={position}
          onStatus={setStatus}
        />
      ))}
    </div>
  );
}

function PositionCard({ position, onStatus }) {
  const {
    account,
    connectWallet,
    signer,
    router,
    tokens,
    isCorrectNetwork,
    selectedNetwork,
    switchWalletToNetwork,
    activeNetworkConfig,
    bumpData,
  } = useWeb3();
  const [percent, setPercent] = useState(100);
  const [receiveEth, setReceiveEth] = useState(true);
  const [phase, setPhase] = useState('');

  const hasWeth = position.base === 'WETH' || position.quote === 'WETH';
  const liquidity = (position.lpBalance * BigInt(percent)) / 100n;
  const outBase = position.totalSupply > 0n ? (liquidity * position.reserveBase) / position.totalSupply : 0n;
  const outQuote = position.totalSupply > 0n ? (liquidity * position.reserveQuote) / position.totalSupply : 0n;
  const hasPosition = position.lpBalance > 0n;

  const remove = async () => {
    if (!signer || !router || !tokens || liquidity === 0n) return;
    onStatus(null);
    const minBase = applySlippageDown(outBase, 0.5);
    const minQuote = applySlippageDown(outQuote, 0.5);
    const ttl = deadline(20);
    try {
      setPhase('Approving LP token…');
      const routerAddress = await router.getAddress();
      await ensureAllowance({
        tokenAddress: position.pairAddress,
        owner: account,
        spender: routerAddress,
        amount: liquidity,
        signer,
      });
      setPhase('Removing liquidity…');
      let tx;
      if (receiveEth && hasWeth) {
        const wethIsBase = position.base === 'WETH';
        const tokenSymbol = wethIsBase ? position.quote : position.base;
        tx = await router.removeLiquidityETH(
          tokens[tokenSymbol],
          liquidity,
          wethIsBase ? minQuote : minBase,
          wethIsBase ? minBase : minQuote,
          account,
          ttl,
        );
      } else {
        tx = await router.removeLiquidity(
          tokens[position.base],
          tokens[position.quote],
          liquidity,
          minBase,
          minQuote,
          account,
          ttl,
        );
      }
      await tx.wait();
      const outQuoteLabel = receiveEth && position.quote === 'WETH' ? 'ETH' : position.quote;
      const outBaseLabel = receiveEth && position.base === 'WETH' ? 'ETH' : position.base;
      onStatus({
        type: 'success',
        text: `Removed liquidity. About ${formatTokenAmount(outBase)} ${outBaseLabel} and ${formatTokenAmount(outQuote)} ${outQuoteLabel} were sent to your wallet.`,
      });
      bumpData();
    } catch (err) {
      onStatus({ type: 'error', text: decodeRevert(err) });
    } finally {
      setPhase('');
    }
  };

  return (
    <article className="position-card">
      <header className="position-head">
        <h3>{position.base} / {position.quote}</h3>
        <span>{hasPosition ? `Your share ${formatShare(position.lpBalance, position.totalSupply)}` : 'No position'}</span>
      </header>

      {!position.exists ? (
        <p className="muted">This pool has not been created yet.</p>
      ) : (
        <div className="stat-box">
          <div className="stat-row">
            <span>Pool reserves</span>
            <span>
              {formatTokenAmount(position.reserveBase)} {position.base}
              {' · '}
              {formatTokenAmount(position.reserveQuote)} {position.quote}
            </span>
          </div>
          <div className="stat-row">
            <span>Your LP tokens</span>
            <span>{formatTokenAmount(position.lpBalance)}</span>
          </div>
          {hasPosition ? (
            <div className="stat-row">
              <span>Underlying</span>
              <span>
                {formatTokenAmount((position.lpBalance * position.reserveBase) / position.totalSupply)} {position.base}
                {' · '}
                {formatTokenAmount((position.lpBalance * position.reserveQuote) / position.totalSupply)} {position.quote}
              </span>
            </div>
          ) : null}
        </div>
      )}

      {hasPosition ? (
        <div className="remove-box">
          <div className="percent-row">
            {PERCENTS.map((value) => (
              <button
                type="button"
                key={value}
                className={`slippage-btn ${percent === value ? 'active' : ''}`}
                onClick={() => setPercent(value)}
              >
                {value === 100 ? 'MAX' : `${value}%`}
              </button>
            ))}
          </div>
          {hasWeth ? (
            <label className="check-row">
              <input
                type="checkbox"
                checked={receiveEth}
                onChange={(event) => setReceiveEth(event.target.checked)}
              />
              Receive ETH instead of WETH
            </label>
          ) : null}
          <p className="preview">
            You receive about {formatTokenAmount(outBase)} {receiveEth && position.base === 'WETH' ? 'ETH' : position.base}
            {' and '}
            {formatTokenAmount(outQuote)} {receiveEth && position.quote === 'WETH' ? 'ETH' : position.quote}.
            Slippage tolerance is 0.5%.
          </p>
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
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={remove}
              disabled={Boolean(phase) || liquidity === 0n || outBase === 0n || outQuote === 0n}
            >
              {phase || 'Remove liquidity'}
            </button>
          )}
        </div>
      ) : null}
    </article>
  );
}
