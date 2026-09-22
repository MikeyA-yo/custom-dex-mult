import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ArrowDown, ArrowUpDown, Wallet, Settings, AlertCircle, Check } from 'lucide-react';
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

  // Tokens selection
  const [tokenInSymbol, setTokenInSymbol] = useState('10X');
  const [tokenOutSymbol, setTokenOutSymbol] = useState('AYO');

  // Input states & bidirectional tracking
  const [amountIn, setAmountIn] = useState('');
  const [amountOut, setAmountOut] = useState('');
  const [lastEdited, setLastEdited] = useState('IN'); // 'IN' | 'OUT'
  const [isQuoting, setIsQuoting] = useState(false);

  // Slippage states
  const [slippagePercent, setSlippagePercent] = useState(0.5); // default 0.5%
  const [customSlippageInput, setCustomSlippageInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  // User tolerable limit slot ("input max/min tolerable amount as well due to slippage")
  const [customTolerableAmount, setCustomTolerableAmount] = useState('');
  const [isCustomTolerableLocked, setIsCustomTolerableLocked] = useState(false);

  // Rate invert display: true shows 1 tokenIn = X tokenOut, false shows 1 tokenOut = Y tokenIn
  const [invertRate, setInvertRate] = useState(false);

  // Tx states
  const [isApproving, setIsApproving] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [balanceIn, setBalanceIn] = useState('0');
  const [balanceOut, setBalanceOut] = useState('0');
  const [isNodeOffline, setIsNodeOffline] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  // Reference for debouncing quote queries
  const quoteTimerRef = useRef(null);

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
    const timer = setInterval(fetchBalances, 8000);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [account, signer, isCorrectNetwork, readProvider, tokenInSymbol, tokenOutSymbol, tokens, selectedNetwork]);

  // Two-Way Price Quote Calculation
  useEffect(() => {
    if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);

    if (!router || !tokens) return;

    const inAddr = tokens[tokenInSymbol];
    const outAddr = tokens[tokenOutSymbol];
    if (!inAddr || !outAddr) return;

    const path = [inAddr, outAddr];

    // If active input is EMPTY or 0
    if (lastEdited === 'IN') {
      if (!amountIn || isNaN(amountIn) || Number(amountIn) <= 0) {
        setAmountOut('');
        setIsQuoting(false);
        if (!isCustomTolerableLocked) setCustomTolerableAmount('');
        return;
      }
    } else {
      if (!amountOut || isNaN(amountOut) || Number(amountOut) <= 0) {
        setAmountIn('');
        setIsQuoting(false);
        if (!isCustomTolerableLocked) setCustomTolerableAmount('');
        return;
      }
    }

    setIsQuoting(true);

    quoteTimerRef.current = setTimeout(async () => {
      try {
        if (lastEdited === 'IN') {
          // Calculate expected amountOut from given amountIn
          const parsedIn = ethers.parseEther(amountIn);
          const amounts = await router.getAmountsOut(parsedIn, path);
          const outEther = ethers.formatEther(amounts[1]);
          setAmountOut(outEther);

          // Update tolerable slot automatically if user hasn't typed a custom override
          if (!isCustomTolerableLocked) {
            const minTolerable = (parseFloat(outEther) * (1 - slippagePercent / 100)).toFixed(6);
            setCustomTolerableAmount(minTolerable);
          }
        } else {
          // Calculate required amountIn from requested amountOut
          const parsedOut = ethers.parseEther(amountOut);
          const amounts = await router.getAmountsIn(parsedOut, path);
          const inEther = ethers.formatEther(amounts[0]);
          setAmountIn(inEther);

          // Update tolerable slot automatically if user hasn't typed a custom override
          if (!isCustomTolerableLocked) {
            const maxTolerable = (parseFloat(inEther) * (1 + slippagePercent / 100)).toFixed(6);
            setCustomTolerableAmount(maxTolerable);
          }
        }
        setIsNodeOffline(false);
      } catch (err) {
        console.warn("Quote calculation error:", err);
        if (lastEdited === 'IN') {
          setAmountOut('');
        } else {
          setAmountIn('');
        }
        if (selectedNetwork === 'anvil') {
          setIsNodeOffline(true);
        }
      } finally {
        setIsQuoting(false);
      }
    }, 300);

    return () => {
      if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);
    };
  }, [amountIn, amountOut, lastEdited, tokenInSymbol, tokenOutSymbol, router, tokens, slippagePercent, isCustomTolerableLocked, selectedNetwork]);

  // Handle Input Changes
  const handleAmountInChange = (e) => {
    const val = e.target.value;
    setLastEdited('IN');
    setAmountIn(val);
    if (!isCustomTolerableLocked) {
      setCustomTolerableAmount('');
    }
  };

  const handleAmountOutChange = (e) => {
    const val = e.target.value;
    setLastEdited('OUT');
    setAmountOut(val);
    if (!isCustomTolerableLocked) {
      setCustomTolerableAmount('');
    }
  };

  // Switch Tokens (Flip)
  const switchTokens = () => {
    setTokenInSymbol(tokenOutSymbol);
    setTokenOutSymbol(tokenInSymbol);
    setInvertRate(!invertRate);
    setIsCustomTolerableLocked(false);

    // If we were editing IN, keep the amount and re-quote as IN
    if (lastEdited === 'IN' && amountIn) {
      // Invert fields
      setAmountOut('');
    } else if (amountOut) {
      setAmountIn('');
    }
  };

  // Quick balance buttons
  const handleMax = () => {
    if (balanceIn && Number(balanceIn) > 0) {
      setLastEdited('IN');
      setAmountIn(balanceIn);
      setIsCustomTolerableLocked(false);
    }
  };

  const handleHalf = () => {
    if (balanceIn && Number(balanceIn) > 0) {
      const half = (parseFloat(balanceIn) / 2).toString();
      setLastEdited('IN');
      setAmountIn(half);
      setIsCustomTolerableLocked(false);
    }
  };

  // Slippage change handler
  const handleSlippagePreset = (percent) => {
    setSlippagePercent(percent);
    setCustomSlippageInput('');
    setIsCustomTolerableLocked(false);
    // Recalculate tolerable slot
    if (lastEdited === 'IN' && amountOut) {
      const minTol = (parseFloat(amountOut) * (1 - percent / 100)).toFixed(6);
      setCustomTolerableAmount(minTol);
    } else if (lastEdited === 'OUT' && amountIn) {
      const maxTol = (parseFloat(amountIn) * (1 + percent / 100)).toFixed(6);
      setCustomTolerableAmount(maxTol);
    }
  };

  const handleCustomSlippageChange = (e) => {
    const val = e.target.value;
    setCustomSlippageInput(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0 && num <= 50) {
      setSlippagePercent(num);
      setIsCustomTolerableLocked(false);
      if (lastEdited === 'IN' && amountOut) {
        setCustomTolerableAmount((parseFloat(amountOut) * (1 - num / 100)).toFixed(6));
      } else if (lastEdited === 'OUT' && amountIn) {
        setCustomTolerableAmount((parseFloat(amountIn) * (1 + num / 100)).toFixed(6));
      }
    }
  };

  // Tolerable slot user override
  const handleTolerableAmountChange = (e) => {
    const val = e.target.value;
    setCustomTolerableAmount(val);
    setIsCustomTolerableLocked(true);
  };

  const handleResetTolerable = () => {
    setIsCustomTolerableLocked(false);
    if (lastEdited === 'IN' && amountOut) {
      setCustomTolerableAmount((parseFloat(amountOut) * (1 - slippagePercent / 100)).toFixed(6));
    } else if (lastEdited === 'OUT' && amountIn) {
      setCustomTolerableAmount((parseFloat(amountIn) * (1 + slippagePercent / 100)).toFixed(6));
    } else {
      setCustomTolerableAmount('');
    }
  };

  // Calculated exchange rate
  const exchangeRate = useMemo(() => {
    const inVal = parseFloat(amountIn);
    const outVal = parseFloat(amountOut);
    if (!inVal || !outVal || inVal <= 0 || outVal <= 0) return null;
    if (invertRate) {
      return (inVal / outVal).toFixed(6);
    }
    return (outVal / inVal).toFixed(6);
  }, [amountIn, amountOut, invertRate]);

  // Execute Swap: Bidirectional (Exact In vs Exact Out)
  const handleSwap = async () => {
    if (!router || !signer || !tokens) return;
    setStatusMessage(null);

    try {
      setIsSwapping(true);
      const inAddr = tokens[tokenInSymbol];
      const outAddr = tokens[tokenOutSymbol];
      const path = [inAddr, outAddr];
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 mins
      const routerAddress = await router.getAddress();
      const tokenInContract = new ethers.Contract(inAddr, ABIS.ERC20, signer);

      if (lastEdited === 'IN') {
        // MODE 1: SWAP EXACT TOKENS FOR TOKENS
        const parsedAmountIn = ethers.parseEther(amountIn);

        // Determine minimum tolerable output
        let minOutWei;
        if (isCustomTolerableLocked && customTolerableAmount && Number(customTolerableAmount) > 0) {
          minOutWei = ethers.parseEther(customTolerableAmount);
        } else {
          // Use slippage percentage
          const parsedOut = ethers.parseEther(amountOut);
          const factorBps = BigInt(Math.max(0, Math.floor((100 - slippagePercent) * 100)));
          minOutWei = (parsedOut * factorBps) / 10000n;
        }

        // 1. Check & execute allowance
        setIsApproving(true);
        const allowance = await tokenInContract.allowance(account, routerAddress);
        if (allowance < parsedAmountIn) {
          const txApprove = await tokenInContract.approve(routerAddress, ethers.MaxUint256);
          await txApprove.wait();
        }
        setIsApproving(false);

        // 2. Execute swapExactTokensForTokens
        const tx = await router.swapExactTokensForTokens(
          parsedAmountIn,
          minOutWei,
          path,
          account,
          deadline
        );
        await tx.wait();
        setStatusMessage({ type: 'success', text: `Swapped ${amountIn} ${tokenInSymbol} for ${tokenOutSymbol} successfully!` });
      } else {
        // MODE 2: SWAP TOKENS FOR EXACT TOKENS
        const parsedAmountOut = ethers.parseEther(amountOut);

        // Determine maximum tolerable input
        let maxInWei;
        if (isCustomTolerableLocked && customTolerableAmount && Number(customTolerableAmount) > 0) {
          maxInWei = ethers.parseEther(customTolerableAmount);
        } else {
          // Use slippage percentage
          const parsedIn = ethers.parseEther(amountIn);
          const factorBps = BigInt(Math.floor((100 + slippagePercent) * 100));
          maxInWei = (parsedIn * factorBps) / 10000n;
        }

        // 1. Check & execute allowance for maximum tolerable amount
        setIsApproving(true);
        const allowance = await tokenInContract.allowance(account, routerAddress);
        if (allowance < maxInWei) {
          const txApprove = await tokenInContract.approve(routerAddress, ethers.MaxUint256);
          await txApprove.wait();
        }
        setIsApproving(false);

        // 2. Execute swapTokensForExactTokens
        const tx = await router.swapTokensForExactTokens(
          parsedAmountOut,
          maxInWei,
          path,
          account,
          deadline
        );
        await tx.wait();
        setStatusMessage({ type: 'success', text: `Received exactly ${amountOut} ${tokenOutSymbol} successfully!` });
      }

      // Reset form
      setAmountIn('');
      setAmountOut('');
      setCustomTolerableAmount('');
      setIsCustomTolerableLocked(false);
    } catch (err) {
      console.error("Swap error:", err);
      const errMsg = err?.reason || err?.message || 'Transaction failed';
      setStatusMessage({ type: 'error', text: errMsg });
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
    <div className="glass-panel" style={{ padding: '22px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Swap</h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
            background: '#0d111a',
            border: '1px solid #1c2433',
            padding: '4px 10px',
            borderRadius: '10px',
            fontWeight: 500,
          }}>
            {activeNetworkConfig.shortName}
          </span>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="btn-icon"
            style={{
              color: showSettings ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: showSettings ? '#19202e' : 'transparent',
            }}
            title="Swap Settings"
          >
            <Settings size={17} />
          </button>
        </div>
      </div>

      {/* Slippage & Slippage Tolerable Controls */}
      {showSettings && (
        <div style={{
          background: '#0c0f16',
          border: '1px solid #1a2232',
          borderRadius: '14px',
          padding: '14px',
          marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>
              Slippage Tolerance
            </span>
            <span style={{ fontSize: '0.8rem', color: '#60a5fa', fontWeight: 600 }}>
              {slippagePercent}%
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            {[0.1, 0.5, 1.0].map((preset) => (
              <button
                key={preset}
                onClick={() => handleSlippagePreset(preset)}
                className={`slippage-btn ${slippagePercent === preset && !customSlippageInput ? 'active' : ''}`}
                style={{ flex: 1 }}
              >
                {preset}%
              </button>
            ))}
            <div style={{ flex: 1.2, position: 'relative' }}>
              <input
                type="number"
                placeholder="Custom"
                value={customSlippageInput}
                onChange={handleCustomSlippageChange}
                style={{
                  width: '100%',
                  background: '#141923',
                  border: customSlippageInput ? '1px solid var(--accent-border)' : '1px solid #212a3b',
                  borderRadius: '8px',
                  padding: '4px 18px 4px 8px',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  outline: 'none',
                  textAlign: 'right',
                }}
              />
              <span style={{ position: 'absolute', right: '6px', top: '5px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>%</span>
            </div>
          </div>

          {/* User Requested: Slot to input max/min tolerable amount directly due to slippage */}
          <div style={{
            borderTop: '1px solid #171d2b',
            paddingTop: '10px',
            marginTop: '10px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {lastEdited === 'IN' ? 'Min Tolerable Output' : 'Max Tolerable Input'}
              </span>
              {isCustomTolerableLocked ? (
                <button
                  onClick={handleResetTolerable}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#60a5fa',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Reset to Auto
                </button>
              ) : (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Auto-calculated</span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="number"
                placeholder={lastEdited === 'IN' ? 'Min tokens to receive' : 'Max tokens to pay'}
                value={customTolerableAmount}
                onChange={handleTolerableAmountChange}
                style={{
                  flex: 1,
                  background: '#141923',
                  border: isCustomTolerableLocked ? '1px solid #3b82f6' : '1px solid #212a3b',
                  borderRadius: '8px',
                  padding: '6px 10px',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  outline: 'none',
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                {lastEdited === 'IN' ? tokenOutSymbol : tokenInSymbol}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Offline Alert */}
      {isNodeOffline && selectedNetwork === 'anvil' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 14px',
          borderRadius: '12px',
          background: 'var(--warning-subtle)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          color: '#fbbf24',
          fontSize: '0.85rem',
          marginBottom: '16px',
        }}>
          <AlertCircle size={16} />
          <span>Local node not running at 127.0.0.1:8545. Switch to Sepolia tab above.</span>
        </div>
      )}

      {/* Status Message Notification */}
      {statusMessage && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 14px',
          borderRadius: '12px',
          background: statusMessage.type === 'success' ? 'var(--success-subtle)' : 'var(--error-subtle)',
          border: statusMessage.type === 'success' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
          color: statusMessage.type === 'success' ? '#34d399' : '#fca5a5',
          fontSize: '0.85rem',
          marginBottom: '16px',
        }}>
          {statusMessage.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          <span style={{ flex: 1, wordBreak: 'break-word' }}>{statusMessage.text}</span>
        </div>
      )}

      {/* Input 1: "You pay" */}
      <div className="input-container" style={{ marginBottom: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 500 }}>You pay</span>
          {account && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <Wallet size={12} />
              <span>Balance: {formatBalance(balanceIn)}</span>
              <button
                onClick={handleHalf}
                style={{
                  background: '#161d2a',
                  border: '1px solid #232d3f',
                  borderRadius: '6px',
                  color: 'var(--text-secondary)',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  padding: '2px 6px',
                  cursor: 'pointer',
                }}
              >
                50%
              </button>
              <button
                onClick={handleMax}
                style={{
                  background: 'var(--accent-subtle)',
                  border: '1px solid var(--accent-border)',
                  borderRadius: '6px',
                  color: '#60a5fa',
                  fontSize: '0.72rem',
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
            onChange={handleAmountInChange}
          />
          <div className="token-badge">
            <span>{tokenInSymbol}</span>
          </div>
        </div>
      </div>

      {/* Center Flip Arrow */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: '-11px 0', position: 'relative', zIndex: 2 }}>
        <button
          onClick={switchTokens}
          style={{
            background: '#121620',
            padding: '7px',
            borderRadius: '10px',
            border: '1px solid #202737',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)',
            transition: 'transform 0.2s ease, border-color 0.15s',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'rotate(180deg)';
            e.currentTarget.style.borderColor = '#3b82f6';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'rotate(0deg)';
            e.currentTarget.style.borderColor = '#202737';
          }}
          title="Switch Tokens"
        >
          <ArrowDown size={15} />
        </button>
      </div>

      {/* Input 2: "You receive" (Bidirectional - completely editable!) */}
      <div className="input-container" style={{ marginTop: '4px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 500 }}>You receive</span>
            {isQuoting && (
              <span style={{ fontSize: '0.75rem', color: '#60a5fa' }}>fetching best price...</span>
            )}
          </div>
          {account && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <Wallet size={12} />
              <span>Balance: {formatBalance(balanceOut)}</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input
            type="number"
            placeholder="0"
            className="token-input"
            value={amountOut}
            onChange={handleAmountOutChange}
          />
          <div className="token-badge">
            <span>{tokenOutSymbol}</span>
          </div>
        </div>
      </div>

      {/* Live Exchange Rate & Execution Mode Pill */}
      {exchangeRate && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '14px',
          padding: '0 4px',
        }}>
          <div
            className="rate-pill"
            onClick={() => setInvertRate(!invertRate)}
            title="Click to invert exchange rate"
          >
            <span>
              1 {invertRate ? tokenOutSymbol : tokenInSymbol} ≈ {exchangeRate} {invertRate ? tokenInSymbol : tokenOutSymbol}
            </span>
            <ArrowUpDown size={12} color="var(--text-muted)" />
          </div>

          <span style={{
            fontSize: '0.75rem',
            color: lastEdited === 'IN' ? '#34d399' : '#60a5fa',
            background: lastEdited === 'IN' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)',
            padding: '3px 8px',
            borderRadius: '6px',
            fontWeight: 500,
          }}>
            {lastEdited === 'IN' ? 'Exact Pay' : 'Exact Receive'}
          </span>
        </div>
      )}

      {/* Trade Breakdown Summary Box */}
      {(amountIn && amountOut && Number(amountIn) > 0 && Number(amountOut) > 0) && (
        <div style={{
          background: '#0a0d14',
          border: '1px solid #171d2b',
          borderRadius: '12px',
          padding: '12px 14px',
          marginBottom: '16px',
          fontSize: '0.8rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
            <span>{lastEdited === 'IN' ? 'Min. Output Received' : 'Max. Input Required'}</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
              {customTolerableAmount ? `${customTolerableAmount} ${lastEdited === 'IN' ? tokenOutSymbol : tokenInSymbol}` : '—'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
            <span>Slippage Tolerance</span>
            <span style={{ color: 'var(--text-primary)' }}>{slippagePercent}%</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
            <span>Liquidity Provider Fee (0.3%)</span>
            <span style={{ color: 'var(--text-primary)' }}>
              {(parseFloat(amountIn) * 0.003).toFixed(5)} {tokenInSymbol}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
            <span>Routing</span>
            <span style={{ color: '#60a5fa' }}>
              {tokenInSymbol} &rarr; {tokenOutSymbol} (10x Router)
            </span>
          </div>
        </div>
      )}

      {/* Action Button */}
      {!account ? (
        <button
          className="btn btn-primary"
          style={{ width: '100%', padding: '15px', fontSize: '1.05rem' }}
          onClick={connectWallet}
        >
          Connect Wallet
        </button>
      ) : !isCorrectNetwork ? (
        <button
          className="btn"
          style={{
            width: '100%',
            padding: '15px',
            fontSize: '0.98rem',
            background: '#b91c1c',
            color: '#ffffff',
            fontWeight: 600,
            borderRadius: '14px',
          }}
          onClick={() => switchWalletToNetwork(selectedNetwork)}
        >
          Switch Wallet to {activeNetworkConfig.name}
        </button>
      ) : (!amountIn || Number(amountIn) <= 0) && (!amountOut || Number(amountOut) <= 0) ? (
        <button className="btn btn-secondary" style={{ width: '100%', padding: '15px', fontSize: '1rem' }} disabled>
          Enter an amount
        </button>
      ) : (
        <button
          className="btn btn-primary"
          style={{ width: '100%', padding: '15px', fontSize: '1.05rem' }}
          onClick={handleSwap}
          disabled={isSwapping || isApproving || isQuoting || !amountOut || !amountIn}
        >
          {isApproving
            ? 'Approving Router...'
            : isSwapping
            ? 'Executing Swap...'
            : isQuoting
            ? 'Calculating...'
            : `Swap ${tokenInSymbol} for ${tokenOutSymbol}`}
        </button>
      )}
    </div>
  );
}
