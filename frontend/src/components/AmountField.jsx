import { Wallet } from 'lucide-react';
import TokenSelect from './TokenSelect';
import { ethers } from 'ethers';
import { formatTokenAmount, maxSpendableEth, sanitizeAmount } from '../utils/dexMath';

export default function AmountField({
  label,
  amount,
  onAmount,
  symbol,
  onSymbol,
  balance,
  account,
  loading,
  showQuickAmounts,
}) {
  const spendable = symbol === 'ETH' ? maxSpendableEth(balance ?? 0n) : (balance ?? 0n);

  const fill = (value) => {
    if (typeof value !== 'bigint' || value <= 0n) return;
    onAmount(ethers.formatEther(value));
  };

  return (
    <div className="input-container">
      <div className="amount-meta">
        <span className="amount-label">
          {label}
          {loading ? <em> fetching pool…</em> : null}
        </span>
        {account ? (
          <div className="amount-balance">
            <Wallet size={12} />
            <span>Balance: {formatTokenAmount(balance ?? 0n)}</span>
            {showQuickAmounts ? (
              <>
                <button type="button" className="chip" onClick={() => fill(spendable / 2n)}>
                  50%
                </button>
                <button type="button" className="chip chip-accent" onClick={() => fill(spendable)}>
                  MAX
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="amount-row">
        <input
          type="text"
          inputMode="decimal"
          placeholder="0"
          className="token-input"
          value={amount}
          onChange={(event) => onAmount(sanitizeAmount(event.target.value))}
          autoComplete="off"
        />
        <TokenSelect symbol={symbol} onChange={onSymbol} />
      </div>
    </div>
  );
}
