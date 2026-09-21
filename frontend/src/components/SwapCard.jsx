import React, { useState, useEffect } from 'react';
import { ArrowDown, Wallet, AlertCircle } from 'lucide-react';
import { ethers } from 'ethers';
import { useWeb3 } from '../hooks/useWeb3';
import { ABIS } from '../utils/contracts';

export default function SwapCard() {
  const {
    account,
    connectWallet,
    router,
    signer,
    readProvider,
    tokens,
    isCorrectNetwork,
    selectedNetwork,
    activeNetworkConfig,
    switchWalletToNetwork,
  } = useWeb3();

  const [tokenInSymbol, setTokenInSymbol] = useState('10X');
  const [tokenOutSymbol, setTokenOutSymbol] = useState('AYO');
  const [amountIn, setAmountIn] = useState('');
  const [amountOut, setAmountOut] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [balanceIn, setBalanceIn] = useState('0');
  const [balanceOut, setBalanceOut] = useState('0');
  const [isNodeOffline, setIsNodeOffline] = useState(false);

  // Fetch balances for selected tokens
  useEffect(() => {
    let isMounted = true;
    const fetchBalances = async () => {
      if (!account || !tokens) return;
      const targetProvider = (signer && isCorrectNetwork) ? signer : readProvider;
      if (!targetProvider) return;

      try {
        const inAddr = tokens[tokenInSymbol];
        const outAddr = tokens[tokenOutSymbol];
        if (inAddr && outAddr) {
          const tokenInContract = new ethers.Contract(inAddr, ABIS.ERC20, targetProvider);
          const tokenOutContract = new ethers.Contract(outAddr, ABIS.ERC20, targetProvider);
          const [bIn, bOut] = await Promise.all([
            tokenInContract.balanceOf(account),
            tokenOutContract.balanceOf(account),
          ]);
          if (isMounted) {
            setBalanceIn(ethers.formatEther(bIn));
            setBalanceOut(ethers.formatEther(bOut));
            setIsNodeOffline(false);
          }
        }
      } catch (err) {
        if (isMounted) {
          setBalanceIn('0');
          setBalanceOut('0');
          if (selectedNetwork === 'anvil') {
            setIsNodeOffline(true);
          }
        }
      }
    };

    fetchBalances();
    const timer = setInterval(fetchBalances, 10000);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [account, signer, isCorrectNetwork, readProvider, tokenInSymbol, tokenOutSymbol, tokens, selectedNetwork]);

  // Auto-calculate expected output
  useEffect(() => {
    const fetchQuote = async () => {
      if (!amountIn || !router || isNaN(amountIn) || Number(amountIn) <= 0 || !tokens) {
        setAmountOut('');
        return;
      }
      try {
        const parsedAmount = ethers.parseEther(amountIn);
        const path = [tokens[tokenInSymbol], tokens[tokenOutSymbol]];
        const amounts = await router.getAmountsOut(parsedAmount, path);
        setAmountOut(ethers.formatEther(amounts[1]));
        setIsNodeOffline(false);
      } catch (err) {
        setAmountOut('');
        if (selectedNetwork === 'anvil') {
          setIsNodeOffline(true);
        }
      }
    };
    const timeout = setTimeout(fetchQuote, 400);
    return () => clearTimeout(timeout);
  }, [amountIn, tokenInSymbol, tokenOutSymbol, router, tokens, selectedNetwork]);

  const switchTokens = () => {
    setTokenInSymbol(tokenOutSymbol);
    setTokenOutSymbol(tokenInSymbol);
    setAmountIn('');
    setAmountOut('');
  };

  const handleMaxClick = () => {
    if (balanceIn && Number(balanceIn) > 0) {
      setAmountIn(balanceIn);
    }
  };

  const handleSwap = async () => {
    if (!router || !signer || !tokens) return;
    try {
      setIsSwapping(true);
      const parsedAmountIn = ethers.parseEther(amountIn);
      const amountOutMin = (ethers.parseEther(amountOut) * 995n) / 1000n;
      const path = [tokens[tokenInSymbol], tokens[tokenOutSymbol]];
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

      // 1. Approve router to spend tokenIn
      setIsApproving(true);
      const tokenContract = new ethers.Contract(tokens[tokenInSymbol], ABIS.ERC20, signer);
      const allowance = await tokenContract.allowance(account, await router.getAddress());

      if (allowance < parsedAmountIn) {
        const txApprove = await tokenContract.approve(await router.getAddress(), ethers.MaxUint256);
        await txApprove.wait();
      }
      setIsApproving(false);

      // 2. Execute Swap
      const tx = await router.swapExactTokensForTokens(
        parsedAmountIn,
        amountOutMin,
        path,
        account,
        deadline
      );
      await tx.wait();
      alert(`Swap successful on ${activeNetworkConfig.name}!`);
      setAmountIn('');
      setAmountOut('');
    } catch (err) {
      console.error("Swap failed:", err);
      alert('Swap failed. Check console for details.');
    } finally {
      setIsApproving(false);
      setIsSwapping(false);
    }
  };

  const formatBalance = (val) => {
    if (!val || isNaN(val)) return '0.00';
    const num = parseFloat(val);
    if (num === 0) return '0.00';
    if (num < 0.0001) return '< 0.0001';
    return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
  };

  return (
    <div className="glass-panel" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Swap</h2>
        <span style={{
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
          background: 'rgba(255, 255, 255, 0.05)',
          padding: '4px 10px',
          borderRadius: '12px',
        }}>
          {activeNetworkConfig.shortName}
        </span>
      </div>

      {isNodeOffline && selectedNetwork === 'anvil' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 14px',
          borderRadius: '12px',
          background: 'rgba(234, 179, 8, 0.12)',
          border: '1px solid rgba(234, 179, 8, 0.3)',
          color: '#fde047',
          fontSize: '0.85rem',
          marginBottom: '16px',
        }}>
          <AlertCircle size={16} />
          <span>Local Anvil node not detected at 127.0.0.1:8545. Run <code>anvil</code> in terminal or switch to Sepolia.</span>
        </div>
      )}

      {/* Input */}
      <div className="input-container" style={{ marginBottom: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>You pay</span>
          {account && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <Wallet size={12} />
              <span>Balance: {formatBalance(balanceIn)}</span>
              <button
                onClick={handleMaxClick}
                style={{
                  background: 'rgba(139, 92, 246, 0.2)',
                  border: 'none',
                  borderRadius: '6px',
                  color: 'var(--accent-primary)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '2px 6px',
                  cursor: 'pointer',
                }}
              >
                MAX
              </button>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input
            type="number"
            placeholder="0"
            className="token-input"
            value={amountIn}
            onChange={(e) => setAmountIn(e.target.value)}
          />
          <button className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '12px' }}>
            {tokenInSymbol}
          </button>
        </div>
      </div>

      {/* Arrow Switch */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: '-12px 0', position: 'relative', zIndex: 2 }}>
        <div
          onClick={switchTokens}
          style={{
            background: 'var(--panel-bg)',
            padding: '8px',
            borderRadius: '12px',
            border: '1px solid var(--panel-border)',
            cursor: 'pointer',
            transition: 'transform 0.2s',
          }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
          title="Switch Tokens"
        >
          <ArrowDown size={16} color="var(--text-secondary)" />
        </div>
      </div>

      {/* Output */}
      <div className="input-container" style={{ marginTop: '4px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>You receive</span>
          {account && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <Wallet size={12} />
              <span>Balance: {formatBalance(balanceOut)}</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="0"
            className="token-input"
            value={amountOut ? parseFloat(amountOut).toFixed(4) : ''}
            readOnly
          />
          <button className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '12px' }}>
            {tokenOutSymbol}
          </button>
        </div>
      </div>

      {/* Action Button */}
      {!account ? (
        <button
          className="btn btn-primary"
          style={{ width: '100%', padding: '16px', fontSize: '1.1rem' }}
          onClick={connectWallet}
        >
          Connect Wallet
        </button>
      ) : !isCorrectNetwork ? (
        <button
          className="btn btn-primary"
          style={{
            width: '100%',
            padding: '16px',
            fontSize: '1rem',
            background: 'linear-gradient(135deg, #ef4444, #f97316)',
          }}
          onClick={() => switchWalletToNetwork(selectedNetwork)}
        >
          Switch Wallet to {activeNetworkConfig.name}
        </button>
      ) : !amountIn || Number(amountIn) <= 0 ? (
        <button className="btn btn-secondary" style={{ width: '100%', padding: '16px', fontSize: '1.1rem' }} disabled>
          Enter an amount
        </button>
      ) : (
        <button
          className="btn btn-primary"
          style={{ width: '100%', padding: '16px', fontSize: '1.1rem' }}
          onClick={handleSwap}
          disabled={isSwapping || isApproving || !amountOut}
        >
          {isApproving ? 'Approving...' : isSwapping ? 'Swapping...' : `Swap on ${activeNetworkConfig.shortName}`}
        </button>
      )}
    </div>
  );
}
