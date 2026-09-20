import React, { useState, useEffect } from 'react';
import { Settings, ArrowDown } from 'lucide-react';
import { ethers } from 'ethers';
import { useWeb3 } from '../hooks/useWeb3';
import { TOKENS, ABIS } from '../utils/contracts';

export default function SwapCard() {
  const { account, connectWallet, router, signer } = useWeb3();
  const [tokenInSymbol, setTokenInSymbol] = useState('10X');
  const [tokenOutSymbol, setTokenOutSymbol] = useState('AYO');
  const [amountIn, setAmountIn] = useState('');
  const [amountOut, setAmountOut] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);

  // Auto-calculate expected output
  useEffect(() => {
    const fetchQuote = async () => {
      if (!amountIn || !router || isNaN(amountIn)) {
        setAmountOut('');
        return;
      }
      try {
        const parsedAmount = ethers.parseEther(amountIn);
        const path = [TOKENS[tokenInSymbol], TOKENS[tokenOutSymbol]];
        const amounts = await router.getAmountsOut(parsedAmount, path);
        setAmountOut(ethers.formatEther(amounts[1]));
      } catch (err) {
        console.error("No route or insufficient liquidity", err);
        setAmountOut('');
      }
    };
    const timeout = setTimeout(fetchQuote, 500); // debounce
    return () => clearTimeout(timeout);
  }, [amountIn, tokenInSymbol, tokenOutSymbol, router]);

  const switchTokens = () => {
    setTokenInSymbol(tokenOutSymbol);
    setTokenOutSymbol(tokenInSymbol);
    setAmountIn('');
    setAmountOut('');
  };

  const handleSwap = async () => {
    if (!router || !signer) return;
    try {
      setIsSwapping(true);
      const parsedAmountIn = ethers.parseEther(amountIn);
      // We accept 0.5% slippage
      const amountOutMin = (ethers.parseEther(amountOut) * 995n) / 1000n; 
      const path = [TOKENS[tokenInSymbol], TOKENS[tokenOutSymbol]];
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 mins from now

      // 1. Approve router to spend tokenIn
      setIsApproving(true);
      const tokenContract = new ethers.Contract(TOKENS[tokenInSymbol], ABIS.ERC20, signer);
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
      alert('Swap successful!');
      setAmountIn('');
      setAmountOut('');
    } catch (err) {
      console.error(err);
      alert('Swap failed. Check console for details.');
    } finally {
      setIsApproving(false);
      setIsSwapping(false);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Swap</h2>
        <button className="btn-icon">
          <Settings size={20} />
        </button>
      </div>

      {/* Input */}
      <div className="input-container" style={{ marginBottom: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>You pay</span>
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
            transition: 'transform 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <ArrowDown size={16} color="var(--text-secondary)" />
        </div>
      </div>

      {/* Output */}
      <div className="input-container" style={{ marginTop: '4px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>You receive</span>
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
        <button className="btn btn-primary" style={{ width: '100%', padding: '16px', fontSize: '1.1rem' }} onClick={connectWallet}>
          Connect Wallet
        </button>
      ) : !amountIn ? (
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
          {isApproving ? 'Approving...' : isSwapping ? 'Swapping...' : 'Swap'}
        </button>
      )}
    </div>
  );
}
